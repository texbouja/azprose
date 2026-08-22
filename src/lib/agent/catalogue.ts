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
 * puis le reste du catalogue par POPULARITÉ (retour utilisateur 2026-08-21) :
 * la maison (opencode zen/go), les éditeurs célèbres dans un ordre imposé,
 * les autres éditeurs connus, enfin agrégateurs et fournisseurs d'accès ;
 * le long tail inclassable ferme la marche, alphabétique au sein de chaque
 * groupe.
 */
// Ids VÉRIFIÉS sur le catalogue réel (OpenCode 1.18.11, `GET /provider` —
// sonde du 2026-08-21) : jamais d'id deviné. Une « famille » = id exact ou
// préfixe `id-`, pour que les variantes officielles (plans, -cn, vertex)
// restent groupées avec leur éditeur (« google » attire google-vertex et
// google-vertex-anthropic ; « moonshotai » attire moonshotai-cn — l'id réel
// n'est PAS « moonshot » ; « zai » n'attire PAS zhipuai).
const FAMILLES_CELEBRES = [
  "opencode", // maison — zen/go, l'éditeur du produit lui-même
  "openai",
  "anthropic",
  "google",
  "alibaba", // + plans -cn/-coding-plan/-token-plan
  "deepseek",
  "moonshotai",
  "zai", // + zai-coding-plan
];

/** Autres éditeurs de modèles connus (ordre alphabétique au sein du groupe). */
const EDITEURS = [
  "amazon-bedrock",
  "azure",
  "cohere",
  "github-copilot",
  "kimi-for-coding", // plan officiel de Moonshot, id sans le préfixe commun
  "longcat",
  "meta",
  "minimax",
  "mistral",
  "nvidia",
  "perplexity",
  "sarvam",
  "stepfun",
  "tencent",
  "thinkingmachines",
  "upstage",
  "watsonx",
  "xiaomi",
  "xai",
  "zhipuai",
];

/** Agrégateurs et fournisseurs d'accès (gateways, clouds d'inférence). */const AGREGATEURS = [
  "302ai",
  "cerebras",
  "chutes",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "deepinfra",
  "digitalocean",
  "fireworks-ai",
  "gitlab",
  "groq",
  "helicone",
  "hetzner",
  "hpc-ai",
  "huggingface",
  "infomaniak",
  "io-net",
  "lmstudio",
  "llmgateway",
  "modal",
  "modelscope",
  "nano-gpt",
  "nebius",
  "novita-ai",
  "ollama-cloud",
  "openrouter",
  "ovhcloud",
  "poe",
  "requesty",
  "scaleway",
  "siliconflow",
  "togetherai",
  "venice",
  "vercel",
  "v0",
  "vultr",
];

/** Fournisseurs POPULAIRES dont la connexion officielle est une simple clé
 *  API, alors que `GET /provider/auth` ne déclare AUCUNE méthode (mesuré
 *  2026-08-22 : anthropic, google, deepseek… tous `null`). Pour ceux-ci le
 *  dialogue propose directement le formulaire de clé — `PUT /auth/{id}` est
 *  générique et le serveur les marque connectés immédiatement (validé de
 *  bout en bout). Hors liste (locaux type ollama/lmstudio qui exigent une
 *  URL, clouds à credentials composés type bedrock) : comportement inchangé. */
export const CLE_API_SANS_METHODE: ReadonlySet<string> = new Set([
  // Familles célèbres (hors maison opencode, déjà connectée d'office)
  "anthropic",
  "google",
  "deepseek",
  "moonshotai",
  "alibaba",
  "zai",
  "zhipuai",
  // Éditeurs officiels documentés par OpenCode
  "mistral",
  "perplexity",
  "nvidia",
  "meta",
  "cohere",
  "groq",
  "huggingface",
  "cloudflare-ai-gateway",
  "kimi-for-coding",
  "minimax",
  "longcat",
  "upstage",
  "stepfun",
  // Agrégateurs majeurs à clé unique
  "openrouter",
  "cerebras",
  "togetherai",
  "fireworks-ai",
  "deepinfra",
  "nano-gpt",
  "chutes",
  "modelscope",
]);

function familleDe(id: string, base: string): boolean {
  return id === base || id.startsWith(base + "-");
}

/** Rang de popularité : index imposé pour les célébrités, sinon groupe
 *  (éditeurs 100, agrégateurs 200, reste 300). */
function rangFournisseur(id: string): number {
  for (let i = 0; i < FAMILLES_CELEBRES.length; i++) {
    if (familleDe(id, FAMILLES_CELEBRES[i])) return i;
  }
  if (EDITEURS.some((e) => familleDe(id, e))) return 100;
  if (AGREGATEURS.some((a) => familleDe(id, a))) return 200;
  return 300;
}

export function trierCatalogue(liste: FournisseurCatalogue[]): FournisseurCatalogue[] {
  return [...liste].sort((a, b) => {
    if (a.connecte !== b.connecte) return a.connecte ? -1 : 1;
    const ra = rangFournisseur(a.id);
    const rb = rangFournisseur(b.id);
    if (ra !== rb) return ra < rb ? -1 : 1;
    const na = a.nom.toLowerCase();
    const nb = b.nom.toLowerCase();
    return na < nb ? -1 : na > nb ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Les deux moitiés d'un identifiant complet `fournisseur/modèle`, coupé au
 *  PREMIER « / » (la clé du modèle peut en contenir : hpc-ai/deepseek/…).
 *  null si la forme n'y est pas — un identifiant sans « / », ou dont une
 *  moitié est vide, n'a pas de fournisseur, et le prétendre produisait des
 *  chaînes absurdes (`slice(0, -1)` rendait l'id amputé de son dernier
 *  caractère). SEULE fonction autorisée à faire ce découpage. */
export function decouperIdModele(
  modeleId: string,
): { fournisseur: string; modele: string } | null {
  const i = modeleId.indexOf("/");
  if (i <= 0 || i === modeleId.length - 1) return null;
  return { fournisseur: modeleId.slice(0, i), modele: modeleId.slice(i + 1) };
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

/**
 * Applique la curation utilisateur au catalogue brut : ne gardent que les
 * fournisseurs NON connectés ET cochés dans les réglages. Les connectés sont
 * exclus ici car le sélecteur les affiche à part (section « Actifs » via
 * `configOptions`) — et ils restent visibles même non cochés : actifs par
 * nature, la curation ne concerne que l'offre possible.
 */
export function filtrerCatalogue(
  liste: FournisseurCatalogue[],
  selection: string[],
): FournisseurCatalogue[] {
  const coches = new Set(selection);
  return liste.filter((f) => !f.connecte && coches.has(f.id));
}
