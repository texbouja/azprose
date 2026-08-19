import { saveProjectConfig, loadProjectConfig, sectionMath, type ProjectConfig } from "@/lib/project-config"
import { saveProjectUi, loadProjectUi, type ProjectUi } from "@/lib/project-ui"
import { previewSettings, printSettings, presentationSettings, DEFAULT_PREVIEW_STYLE, DEFAULT_PRINT_STYLE, DEFAULT_PRESENTATION_STYLE } from "@/stores/markdown-settings.svelte"
import { slideSettings } from "@/stores/slide-settings.svelte"
import { mathJaxPreamble, mathJaxPackages, mathJaxFont, mathJaxSpacing } from "@/stores/mathjax-preamble.svelte"
import { policeValide } from "@/lib/mathjax-font"
import { espacementValide } from "@/lib/mathjax-spacing"
import { latexSettings } from "@/stores/latex-settings.svelte"
import { calloutSettings } from "@/stores/callout-settings.svelte"
import { programmesSelection } from "@/stores/programmes-selection.svelte"
import { DEFAULT_TYPOGRAPHY, type TypographySettings } from "@/lib/typography"
import { theme } from "@/stores/theme.svelte"
import { BUILTIN_THEMES } from "@/lib/theme"
import type { FileOpsManager } from "@/lib/file-operations.svelte"
import { editorSettings, DEFAULT_EDITOR_SETTINGS } from "@/stores/editor-settings.svelte"
import { collesSettings, DEFAULT_COLLES_SETTINGS } from "@/stores/colles-settings.svelte"

export interface ConfigSyncContext {
  configRoot: string | null
  configLoaded: boolean
  vimOn: boolean
  typo: TypographySettings
  fo: Pick<FileOpsManager, "favorites">
}

let configWriteTimer: ReturnType<typeof setTimeout> | null = null;

export async function doConfigSync(ctx: ConfigSyncContext) {
  if (!ctx.configRoot) return;
  const cfg: ProjectConfig = {};

  const app: import("@/lib/project-config").ApplicationConfig = {};
  if (ctx.vimOn) app.vim = true;
  if (JSON.stringify(ctx.typo) !== JSON.stringify(DEFAULT_TYPOGRAPHY)) app.typography = ctx.typo;
  if (Object.keys(app).length) cfg.application = app;

  const es = editorSettings.current;
  const editor: import("@/lib/project-config").EditorConfig = {};
  if (es.fontFamily !== DEFAULT_EDITOR_SETTINGS.fontFamily) editor.fontFamily = es.fontFamily;
  if (es.customFontName) editor.customFontName = es.customFontName;
  if (es.fontSize !== DEFAULT_EDITOR_SETTINGS.fontSize) editor.fontSize = es.fontSize;
  if (es.tabSize !== DEFAULT_EDITOR_SETTINGS.tabSize) editor.tabSize = es.tabSize;
  if (!es.lineNumbers) editor.lineNumbers = false;
  if (!es.lineWrapping) editor.lineWrapping = false;
  if (Object.keys(editor).length) cfg.editor = editor;

  const pvs = previewSettings.current;
  if (JSON.stringify(pvs) !== JSON.stringify(DEFAULT_PREVIEW_STYLE)) {
    cfg.preview = { style: pvs };
  }

  const prt = printSettings.current;
  if (JSON.stringify(prt) !== JSON.stringify(DEFAULT_PRINT_STYLE)) {
    cfg.print = { style: prt };
  }

  const prs = presentationSettings.current;
  const presNonDefault = JSON.stringify(prs) !== JSON.stringify(DEFAULT_PRESENTATION_STYLE);
  const slideNonDefault = slideSettings.mode !== "16:9";
  if (presNonDefault || slideNonDefault) {
    cfg.presentation = {};
    if (presNonDefault) cfg.presentation.style = prs;
    if (slideNonDefault) cfg.presentation.slideMode = slideSettings.mode;
  }

  // ⚠️ Les réglages mathématiques sont écrits MÊME à leur valeur par défaut, et
  // même vides.
  //
  // La règle « n'écrire que ce qui diffère du défaut » rend le RETOUR au défaut
  // impossible : le fichier garde l'ancienne valeur, et `loadConfig` la
  // réimpose à chaque ouverture du projet. Signalé le 2026-08-19 — après un
  // passage à Fira Math, revenir à New Computer Modern ne tenait ni au
  // redémarrage ni au relancement complet, le réglage se remettait tout seul.
  // Le même piège valait pour un préambule effacé et pour des paquets
  // décochés : ils revenaient au démarrage suivant.
  cfg.math = sectionMath(
    mathJaxPreamble.current,
    mathJaxPackages.current,
    mathJaxFont.current,
    mathJaxSpacing.current,
  );

  const ls = latexSettings.current;
  if (ls.engine !== "pdflatex" || ls.shellEscape || ls.outputDir !== "output" || ls.auxDir !== "auxdir" || ls.maxRuns !== 5 || ls.bibtex !== "auto") {
    cfg.latex = ls;
  }

  cfg.callouts = calloutSettings.current;

  if (programmesSelection.current.length) cfg.programmes = programmesSelection.current;

  if (ctx.fo.favorites.current.length) cfg.favorites = ctx.fo.favorites.current;

  const cs = collesSettings.current;
  if (JSON.stringify(cs) !== JSON.stringify(DEFAULT_COLLES_SETTINGS)) cfg.colles = cs;

  // Thème : préférence d'INTERFACE, PAS de document — vit dans ui.json
  // (`.azprose/ui.json`), pas dans config.json (vague 4, phase 4.2, R6).
  const ui: ProjectUi = {};
  if (theme.mode !== "system") ui.theme = theme.mode;

  await Promise.all([
    saveProjectConfig(ctx.configRoot, cfg),
    saveProjectUi(ctx.configRoot, ui),
  ]);
}

