/**
 * Composition des diagrammes Mermaid.
 *
 * La bibliothèque est chargée **à la demande** : mesurée à ~950 Ko pour un
 * premier flowchart (socle d3 + type de diagramme), puis quelques dizaines à
 * centaines de Ko par type supplémentaire. Un document sans diagramme ne paie
 * donc rien — c'est la même règle que MathJax (`typeset-math.ts`), et elle est
 * la condition de l'intégration.
 *
 * Le rendu passe par `mermaid.render()`, qui rend une CHAÎNE SVG sans toucher
 * au document : c'est ce qui permet de composer aussi bien dans le DOM affiché
 * que dans un fragment détaché (impression). `mermaid.run()`, qui balaye la
 * page et rend en place, serait inadapté — notre DOM est reconstruit à chaque
 * rendu de l'aperçu.
 */

import { escapeHtml } from "@/markdown/highlight";

type MermaidApi = typeof import("mermaid")["default"];

/** Thèmes Mermaid retenus — les deux thèmes intégrés, jamais `base`.
 *  Dériver une palette de nos tokens demanderait des hexadécimaux résolus à
 *  l'exécution et un recalcul de dizaines de couleurs par le moteur de thème
 *  de Mermaid : fragile pour un gain esthétique. */
export type MermaidTheme = "default" | "dark";

let api: MermaidApi | null = null;
let chargement: Promise<MermaidApi> | null = null;
let themeInitialise: MermaidTheme | null = null;

/**
 * Thème Mermaid à employer, dérivé du `color-scheme` effectif du document.
 *
 * `tokens.css` déclare `color-scheme: light|dark` pour CHAQUE thème : lire la
 * valeur calculée suit donc automatiquement tout thème ajouté plus tard. Une
 * liste de noms de thèmes en dur (ce que fait l'antériorité `markamd`) ferait
 * silencieusement passer un nouveau thème clair pour un thème sombre.
 */
export function themeMermaidDepuisScheme(scheme: string | null | undefined): MermaidTheme {
  return (scheme ?? "").toLowerCase().includes("dark") ? "dark" : "default";
}

/** Thème courant du document (webview uniquement). */
export function themeMermaidCourant(): MermaidTheme {
  if (typeof document === "undefined") return "default";
  return themeMermaidDepuisScheme(getComputedStyle(document.documentElement).colorScheme);
}

function config(theme: MermaidTheme) {
  return {
    startOnLoad: false,
    theme,
    // `strict` : le HTML des libellés est encodé, les interactions `click` de
    // Mermaid sont désactivées. La source d'un diagramme reste du texte, y
    // compris quand elle vient d'ailleurs (copier-coller, assistant).
    securityLevel: "strict" as const,
    // Police de l'application, jamais une police en dur : un diagramme doit
    // s'accorder au document qui l'entoure.
    fontFamily: "var(--font-doc, ui-sans-serif, system-ui, sans-serif)",
  };
}

async function charger(theme: MermaidTheme): Promise<MermaidApi> {
  if (api) return api;
  if (!chargement) {
    chargement = import("mermaid").then((mod) => {
      mod.default.initialize(config(theme));
      themeInitialise = theme;
      api = mod.default;
      return mod.default;
    });
  }
  return chargement;
}

/** Message d'erreur lisible. `parse()` distingue une syntaxe fautive (erreur
 *  portant la ligne) d'un type de diagramme inconnu — mesuré en sonde. */
function messageErreur(err: unknown): string {
  const brut = err instanceof Error ? err.message : String(err);
  const premiere = brut.split("\n")[0].trim();
  return premiere.length > 160 ? `${premiere.slice(0, 157)}…` : premiere;
}

let compteur = 0;

/**
 * Compose tous les porteurs Mermaid non encore rendus de `root`.
 *
 * Séquentiel À DESSEIN : Mermaid sérialise ses rendus en interne (file
 * d'exécution), paralléliser n'apporterait rien et rendrait l'ordre des
 * identifiants imprévisible.
 *
 * En cas d'échec, le porteur garde sa source et reçoit le message d'erreur :
 * un diagramme fautif se corrige, il ne disparaît pas.
 */
export async function renderMermaidBlocks(
  root: ParentNode,
  theme: MermaidTheme = themeMermaidCourant(),
): Promise<number> {
  const blocs = Array.from(
    root.querySelectorAll<HTMLElement>(".mdv-mermaid:not(.is-rendered):not(.is-error)"),
  );
  if (blocs.length === 0) return 0;

  const mermaid = await charger(theme);
  if (themeInitialise !== theme) {
    mermaid.initialize(config(theme));
    themeInitialise = theme;
  }

  let rendus = 0;
  for (const bloc of blocs) {
    const source = bloc.getAttribute("data-mermaid-source") ?? "";
    if (!source.trim()) continue;
    const avis = bloc.querySelector(".mdv-mermaid__notice")?.outerHTML ?? "";
    try {
      const { svg } = await mermaid.render(`mdv-mermaid-${++compteur}`, source);
      bloc.innerHTML = svg + avis;
      bloc.classList.add("is-rendered");
      rendus++;
    } catch (err) {
      // La source est REMISE telle quelle : c'est elle que l'utilisateur doit
      // corriger, et l'effacer lui retirerait son travail.
      bloc.innerHTML =
        `<p class="mdv-mermaid__error">${escapeHtml(messageErreur(err))}</p>` +
        `<pre class="mdv-mermaid__source"><code>${escapeHtml(source)}</code></pre>` +
        avis;
      bloc.classList.add("is-error");
    }
  }
  return rendus;
}

/**
 * Variante CHAÎNE → CHAÎNE, pour les pipelines qui n'ont pas de DOM affiché
 * (impression). Le document produit ne contient alors que du SVG statique :
 * aucun script, aucun réseau — contrairement au chemin MathJax de l'export,
 * qui dépend d'un CDN.
 */
export async function renderMermaidInHtml(
  html: string,
  theme: MermaidTheme = themeMermaidCourant(),
): Promise<string> {
  if (!html.includes("mdv-mermaid") || typeof document === "undefined") return html;
  const gabarit = document.createElement("template");
  gabarit.innerHTML = html;
  await renderMermaidBlocks(gabarit.content, theme);
  return gabarit.innerHTML;
}

/** Remise à zéro — tests uniquement. */
export function _reinitialiserPourTests(): void {
  api = null;
  chargement = null;
  themeInitialise = null;
}
