import { saveProjectConfig, loadProjectConfig, type ProjectConfig } from "@/lib/project-config"
import { generalSettings } from "@/stores/general-settings.svelte"
import { proseMarkSettings, previewSettings, presentationSettings, DEFAULT_PROSE_MARK_STYLE, DEFAULT_PREVIEW_STYLE, DEFAULT_PRESENTATION_STYLE } from "@/stores/markdown-settings.svelte"
import { slideSettings } from "@/stores/slide-settings.svelte"
import { mathJaxPreamble, mathJaxPackages } from "@/stores/mathjax-preamble.svelte"
import { latexSettings } from "@/stores/latex-settings.svelte"
import { typstSettings } from "@/stores/typst-settings.svelte"
import { calloutSettings } from "@/stores/callout-settings.svelte"
import { DEFAULT_TYPOGRAPHY, type TypographySettings } from "@/lib/typography"
import { theme } from "@/stores/theme.svelte"
import { listCustomThemes, injectThemeCSS } from "@/lib/custom-themes"
import { BUILTIN_THEMES } from "@/lib/theme"
import type { FileOpsManager } from "@/lib/file-operations.svelte"
import { editorSettings, DEFAULT_EDITOR_SETTINGS } from "@/stores/editor-settings.svelte"

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
  if (generalSettings.defaultEditorMode !== "prose") app.defaultMode = generalSettings.defaultEditorMode;
  if (ctx.vimOn) app.vim = true;
  if (theme.mode !== "latte") app.theme = theme.mode;
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

  const pms = proseMarkSettings.current;
  if (JSON.stringify(pms) !== JSON.stringify(DEFAULT_PROSE_MARK_STYLE)) {
    cfg.proseMark = { style: pms };
  }

  const pvs = previewSettings.current;
  if (JSON.stringify(pvs) !== JSON.stringify(DEFAULT_PREVIEW_STYLE)) {
    cfg.preview = { style: pvs };
  }

  const prs = presentationSettings.current;
  const presNonDefault = JSON.stringify(prs) !== JSON.stringify(DEFAULT_PRESENTATION_STYLE);
  const slideNonDefault = slideSettings.mode !== "16:9";
  if (presNonDefault || slideNonDefault) {
    cfg.presentation = {};
    if (presNonDefault) cfg.presentation.style = prs;
    if (slideNonDefault) cfg.presentation.slideMode = slideSettings.mode;
  }

  const math: import("@/lib/project-config").MathConfig = {};
  if (mathJaxPreamble.current) math.preamble = mathJaxPreamble.current;
  if (mathJaxPackages.current.length) math.packages = mathJaxPackages.current;
  if (Object.keys(math).length) cfg.math = math;

  const ls = latexSettings.current;
  if (ls.engine !== "pdflatex" || ls.shellEscape || ls.outputDir !== "output" || ls.auxDir !== "auxdir" || ls.maxRuns !== 5 || ls.bibtex !== "auto") {
    cfg.latex = ls;
  }

  const ts = typstSettings.current;
  if (ts.formatterMode !== "typstyle" || ts.formatterPrintWidth !== 120 || ts.formatterIndentSize !== 2
    || ts.exportPdf !== "never" || ts.lintEnabled
    || !ts.systemFonts || !ts.semanticTokens || ts.typstExtraArgs) {
    cfg.typst = ts;
  }

  cfg.callouts = calloutSettings.current;

  if (ctx.fo.favorites.current.length) cfg.favorites = ctx.fo.favorites.current;

  await saveProjectConfig(ctx.configRoot, cfg);
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
  let crafted: { name: string; css: string }[] = [];
  try {
    crafted = await listCustomThemes(root);
    for (const c of crafted) injectThemeCSS(c.name, c.css);
  } catch { /* crafted CSS is best-effort */ }
  const { config: cfg, warnings } = await loadProjectConfig(root);

  const app = cfg.application;
  if (app?.defaultMode != null) generalSettings.defaultEditorMode = app.defaultMode;
  if (app?.vim != null) deps.vimOn.current = app.vim;
  if (app?.typography != null) deps.typography.current = { ...DEFAULT_TYPOGRAPHY, ...app.typography };
  if (app?.theme != null) {
    theme.setMode(app.theme);
  } else {
    const m = theme.mode;
    const ok = m === "system"
      || (BUILTIN_THEMES as readonly string[]).includes(m)
      || crafted.some((c) => c.name === m);
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

  if (cfg.proseMark?.style) proseMarkSettings.patch(cfg.proseMark.style);
  if (cfg.preview?.style) previewSettings.patch(cfg.preview.style);
  if (cfg.presentation?.style) presentationSettings.patch(cfg.presentation.style);
  if (cfg.presentation?.slideMode) slideSettings.mode = cfg.presentation.slideMode;
  if (cfg.math?.preamble != null) mathJaxPreamble.current = cfg.math.preamble;
  if (cfg.math?.packages != null) mathJaxPackages.current = cfg.math.packages;
  if (cfg.latex != null) latexSettings.patch(cfg.latex);
  if (cfg.typst != null) typstSettings.patch(cfg.typst);
  if (cfg.callouts != null) calloutSettings.load(cfg.callouts);
  if (cfg.favorites != null) deps.fo.favorites.current = cfg.favorites;

  deps.setConfigLoaded(true);
  deps.setThemeBootDone(true);
  if (warnings.length) {
    deps.notify.setInfo(deps.t("config.warnings"));
  }

  return root;
}
