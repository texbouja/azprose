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
import { neutraliserMaths } from "@/markdown/mermaid-fence";
import {
  estFlowchart,
  listerFormules,
  poserJetons,
  remplissagePour,
  substituerFormules,
  type FormuleDiagramme,
} from "@/markdown/mermaid-math";

type MermaidApi = typeof import("mermaid")["default"];

/** Mode de base — sert de repli quand la palette du document n'est pas
 *  exploitable, et pilote la dérivation des couleurs de Mermaid. */
export type MermaidTheme = "default" | "dark";

/**
 * Apparence à donner aux diagrammes : elle est LUE sur le document, jamais
 * codée en dur. Un diagramme doit s'accorder à la page qui l'entoure — mêmes
 * polices, mêmes couleurs — sans quoi il a l'air collé par-dessus.
 */
export interface ApparenceDiagramme {
  mode: MermaidTheme;
  fontFamily: string;
  fontSize: string;
  /** Palette du document. `null` = tokens illisibles → thème intégré de
   *  Mermaid, qui reste correct. */
  couleurs: PaletteDiagramme | null;
}

export interface PaletteDiagramme {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  accent: string;
  surface: string;
  surfaceHover: string;
}

let api: MermaidApi | null = null;
let chargement: Promise<MermaidApi> | null = null;
let signatureInitialisee: string | null = null;

/**
 * Mode dérivé du `color-scheme` effectif du document.
 *
 * `tokens.css` déclare `color-scheme: light|dark` pour CHAQUE thème : lire la
 * valeur calculée suit donc automatiquement tout thème ajouté plus tard. Une
 * liste de noms de thèmes en dur (ce que fait l'antériorité `markamd`) ferait
 * silencieusement passer un nouveau thème clair pour un thème sombre.
 */
export function themeMermaidDepuisScheme(scheme: string | null | undefined): MermaidTheme {
  return (scheme ?? "").toLowerCase().includes("dark") ? "dark" : "default";
}

/** Le moteur de thème de Mermaid (khroma) ne reconnaît QUE l'hexadécimal —
 *  une couleur `rgba()` ou une variable non résolue casserait sa dérivation. */
function estHex(v: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
}

/**
 * Palette du document, lue sur les tokens CSS. Rend `null` dès qu'un seul
 * token n'est pas hexadécimal : mieux vaut le thème intégré de Mermaid,
 * cohérent, qu'une palette à moitié appliquée.
 */
export function paletteDepuisStyle(style: CSSStyleDeclaration): PaletteDiagramme | null {
  const lire = (nom: string) => style.getPropertyValue(nom).trim();
  const palette = {
    bg: lire("--bg"),
    fg: lire("--fg"),
    muted: lire("--muted"),
    border: lire("--border"),
    accent: lire("--accent"),
    surface: lire("--surface"),
    surfaceHover: lire("--surface-hover"),
  };
  return Object.values(palette).every(estHex) ? palette : null;
}

/**
 * Apparence lue sur un élément — celui dans lequel les diagrammes seront
 * affichés. Les polices viennent donc du CONTENEUR (`.mdv-prose` et ses
 * réglages de document), pas d'une constante : changer la police du document
 * change celle des diagrammes.
 */
export function apparenceDepuis(el: Element | null): ApparenceDiagramme {
  if (typeof document === "undefined") {
    return { mode: "default", fontFamily: "sans-serif", fontSize: "16px", couleurs: null };
  }
  const cible = el ?? document.documentElement;
  const style = getComputedStyle(cible);
  const racine = getComputedStyle(document.documentElement);
  return {
    mode: themeMermaidDepuisScheme(racine.colorScheme),
    fontFamily: style.fontFamily || "sans-serif",
    fontSize: style.fontSize || "16px",
    couleurs: paletteDepuisStyle(racine),
  };
}

/** Signature d'une apparence — sert à savoir s'il faut ré-initialiser Mermaid
 *  ET à invalider les diagrammes déjà composés (le SVG porte ses couleurs). */
export function signatureApparence(a: ApparenceDiagramme): string {
  const c = a.couleurs;
  return [a.mode, a.fontFamily, a.fontSize, c ? Object.values(c).join(",") : "natif"].join("|");
}

