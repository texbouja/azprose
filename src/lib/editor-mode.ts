import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PanelManager } from "@/lib/panel-manager";
import type { LatexState } from "@/latex";

export type EditorMode = "raw" | "prose" | "preview" | "presentation";

export interface EditorModeDeps {
  pm: PanelManager;
  get activePath(): string | null;
  get sideVisible(): boolean;
  setSideVisible: (v: boolean) => void;
  get presentationFs(): boolean;
  setPresentationFs: (v: boolean) => void;
  get prosemarkOn(): boolean;
  setProsemarkOn: (v: boolean) => void;
  bumpPanelVersion: () => void;
  get jumpToLine(): number | null;
  setJumpToLine: (v: number | null) => void;
  get jumpToCol(): number | null;
  setJumpToCol: (v: number | null) => void;
  setForwardTargetPage: (v: number | null) => void;
  ls: LatexState;
  extFromPath: (path: string) => string;
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  notify: { setInfo: (msg: string) => void };
}

export function setEditorMode(ctx: EditorModeDeps, mode: EditorMode) {
  if (ctx.presentationFs && mode !== "presentation") {
    ctx.setPresentationFs(false);
    void getCurrentWindow().setFullscreen(false);
  }
  const isMd = ctx.activePath && ctx.extFromPath(ctx.activePath) === "md";
  const isPreviewable = ctx.activePath && (ctx.extFromPath(ctx.activePath) === "md" || ctx.extFromPath(ctx.activePath) === "csv" || ctx.extFromPath(ctx.activePath) === "tsv");
  switch (mode) {
    case "raw":
      ctx.setProsemarkOn(false);
      break;
    case "prose":
      ctx.setProsemarkOn(true);
      break;
    case "preview": {
      if (!isPreviewable) return;
      const existing = ctx.pm.side.tabs.find((t: any) => t.path === ctx.activePath);
      if (existing) {
        ctx.pm.side.setRenderMode(existing.id, "preview");
        ctx.pm.side.select(existing.id);
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
      } else {
        ctx.pm.openInSide(ctx.activePath!, { preview: true }).catch(() => {});
        const tab = ctx.pm.side.tabs.find((t: any) => t.path === ctx.activePath);
        if (tab) ctx.pm.side.setRenderMode(tab.id, "preview");
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
        ctx.bumpPanelVersion();
      }
      break;
    }
    case "presentation": {
      if (!isMd) return;
      ctx.setProsemarkOn(true);
      const existing = ctx.pm.side.tabs.find((t: any) => t.path === ctx.activePath);
      if (existing) {
        ctx.pm.side.setRenderMode(existing.id, "presentation");
        ctx.pm.side.select(existing.id);
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
      } else {
        ctx.pm.openInSide(ctx.activePath!, { preview: true }).catch(() => {});
        const tab = ctx.pm.side.tabs.find((t: any) => t.path === ctx.activePath);
        if (tab) ctx.pm.side.setRenderMode(tab.id, "presentation");
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
        ctx.bumpPanelVersion();
      }
      break;
    }
  }
}

export function toggleSideRenderMode(ctx: EditorModeDeps) {
  const tab = ctx.pm.side.activeTab;
  if (!tab) return;
  const next: "preview" | "presentation" = tab.renderMode === "presentation" ? "preview" : "presentation";
  ctx.pm.side.setRenderMode(tab.id, next);
  ctx.bumpPanelVersion();
  if (next === "presentation") ctx.setPresentationFs(false);
}

export async function gutterClick(ctx: EditorModeDeps, line: number) {
  if (!ctx.activePath) return;
  const ext = ctx.extFromPath(ctx.activePath);
  if (ext === "tex" && ctx.ls.viewerPdfPath) {
    ctx.invoke("synctex_forward", { texPath: ctx.activePath, pdfPath: ctx.ls.viewerPdfPath, line, col: 0 })
      .then((res: any) => {
        if (res?.page) {
          ctx.setForwardTargetPage(res.page);
          setTimeout(() => { ctx.setForwardTargetPage(null); }, 0);
        }
      })
      .catch((err: unknown) => ctx.notify.setInfo(`synctex forward failed: ${err}`));
  } else if (ext === "typ") {
    const { getPreviewTaskForFile, scrollPreview } = await import("@/typst/backend");
    const taskId = getPreviewTaskForFile(ctx.activePath);
    if (taskId) {
      scrollPreview(taskId, { event: "panelScrollTo", filepath: ctx.activePath, line: line - 1, character: 0 })
        .catch((err: unknown) => ctx.notify.setInfo(`typst forward failed: ${err}`));
    }
  }
}

export async function inverseSync(ctx: EditorModeDeps, file: string, line: number) {
  const normFile = file.replace(/\\/g, "/").split("/").filter(s => s !== ".").join("/");
  const found = ctx.pm.findTabByPath(normFile);
  if (found && found.panel === "main") {
    ctx.pm.main.select(found.tab.id);
  } else {
    const ext = ctx.extFromPath(normFile);
    await ctx.pm.openInMain(normFile, { silent: true, preview: true, sourceType: ext === "typ" ? "typst" : ext === "tex" ? "latex" : undefined });
  }
  ctx.setJumpToLine(line - 1);
  setEditorMode(ctx, "raw");
}

export function jumpToLine(ctx: EditorModeDeps, line: number) {
  ctx.setJumpToLine(line);
  setEditorMode(ctx, "raw");
}

export function consoleJump(ctx: EditorModeDeps, line: number, col?: number | null) {
  ctx.setSideVisible(false);
  ctx.pm.sideVisible = false;
  ctx.setJumpToLine(line - 1);
  ctx.setJumpToCol(col != null ? col - 1 : null);
}
