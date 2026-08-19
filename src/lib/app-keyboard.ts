import { shortcuts } from "@/stores/shortcuts.svelte"
import { getPinnedNavActions } from "@/stores/pinned-history.svelte"
import { tabPinFormat, tabSpace } from "@/lib/panel-store"
import { overlays } from "@/stores/overlays.svelte"
import { extFromPath } from "@/lib/editor-languages"
import { handleLatexBuild } from "@/latex"
import type { LatexState } from "@/latex"
import type { PanelManager } from "@/lib/panel-manager"

export interface KeyboardDeps {
  activePath: string | null
  source: string
  ls: LatexState
  pm: PanelManager
  sideVisible: boolean
  setConsoleOpen: (v: boolean) => void
  setConsoleTab: (tab: "diagnostics" | "terminal" | "log") => void
  setSideVisible: (v: boolean) => void
  handleSave: () => Promise<void>
  handleSaveAll: (deps: string[]) => Promise<void>
  handleExportPdf: () => Promise<void>
  handleSetEditorMode: (mode: "raw" | "preview" | "presentation") => void
  onShowHelp?: () => void
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
  if (shortcuts.matches(e, "build")) {
    e.preventDefault();
    if (ctx.activePath) {
      const ext = extFromPath(ctx.activePath);
      if (ext === "tex") {
        void (async () => {
          await handleLatexBuild(ctx.ls, ctx.activePath!, ctx.handleSave, ctx.handleSaveAll, () => ctx.setConsoleOpen(true), () => ctx.setConsoleTab("log"));
          if (ctx.ls.viewerPdfPath) {
            await ctx.pm.openLatexViewerPdf(ctx.ls.viewerPdfPath);
            ctx.setSideVisible(true);
          }
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
  if (shortcuts.matches(e, "help")) {
    e.preventDefault();
    ctx.onShowHelp?.();
    return;
  }
  // Historique de MONTAGE du pinned slot (Phase D/G) — ⌘[ / ⌘] (Ctrl ailleurs).
  // Les raccourcis suivent le SLOT épinglé du tab éditeur actif : hors slot
  // épinglé il n'y a pas d'historique (un tab libre ouvre/active des onglets).
  if (shortcuts.matches(e, "navBack") || shortcuts.matches(e, "navForward")) {
    e.preventDefault();
    const active = ctx.pm.main.tabs.find((t) => t.id === ctx.pm.main.activeTabId);
    const format = active && tabSpace(active) === "pinned" ? tabPinFormat(active.path) : null;
    if (format) {
      if (shortcuts.matches(e, "navBack")) getPinnedNavActions().goBack(format);
      else getPinnedNavActions().goForward(format);
    }
    return;
  }
}
