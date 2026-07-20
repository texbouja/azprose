import { shortcuts } from "@/stores/shortcuts.svelte"
import { overlays } from "@/stores/overlays.svelte"
import { extFromPath } from "@/lib/editor-languages"
import type { LatexState } from "@/latex"
import type { TypstBuildState } from "@/typst"
import type { PanelManager } from "@/lib/panel-manager"

export interface KeyboardDeps {
  activePath: string | null
  source: string
  ls: LatexState
  ts: TypstBuildState
  pm: PanelManager
  sideVisible: boolean
  setConsoleOpen: (v: boolean) => void
  setConsoleTab: (tab: "diagnostics" | "terminal" | "log") => void
  setSideVisible: (v: boolean) => void
  handleSave: () => Promise<void>
  handleSaveAll: (deps: string[]) => Promise<void>
  handleExportPdf: () => Promise<void>
  handleSetEditorMode: (mode: "raw" | "prose" | "preview" | "presentation") => void
  sidebarOpen: { current: boolean }
  notify: { setInfo: (msg: string) => void }
  t: (key: string, params?: Record<string, string>) => string
}

export function handleKeydown(e: KeyboardEvent, ctx: KeyboardDeps) {
  if (shortcuts.matches(e, "commandPalette")) {
    e.preventDefault();
    overlays.setPaletteOpen(!overlays.paletteOpen);
    return;
  }
  if (shortcuts.matches(e, "save")) {
    e.preventDefault();
    ctx.handleSave();
    return;
  }
  if (shortcuts.matches(e, "exportPdf")) {
    e.preventDefault();
    ctx.handleExportPdf();
    return;
  }
  if (shortcuts.matches(e, "sidebar")) {
    e.preventDefault();
    ctx.sidebarOpen.current = !ctx.sidebarOpen.current;
    return;
  }
  if (shortcuts.matches(e, "help")) {
    e.preventDefault();
    overlays.showHelp();
    return;
  }
  if (shortcuts.matches(e, "build")) {
    e.preventDefault();
    if (ctx.activePath) {
      const ext = extFromPath(ctx.activePath);
      if (ext === "tex") {
        void (async () => {
          const { handleLatexBuild } = await import("@/latex");
          await handleLatexBuild(ctx.ls, ctx.activePath!, ctx.handleSave, ctx.handleSaveAll, () => ctx.setConsoleOpen(true), () => ctx.setConsoleTab("log"));
          if (ctx.ls.viewerPdfPath) {
            await ctx.pm.openInSide(ctx.ls.viewerPdfPath, { sourceType: "latex" });
            ctx.setSideVisible(true);
          }
        })();
      } else if (ext === "typ") {
        void (async () => {
          const typst = await import("@/typst");
          await typst.build(ctx.ts, ctx.activePath!, ctx.source, ctx.handleSave, () => ctx.setConsoleOpen(true), () => ctx.setConsoleTab("log"), (name: string) => ctx.notify.setInfo(ctx.t("app.savedTo", { name })));
        })();
      }
    }
    return;
  }
  if (shortcuts.matches(e, "editorMode1")) {
    e.preventDefault();
    ctx.handleSetEditorMode("raw");
    return;
  }
  if (shortcuts.matches(e, "editorMode2")) {
    e.preventDefault();
    ctx.handleSetEditorMode("prose");
    return;
  }
  if (shortcuts.matches(e, "editorMode3")) {
    e.preventDefault();
    ctx.handleSetEditorMode("preview");
    return;
  }
  if (shortcuts.matches(e, "viewPanel")) {
    e.preventDefault();
    ctx.sidebarOpen.current = !ctx.sidebarOpen.current;
    return;
  }
  if (shortcuts.matches(e, "settings")) {
    e.preventDefault();
    overlays.openSettings("general");
    return;
  }
}
