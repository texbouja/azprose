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
  proseMarkStyle: "mdview.prosemark.style",
  previewStyle: "mdview.preview.style",
  printStyle: "mdview.print.style",
  presentationStyle: "mdview.presentation.style",
  mathJaxPreamble: "mdview.mathjax.preamble",
  mathJaxPackages: "mdview.mathjax.packages",
  slideMode:  "mdview.slides.mode",
  defaultEditorMode: "mdview.default.editor.mode",
  uiFontFamily: "mdview.ui.font",
  uiMonoFamily: "mdview.ui.mono.font",
  sidebarFontFamily: "mdview.ui.sidebar.font",
  previewFontFamily: "mdview.preview.font",
  previewCustomFontName: "mdview.preview.font.custom",
  previewMonoFamily: "mdview.preview.mono.font",
  fontHinting: "mdview.font.hinting",
  callouts:   "mdview.callouts",
  csvStyle: "mdview.csv.style",
  latexSettings: "mdview.latex.settings",
  shortcuts: "mdview.shortcuts",
  journalSettings: "mdview.journal",
  collesSettings: "mdview.colles",
  userProfile: "mdview.user.profile",
  // Chemin explicite vers le binaire de l'agent (surcharge du PATH) —
  // sert à la veille : pointer une version candidate avant de l'adopter.
  agentBinaryPath: "mdview.agent.binaryPath",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