export function scheduleConfigSync(ctx: ConfigSyncContext) {
  if (!ctx.configRoot || !ctx.configLoaded) return;
  if (configWriteTimer) clearTimeout(configWriteTimer);
  configWriteTimer = setTimeout(async () => {
    await doConfigSync(ctx);
  }, 400);
}

export function flushConfigSync() {
  if (!configWriteTimer) return;
  clearTimeout(configWriteTimer);
  configWriteTimer = null;
}

export interface LoadConfigDeps {
  vimOn: { current: boolean }
  typography: { current: TypographySettings }
  fo: Pick<FileOpsManager, "favorites">
  setConfigLoaded: (v: boolean) => void
  setThemeBootDone: (v: boolean) => void
  notify: { setInfo: (msg: string) => void }
  t: (key: string, params?: Record<string, string>) => string
}

export async function loadConfig(root: string, deps: LoadConfigDeps): Promise<string> {
  const [{ config: cfg, warnings }, ui] = await Promise.all([
    loadProjectConfig(root),
    loadProjectUi(root),
  ]);

  const app = cfg.application;
  if (app?.vim != null) deps.vimOn.current = app.vim;
  if (app?.typography != null) deps.typography.current = { ...DEFAULT_TYPOGRAPHY, ...app.typography };

  // Thème : lu depuis ui.json, pas config.json (vague 4, phase 4.2, R6).
  if (ui?.theme != null) {
    theme.setMode(ui.theme);
  } else {
    const m = theme.mode;
    const ok = m === "system" || (BUILTIN_THEMES as readonly string[]).includes(m);
    if (!ok) theme.setMode("latte");
  }

  const ed = cfg.editor;
  if (ed != null) {
    const patch: Record<string, unknown> = {};
    if (ed.fontFamily != null) patch.fontFamily = ed.fontFamily;
    if (ed.customFontName != null) patch.customFontName = ed.customFontName;
    if (ed.fontSize != null) patch.fontSize = ed.fontSize;
    if (ed.tabSize != null) patch.tabSize = ed.tabSize;
    if (ed.lineNumbers != null) patch.lineNumbers = ed.lineNumbers;
    if (ed.lineWrapping != null) patch.lineWrapping = ed.lineWrapping;
    if (Object.keys(patch).length) editorSettings.patch(patch);
  }

  if (cfg.preview?.style) previewSettings.patch(cfg.preview.style);
  if (cfg.print?.style) printSettings.patch(cfg.print.style);
  if (cfg.presentation?.style) presentationSettings.patch(cfg.presentation.style);
  if (cfg.presentation?.slideMode) slideSettings.mode = cfg.presentation.slideMode;
  if (cfg.math?.preamble != null) mathJaxPreamble.current = cfg.math.preamble;
  if (cfg.math?.packages != null) mathJaxPackages.current = cfg.math.packages;
  if (cfg.math?.font != null) mathJaxFont.current = policeValide(cfg.math.font);
  if (cfg.math?.spacing != null) mathJaxSpacing.current = espacementValide(cfg.math.spacing);
  if (cfg.latex != null) latexSettings.patch(cfg.latex);
  if (cfg.callouts != null) calloutSettings.load(cfg.callouts);
  if (cfg.programmes != null) programmesSelection.load(cfg.programmes);
  if (cfg.favorites != null) deps.fo.favorites.current = cfg.favorites;
  if (cfg.colles != null) collesSettings.current = cfg.colles;

  // Migration du gabarit colle (refonte des réglages « Impression », printing.md
  // §2.3) : il vivait dans `cfg.print.style.layout` — il vit désormais dans
  // `cfg.colles.layout`. Repli défensif : l'ancien chemin gagne si le nouveau
  // est absent (config pré-refonte) ; le champ résiduel `layout` de print.style
  // est ignoré par la suite (PrintStyle ne le porte plus).
  const legacyColleLayout = (cfg.print?.style as { layout?: unknown } | null | undefined)?.layout;
  if (legacyColleLayout && cfg.colles?.layout == null) {
    collesSettings.update((prev) => ({ ...prev, layout: legacyColleLayout as never }));
  }

  deps.setConfigLoaded(true);
  deps.setThemeBootDone(true);
  if (warnings.length) {
    deps.notify.setInfo(deps.t("config.warnings"));
  }

  return root;
}
