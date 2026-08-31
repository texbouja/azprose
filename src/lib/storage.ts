// ── localStorage key catalog ───────────────────────────────────────────────
//
// Two-tier persistence model (Obsidian-style vault isolation):
//
// 1. PROJECT DATA (scoped per vault via session.ts `scopedKey`) — stored under
//    `key + "::" + root`, so two vaults sharing the same WebView origin never
//    leak into each other:
//      - session / drafts / lastFile / guests   (lib/session.ts, already scoped)
//      - calendar events                        (calendar-store, scoped storageKey)
//      - favorites                              (persistedScopedState)
//
// 2. GLOBAL UI PREFERENCES (unscoped) — theme, language, fonts, layout, etc.
//    The per-project source of truth for these lives in `.azprose/config.json`
//    (project-config.ts); localStorage is only a fast boot cache that loadConfig
//    overrides with the vault's own values. `folders` is unscoped by design —
//    folders.current[0] is how the app remembers the last opened project.
export const STORAGE_KEYS = {
  themeMode: "mdview.theme",
  transparency: "mdview.transparency",
  sidebarOpen: "mdview.sidebar.open",
  sidebarWidth: "mdview.sidebar.width",
  // Mobilier système de la fenêtre NAV (phase 1.5, R6) — clés DISTINCTES de
  // celles de PROJET ci-dessus : deux sidebars différentes, les confondre
  // ferait bouger l'une quand on redimensionne l'autre.
  navSidebarOpen: "mdview.nav.sidebar.open",
  navSidebarWidth: "mdview.nav.sidebar.width",
  sidebarView: "mdview.sidebar.view",
  sidebarSections: "mdview.sidebar.sections",
  lastFile: "mdview.lastFile",
  welcomed: "mdview.welcomed",
  lastSeenVersion: "mdview.lastSeenVersion",
  language: "mdview.language",
  folders: "mdview.folders",
  favorites: "mdview.favorites",
  typography: "mdview.typography",
  previewStyle: "mdview.preview.style",
  printStyle: "mdview.print.style",
  presentationStyle: "mdview.presentation.style",
  mathJaxPreamble: "mdview.mathjax.preamble",
  latexPreamble: "mdview.latex.preamble",
  mathJaxPackages: "mdview.mathjax.packages",
  mathJaxFont: "mdview.mathjax.font",
  mathJaxSpacing: "mdview.mathjax.spacing",
  slideMode:  "mdview.slides.mode",
  uiFontFamily: "mdview.ui.font",
  uiMonoFamily: "mdview.ui.mono.font",
  sidebarFontFamily: "mdview.ui.sidebar.font",
  previewFontFamily: "mdview.preview.font",
  previewCustomFontName: "mdview.preview.font.custom",
  previewMonoFamily: "mdview.preview.mono.font",
  fontHinting: "mdview.font.hinting",
  callouts:   "mdview.callouts",
  programmesSelection: "mdview.programmes.selection",
  csvStyle: "mdview.csv.style",
  latexSettings: "mdview.latex.settings",
  shortcuts: "mdview.shortcuts",
  journalSettings: "mdview.journal",
  collesSettings: "mdview.colles",
  userProfile: "mdview.user.profile",
  // Chemin explicite vers le binaire de l'agent (surcharge du PATH) —
  // sert à la veille : pointer une version candidate avant de l'adopter.
  agentBinaryPath: "mdview.agent.binaryPath",
  // Modèle ÉPINGLÉ = le défaut de l'assistant — GLOBAL comme le chemin du
  // binaire : le choix suit l'utilisateur, pas le vault. Absent ou vide =
  // aucun pin, l'assistant suit le comportement par défaut ou configuré
  // d'OpenCode. (Portait la « surcharge globale » avant le 2026-08-22 : cette
  // valeur devient le pin initial, cf. `modele-defaut.ts`.)
  agentModel: "mdview.agent.model",
  // Dernière version connue du binaire OpenCode. Sert de clé de validité au
  // catalogue persisté pour les lecteurs qui n'ont pas de session ACP sous la
  // main (les réglages) : sans elle, ils devraient lancer le serveur juste
  // pour savoir s'ils ont le droit de lire un fichier.
  agentBinaryVersion: "mdview.agent.binaryVersion",
  // Fournisseurs cochés pour le menu du sélecteur (opt-in) — GLOBAL comme le
  // modèle : c'est une préférence de lecture du catalogue, pas une donnée du
  // vault. Les fournisseurs CONNECTÉS restent visibles même absents de la
  // liste (ils sont actifs par nature).
  agentFournisseurs: "mdview.agent.fournisseurs",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Clés dont la valeur décrit l'état d'UNE fenêtre, et qu'une autre fenêtre ne
 * doit donc JAMAIS réécrire (`persisted.svelte.ts` ignore l'événement `storage`
 * pour elles).
 *
 * Le défaut que ça corrige : `folders` est non scopée par nécessité
 * (`folders.current[0]` est la mémoire du dernier projet ouvert, cf. le
 * commentaire de tête), et chaque fenêtre y écrit SA liste au boot. Comme
 * `persistedState` applique les écritures venues des autres fenêtres, ouvrir un
 * projet B pendant qu'une fenêtre est sur A **remplaçait l'arborescence
 * affichée par A** par celle de B — sans que `rootPath` bouge. La fenêtre A
 * présentait alors B comme son propre projet primaire, et tout clic dans cet
 * arbre écrivait des chemins étrangers dans la session scopée de A, ses
 * brouillons, sa clé invités, son `.azprose/session.json` et son `data.db`.
 *
 * La politique est une propriété de la CLÉ, pas du site d'appel : la déclarer
 * ici, à côté du catalogue, la rend auditable d'un coup d'œil — un cinquième
 * paramètre de `persistedState` l'aurait éparpillée sur 28 sites.
 *
 * ⚠️ Ne concerne QUE la réception. Ces clés restent persistées et relues
 * normalement au démarrage : c'est la propagation à chaud qui est fautive, pas
 * le stockage.
 */
export const CLES_PAR_FENETRE: ReadonlySet<string> = new Set<string>([
  STORAGE_KEYS.folders,
]);