function config(a: ApparenceDiagramme) {
  const base = {
    startOnLoad: false,
    // `strict` : le HTML des libellés est encodé, les interactions `click` de
    // Mermaid sont désactivées. La source d'un diagramme reste du texte, y
    // compris quand elle vient d'ailleurs (copier-coller, assistant).
    securityLevel: "strict" as const,
    fontFamily: a.fontFamily,
  };

  // Sans palette exploitable : thèmes intégrés de Mermaid, qui gèrent
  // correctement le clair et le sombre.
  if (!a.couleurs) return { ...base, theme: a.mode };

  // `base` est le SEUL thème que Mermaid autorise à personnaliser. Il dérive
  // des dizaines de couleurs de celles qu'on lui donne — d'où le soin mis à
  // n'en fournir que des hexadécimaux, et à déclarer `darkMode` : c'est lui
  // qui oriente les contrastes calculés.
  const c = a.couleurs;
  return {
    ...base,
    theme: "base" as const,
    themeVariables: {
      darkMode: a.mode === "dark",
      background: c.bg,
      fontFamily: a.fontFamily,
      fontSize: a.fontSize,
      // Nœuds : fond légèrement détaché de la page, texte du document,
      // bordure à la couleur d'accent — la signature du thème.
      primaryColor: c.surface,
      primaryTextColor: c.fg,
      primaryBorderColor: c.accent,
      secondaryColor: c.surfaceHover,
      tertiaryColor: c.bg,
      // Traits et textes : le gris atténué du thème garde les liaisons
      // lisibles sans qu'elles dominent les nœuds.
      lineColor: c.muted,
      textColor: c.fg,
      mainBkg: c.surface,
      nodeBorder: c.accent,
      clusterBkg: c.bg,
      clusterBorder: c.border,
      titleColor: c.fg,
      edgeLabelBackground: c.bg,
      noteBkgColor: c.surfaceHover,
      noteTextColor: c.fg,
      noteBorderColor: c.border,
    },
  };
}

