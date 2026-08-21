// Catalogue complet des fournisseurs — voie DOCUMENTÉE : `GET /provider` du
// serveur headless OpenCode (opencode.ai/docs/server), qui distingue
// explicitement `all` (catalogue entier, indépendant de toute configuration
// locale) de `connected` (fournisseurs authentifiés). C'est la réponse au
// constat 2026-08-21 : le contrat ACP (`configOptions`) ne rend que
// l'utilisable ici et maintenant — il ne montrera jamais Anthropic, Google,
// OpenRouter… tant qu'ils ne sont pas connectés. Le catalogue, si.
//
// Forme mesurée à charge réelle (OpenCode 1.18.11) :
//   { all: [{id, name, source, env, models: {clé: {name?, id?, …}}}],
//     default: {fournisseur: modèle}, connected: ["opencode", …] }
// L'identifiant complet d'un modèle est `${providerID}/${clé}` — la clé peut
// elle-même contenir un « / » (ex. hpc-ai/deepseek/deepseek-v4-flash) : les
// aides existantes (grouperParProvider coupe au PREMIER « / ») y survivent.

/** Un modèle du catalogue, tel que déclaré par le serveur. */
export interface ModeleCatalogue {
  /** Identifiant complet « fournisseur/clé » — forme attendue partout. */
  id: string;
  /** Clé telle quelle dans la carte `models` (peut contenir un « / »). */
  slug: string;
  /** Nom lisible fourni par le serveur. */
  nom?: string;
}

/** Un fournisseur du catalogue, avec son état de connexion. */
export interface FournisseurCatalogue {
  id: string;
  nom: string;
  /** Authentifié sur cette machine → modèles immédiatement utilisables. */
  connecte: boolean;
  modeles: ModeleCatalogue[];
}

/**
 * Parse la réponse de `GET /provider`. Défensif : entrées non conformes
 * ignorées, doublons dédupliqués, `connected` absent → aucun. L'ordre du
 * serveur est conservé (le tri d'affichage est l'affaire de trierCatalogue).
 */
export function parserCatalogue(reponse: unknown): FournisseurCatalogue[] {
  const r = (reponse ?? {}) as {
    all?: unknown;
    connected?: unknown;
  };
  if (!Array.isArray(r.all)) return [];
  const connectes = new Set(
    Array.isArray(r.connected) ? r.connected.filter((c): c is string => typeof c === "string") : [],
  );
  const vus = new Set<string>();
  const resultats: FournisseurCatalogue[] = [];
  for (const brut of r.all) {
    const p = (brut ?? {}) as { id?: unknown; name?: unknown; models?: unknown };
    if (typeof p.id !== "string" || !p.id || vus.has(p.id)) continue;
    vus.add(p.id);
    const modeles: ModeleCatalogue[] = [];
    if (p.models && typeof p.models === "object") {
      for (const [slug, m] of Object.entries(p.models as Record<string, unknown>)) {
        if (!slug) continue;
        const nom =
          m && typeof m === "object" && typeof (m as { name?: unknown }).name === "string"
            ? ((m as { name: string }).name || undefined)
            : undefined;
        modeles.push({ id: `${p.id}/${slug}`, slug, nom });
      }
    }
    resultats.push({
      id: p.id,
      nom: typeof p.name === "string" && p.name ? p.name : p.id,
      connecte: connectes.has(p.id),
      modeles,
    });
  }
  return resultats;
}

/**
 * Ordre d'affichage : fournisseurs CONNECTÉS d'abord (dans l'ordre déclaré),
 * puis le reste du catalogue par nom. Un catalogue de 193 entrées ne se
 * navigue qu'avec le filtre — mais l'ordre de repos doit quand même donner
 * l'utile avant le possible.
 */
export function trierCatalogue(liste: FournisseurCatalogue[]): FournisseurCatalogue[] {
  return [...liste].sort((a, b) => {
    if (a.connecte !== b.connecte) return a.connecte ? -1 : 1;
    const na = a.nom.toLowerCase();
    const nb = b.nom.toLowerCase();
    return na < nb ? -1 : na > nb ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Le fournisseur auquel appartient un identifiant de modèle complet.
 *  Préfixe exact `${id}/` — jamais une devinette de sous-chaîne. */
export function fournisseurDeId(
  catalogue: FournisseurCatalogue[],
  modeleId: string,
): FournisseurCatalogue | null {
  for (const f of catalogue) {
    if (modeleId.startsWith(f.id + "/")) return f;
  }
  return null;
}
