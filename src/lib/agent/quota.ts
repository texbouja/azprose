// Diagnostic de quota auprès des passerelles « maison » d'OpenCode.
//
// Mesuré (2026-08-22, sondes /tmp/opencode/sonde-go-* et curl direct) : sur
// quota épuisé, la passerelle répond en ~0,5 s par un HTTP 429 portant le
// motif EXPLICITE (« Weekly usage limit reached. Resets in 1 day. … », avec
// l'URL du workspace pour activer le basculement sur solde) — alors que la
// requête ACP session/prompt, elle, reste suspendue indéfiniment (l'agent
// retente en boucle sans émettre rien, cancel inclus).
//
// On interroge donc la passerelle DIRECTEMENT avec la clé locale (déjà dans
// GET /provider pour les fournisseurs connectés) quand un prompt reste
// muet : un 429 est verdict immédiat — on affiche le message réel au lieu
// d'un spinner. Tout le reste (200, autre statut, erreur réseau) est NON
// CONCLUANT : on n'en déduit rien et on laisse le chien de garde agir.
//
// Module PUR : le fetch est injecté (plugin-http côté app, faux fetch en test).

/**
 * Le diagnostic s'applique-t-il à ce fournisseur ? Seulement aux passerelles
 * MAISON : la sonde poste une complétion de forme OpenAI, et seul leur 429
 * a été mesuré. L'envoyer à une API d'une autre forme (Anthropic, par ex.)
 * rendrait un 404 qu'on lirait « pas pu vérifier » — un avertissement à
 * chaque sélection, pour rien.
 */
export function estPasserelleMaison(fournisseur: string): boolean {
  return fournisseur === "opencode-go" || fournisseur === "opencode";
}

/**
 * Base de la passerelle REST, ou null si le diagnostic ne s'y applique pas.
 *
 * `urlDeclaree` vient du serveur (`/config/providers` → `api.url`) et fait
 * foi ; les deux constantes restent le REPLI si l'appel a échoué. Coder ces
 * URL en dur était le point faible : elles appartiennent à OpenCode, pas à
 * nous.
 */
export function urlPasserelle(fournisseur: string, urlDeclaree?: string | null): string | null {
  if (!estPasserelleMaison(fournisseur)) return null;
  if (urlDeclaree) return urlDeclaree.replace(/\/+$/, "");
  return fournisseur === "opencode-go"
    ? "https://opencode.ai/zen/go/v1"
    : "https://opencode.ai/zen/v1";
}

/** Première URL http(s) du message. La ponctuation finale d'une phrase
 *  (« … sur https://opencode.ai/workspace. ») ne fait pas partie du lien. */
export function urlDuMessage(message: string): string | undefined {
  const m = /https?:\/\/[^\s<>"')\]]+/.exec(message);
  return m ? m[0].replace(/[.,;:!?]+$/, "") : undefined;
}

/** Pourquoi le diagnostic n'a rien pu conclure. Chacune de ces raisons est
 *  un AVERTISSEMENT à remonter : « pas pu vérifier » n'est pas « sain ».
 *  C'était le trou — un échec silencieux passait pour un feu vert. */
export type RaisonIndeterminee =
  /** Aucune clé locale pour ce fournisseur (serveur muet, non connecté…). */
  | "cle-introuvable"
  /** La passerelle n'a pas répondu (réseau, DNS, TLS). */
  | "passerelle-injoignable"
  /** Un 429 sans motif exploitable — refus certain, raison inconnue. */
  | "reponse-inattendue";

export type ResultatQuota =
  /** La passerelle refuse, avec son motif verbatim. */
  | { etat: "refus"; message: string; url?: string }
  /** Vérifié : la passerelle répond normalement. */
  | { etat: "sain" }
  /** Rien à vérifier : ce fournisseur n'est pas une passerelle maison. */
  | { etat: "hors-sujet" }
  | { etat: "indetermine"; raison: RaisonIndeterminee };

export interface DepsQuota {
  /** Id de fournisseur (« opencode-go », « opencode », …). */
  fournisseur: string;
  /** Slug du modèle (« ox-alpha-free »). */
  modele: string;
  /** Clé API locale du fournisseur connecté ; absente → indéterminé. */
  cle?: string | null;
  /** URL déclarée par le serveur (`/config/providers`) ; absente → repli. */
  urlDeclaree?: string | null;
  fetchImpl?: typeof fetch;
}

/** Interroge la passerelle avec une micro-requête (max_tokens=4) :
 *  429 → refus avec le motif ; 2xx/autre → sain ; échec → indéterminé. */
export async function diagnostiquerQuota(deps: DepsQuota): Promise<ResultatQuota> {
  const base = urlPasserelle(deps.fournisseur, deps.urlDeclaree);
  if (!base) return { etat: "hors-sujet" };
  if (!deps.cle) return { etat: "indetermine", raison: "cle-introuvable" };
  try {
    const rep = await (deps.fetchImpl ?? fetch)(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: deps.modele,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 4,
      }),
    });
    // Tout sauf 429 = la passerelle nous parle : elle ne nous bloque pas.
    // (Un 401/500 ne relève pas du quota et n'empêche pas la sélection.)
    if (rep.status !== 429) return { etat: "sain" };
    const corps = (await rep.json().catch(() => null)) as {
      error?: { message?: unknown };
    } | null;
    const message = corps?.error?.message;
    // 429 sans motif : refus certain mais inexplicable — ne pas l'annoncer
    // comme sain, ne pas inventer de raison non plus.
    if (typeof message !== "string" || !message) {
      return { etat: "indetermine", raison: "reponse-inattendue" };
    }
    const url = urlDuMessage(message);
    return url ? { etat: "refus", message, url } : { etat: "refus", message };
  } catch {
    // Passerelle injoignable : diagnostic impossible, PAS un feu vert.
    return { etat: "indetermine", raison: "passerelle-injoignable" };
  }
}