async function charger(a: ApparenceDiagramme): Promise<MermaidApi> {
  if (api) return api;
  if (!chargement) {
    chargement = import("mermaid").then((mod) => {
      mod.default.initialize(config(a));
      signatureInitialisee = signatureApparence(a);
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

/** Largeur d'un caractère `x` par police, mesurée une seule fois. Sert à
 *  dimensionner le jeton qui réserve la place d'une formule. */
const largeursCaractere = new Map<string, number>();

function largeurCaractere(font: string): number {
  const connue = largeursCaractere.get(font);
  if (connue !== undefined) return connue;
  let largeur = 0;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = font;
      largeur = ctx.measureText("x").width;
    }
  } catch { /* pas de canvas : le jeton ne sera pas dimensionné, sans plus */ }
  largeursCaractere.set(font, largeur);
  return largeur;
}

interface PontMaths {
  source: string;
  formules: FormuleDiagramme[];
  composees: (string | null)[];
}

/**
 * Prépare la source d'un diagramme et, s'il y a lieu, compose ses formules.
 *
 * DEUX passages sont nécessaires : il faut composer d'abord pour connaître la
 * LARGEUR de chaque formule, puis poser des jetons de largeur équivalente —
 * Mermaid dimensionne la boîte du libellé d'après le jeton qu'il voit, jamais
 * d'après ce qu'on y substituera. Sans ce calcul, une formule large déborderait
 * de son nœud.
 */
async function preparerPont(source: string, a: ApparenceDiagramme): Promise<PontMaths> {
  const tex = listerFormules(source);
  // Hors flowchart, le pont ne s'applique pas (libellés `<text>` SVG, sans
  // mise en page HTML) : la formule redevient du texte, comme avant.
  if (tex.length === 0 || !estFlowchart(source)) {
    return { source: neutraliserMaths(source), formules: [], composees: [] };
  }

  // Import DYNAMIQUE : MathJax ne se charge que si un diagramme porte vraiment
  // une formule, et le graphe statique reste exempt de modules à runes.
  const { composerFormule } = await import("@/lib/typeset-math");
  const corps = parseFloat(a.fontSize) || 16;

  // La composition ne sert qu'à MESURER : elle donne la largeur que la formule
  // occupera, donc la taille du jeton à réserver.
  const mesures = await Promise.all(
    tex.map((t) => composerFormule(t, { fontSizePx: corps }).catch(() => null)),
  );
  const car = largeurCaractere(`${a.fontSize} ${a.fontFamily}`);
  const largeurs = mesures.map((m, i) => remplissagePour(m?.largeur ?? 0, car, i));
  const { source: avecJetons, formules } = poserJetons(source, largeurs);

  // Ce qu'on SUBSTITUE est du LaTeX délimité, pas le SVG mesuré : MathJax le
  // composera ensuite SUR PLACE, dans le document, par le même chemin que les
  // formules du corps de texte.
  //
  // Injecter le SVG sérialisé paraissait plus direct — c'était l'erreur du
  // premier jet (2026-08-18) : sorti de son document, il perd la résolution de
  // ses glyphes et ses unités `ex`, et les nœuds s'affichaient VIDES. Composer
  // en place supprime toute cette classe de problèmes, et l'impression en
  // profite sans code : le MathJax du document imprimé traite ce LaTeX comme
  // le reste.
  const remplacements = formules.map((f) => `\\(${escapeHtml(f.tex)}\\)`);
  return { source: avecJetons, formules, composees: remplacements };
}

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
  apparence?: ApparenceDiagramme,
): Promise<number> {
  const blocs = Array.from(
    root.querySelectorAll<HTMLElement>(".mdv-mermaid:not(.is-rendered):not(.is-error)"),
  );
  if (blocs.length === 0) return 0;

  // Apparence lue sur le conteneur lui-même quand elle n'est pas fournie : les
  // diagrammes héritent alors des polices de l'endroit où ils s'affichent.
  const a = apparence ?? apparenceDepuis(root instanceof Element ? root : null);
  const mermaid = await charger(a);
  const signature = signatureApparence(a);
  if (signatureInitialisee !== signature) {
    mermaid.initialize(config(a));
    signatureInitialisee = signature;
  }

  let rendus = 0;
  for (const bloc of blocs) {
    const source = bloc.getAttribute("data-mermaid-source") ?? "";
    if (!source.trim()) continue;
    const avis = bloc.querySelector(".mdv-mermaid__notice")?.outerHTML ?? "";
    try {
      // Deux régimes pour les mathématiques (cf. `mermaid-math.ts`) :
      // — organigramme : PONT MathJax, les formules sont composées avec le
      //   préambule du projet, puis substituées dans le SVG rendu ;
      // — tout autre type : délimiteurs retirés, la formule reste du texte.
      // Dans les deux cas Mermaid ne voit jamais de `$$` — donc n'appelle
      // jamais KaTeX, qui ignorerait le préambule.
      const pont = await preparerPont(source, a);
      const { svg: brut } = await mermaid.render(`mdv-mermaid-${++compteur}`, pont.source);
      const svg = substituerFormules(brut, pont.formules, pont.composees);
      bloc.innerHTML = svg + avis;

      // Composition SUR PLACE des formules du diagramme, une fois le SVG dans
      // le document. `isConnected` est la condition : sur un fragment détaché
      // (impression), MathJax n'aurait rien à mesurer — le LaTeX y reste tel
      // quel, et c'est le MathJax du document imprimé qui le composera.
      if (pont.formules.length > 0 && bloc.isConnected) {
        const { typesetMath } = await import("@/lib/typeset-math");
        await typesetMath(bloc as HTMLElement);
      }
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
  apparence?: ApparenceDiagramme,
): Promise<string> {
  if (!html.includes("mdv-mermaid") || typeof document === "undefined") return html;
  const gabarit = document.createElement("template");
  gabarit.innerHTML = html;
  await renderMermaidBlocks(gabarit.content, apparence);
  return gabarit.innerHTML;
}

/** Remise à zéro — tests uniquement. */
export function _reinitialiserPourTests(): void {
  api = null;
  chargement = null;
  signatureInitialisee = null;
}
