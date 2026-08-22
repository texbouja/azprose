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

/** Base de la passerelle REST d'un fournisseur maison, ou null si le
 *  diagnostic ne s'y applique pas (fournisseur tiers). */
export function urlPasserelle(fournisseur: string): string | null {
  if (fournisseur === "opencode-go") return "https://opencode.ai/zen/go/v1";
  if (fournisseur === "opencode") return "https://opencode.ai/zen/v1";
  return null;
}

export interface VerdictQuota {
  /** Message VERBATIM de la passerelle (« Weekly usage limit reached. … »). */
  message: string;
  /** URL d'espace de travail citée dans le message, s'il y en a une — le
   *  pied de panneau en fait un lien : le refus dit quoi faire, encore
   *  faut-il pouvoir y aller en un clic. */
  url?: string;
}

/** Première URL http(s) du message. La ponctuation finale d'une phrase
 *  (« … sur https://opencode.ai/workspace. ») ne fait pas partie du lien. */
export function urlDuMessage(message: string): string | undefined {
  const m = /https?:\/\/[^\s<>"')\]]+/.exec(message);
  return m ? m[0].replace(/[.,;:!?]+$/, "") : undefined;
}

export interface DepsQuota {
  /** Id de fournisseur (« opencode-go », « opencode », …). */
  fournisseur: string;
  /** Slug du modèle (« ox-alpha-free »). */
  modele: string;
  /** Clé API locale du fournisseur connecté ; absente → non concluant. */
  cle?: string | null;
  fetchImpl?: typeof fetch;
}

/** Interroge la passerelle avec une micro-requête (max_tokens=4) :
 *  429 → verdict {message} ; tout autre cas → null (non concluant). */
export async function diagnostiquerQuota(
  deps: DepsQuota,
): Promise<VerdictQuota | null> {
  const base = urlPasserelle(deps.fournisseur);
  if (!base || !deps.cle) return null;
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
    if (rep.status !== 429) return null;
    const corps = (await rep.json().catch(() => null)) as {
      error?: { message?: unknown };
    } | null;
    const message = corps?.error?.message;
    if (typeof message !== "string" || !message) return null;
    const url = urlDuMessage(message);
    return url ? { message, url } : { message };
  } catch {
    // Passerelle injoignable : diagnostic impossible, pas une conclusion.
    return null;
  }
}
