// `GET /config/providers` du serveur headless OpenCode — la source des
// informations LOCALES d'un fournisseur : sa clé API telle que la machine la
// connaît, et l'URL de son API telle que le serveur la déclare.
//
// Pourquoi pas `GET /provider` (utilisé jusqu'au 2026-08-22) :
//   · POIDS — 5,3 Mo (193 fournisseurs, 7 196 modèles) parsés sur le thread
//     principal à CHAQUE sélection de modèle et à chaque diagnostic de
//     silence, pour en extraire UNE chaîne. Ici : 23,9 Ko, ≈ 230× moins.
//   · JUSTESSE — mesuré : `/provider` porte `.key` pour `opencode-go` mais
//     PAS pour `opencode`, dont la clé vit dans `options.apiKey`. La
//     vérification de passerelle ne se déclenchait donc JAMAIS pour les
//     modèles `opencode/*`. `/config/providers` porte les DEUX formes.
//
// Bonus mesuré (2026-08-22) : chaque modèle y déclare `api.url` — la base de
// la passerelle, identique pour tous les modèles d'un fournisseur. Plus
// besoin de coder les URL en dur, ni d'un second appel `/api/provider/{id}`.
//
// Module PUR : le parsing seul. Le transport reste au panneau.

export interface FournisseurLocal {
  id: string;
  /** Clé API locale, quelle que soit la forme où le serveur la range.
   *  null = fournisseur non connecté sur cette machine. */
  cle: string | null;
  /** Base de l'API déclarée par le serveur (sans slash final), ou null. */
  urlApi: string | null;
}

/** Première URL d'API trouvée parmi les modèles — elles sont identiques
 *  pour un même fournisseur (mesuré), la première suffit. */
function urlApiDe(models: unknown): string | null {
  if (!models || typeof models !== "object") return null;
  for (const m of Object.values(models as Record<string, unknown>)) {
    const url = (m as { api?: { url?: unknown } })?.api?.url;
    if (typeof url === "string" && url) return url.replace(/\/+$/, "");
  }
  return null;
}

/**
 * Parse la réponse. Défensif : entrées non conformes ignorées, formes
 * absentes → null (l'appelant traite ça comme « pas pu vérifier », jamais
 * comme un feu vert). Indexé par id de fournisseur.
 */
export function parserConfigProviders(reponse: unknown): Map<string, FournisseurLocal> {
  const carte = new Map<string, FournisseurLocal>();
  const liste = (reponse as { providers?: unknown })?.providers;
  if (!Array.isArray(liste)) return carte;
  for (const brut of liste) {
    const p = (brut ?? {}) as {
      id?: unknown;
      key?: unknown;
      options?: { apiKey?: unknown };
      models?: unknown;
    };
    if (typeof p.id !== "string" || !p.id || carte.has(p.id)) continue;
    // Les deux formes mesurées : `key` (opencode-go) et `options.apiKey`
    // (opencode). Ne jamais privilégier l'une : c'est ce biais qui rendait
    // le diagnostic muet pour la moitié des modèles maison.
    const directe = typeof p.key === "string" && p.key ? p.key : null;
    const enOption =
      typeof p.options?.apiKey === "string" && p.options.apiKey ? p.options.apiKey : null;
    carte.set(p.id, { id: p.id, cle: directe ?? enOption, urlApi: urlApiDe(p.models) });
  }
  return carte;
}
