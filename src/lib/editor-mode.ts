import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PanelManager } from "@/lib/panel-manager";
import type { LatexState } from "@/latex";

export type EditorMode = "raw" | "prose" | "preview" | "presentation" | "colle";

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
      { const tab = ctx.pm.main.tabs.find((t: any) => t.path === ctx.activePath);
        if (tab) ctx.pm.main.setRenderMode(tab.id, "raw"); }
      break;
    case "prose":
      ctx.setProsemarkOn(true);
      { const tab = ctx.pm.main.tabs.find((t: any) => t.path === ctx.activePath);
        if (tab) ctx.pm.main.setRenderMode(tab.id, "prose"); }
      break;
    case "preview": {
      if (!isPreviewable) return;
      // Réutilise UNIQUEMENT un tab side déjà lié à l'éditeur actif. Un tab
      // preview NON associé (ex. viewer créé par le routage maximisé, ou
      // preview d'un autre éditeur) n'est JAMAIS ré-affecté : un NOUVEL
      // onglet est créé (forceNew) puis lié — le couplage éditeur↔preview
      // exige que le tab preview soit l'image du tab éditeur courant.
      const linkedId = ctx.pm.main.activeTabId;
      const existing = ctx.pm.side.tabs.find((t: any) => t.path === ctx.activePath && ctx.pm.linkedEditorTabId(t.id) === linkedId);
      if (existing) {
        ctx.pm.side.setRenderMode(existing.id, "preview");
        ctx.pm.side.select(existing.id);
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
      } else {
        ctx.pm.openInSide(ctx.activePath!, { preview: true, forceNew: true }).catch(() => {});
        const tab = ctx.pm.side.tabs.find((t: any) => t.id === ctx.pm.side.activeTabId);
        if (tab) ctx.pm.side.setRenderMode(tab.id, "preview");
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
        ctx.bumpPanelVersion();
      }
      // Link the side preview (now active) to the CURRENT editor tab: every
      // navigation inside the preview re-points this tab (the editor follows
      // the preview).
      if (ctx.pm.side.activeTabId) {
        ctx.pm.linkPreview(ctx.pm.side.activeTabId, ctx.pm.main.activeTabId);
      }
      break;
    }
    case "presentation": {
      if (!isMd) return;
      ctx.setProsemarkOn(true);
      const linkedId = ctx.pm.main.activeTabId;
      const existing = ctx.pm.side.tabs.find((t: any) => t.path === ctx.activePath && ctx.pm.linkedEditorTabId(t.id) === linkedId);
      if (existing) {
        ctx.pm.side.setRenderMode(existing.id, "presentation");
        ctx.pm.side.select(existing.id);
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
      } else {
        ctx.pm.openInSide(ctx.activePath!, { preview: true, forceNew: true }).catch(() => {});
        const tab = ctx.pm.side.tabs.find((t: any) => t.id === ctx.pm.side.activeTabId);
        if (tab) ctx.pm.side.setRenderMode(tab.id, "presentation");
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
        ctx.bumpPanelVersion();
      }
      if (ctx.pm.side.activeTabId) {
        ctx.pm.linkPreview(ctx.pm.side.activeTabId, ctx.pm.main.activeTabId);
      }
      break;
    }
    case "colle": {
      if (!isMd) return;
      // Le main panel reste sur l'éditeur (règle structurelle) ; la vue colles
      // s'ouvre dans le side panel avec renderMode "colle".
      const linkedId = ctx.pm.main.activeTabId;
      const existing = ctx.pm.side.tabs.find((t: any) => t.path === ctx.activePath && ctx.pm.linkedEditorTabId(t.id) === linkedId);
      if (existing) {
        ctx.pm.side.setRenderMode(existing.id, "colle");
        ctx.pm.side.select(existing.id);
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
      } else {
        ctx.pm.openInSide(ctx.activePath!, { preview: true, forceNew: true }).catch(() => {});
        const tab = ctx.pm.side.tabs.find((t: any) => t.id === ctx.pm.side.activeTabId);
        if (tab) ctx.pm.side.setRenderMode(tab.id, "colle");
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
        ctx.bumpPanelVersion();
      }
      if (ctx.pm.side.activeTabId) {
        ctx.pm.linkPreview(ctx.pm.side.activeTabId, ctx.pm.main.activeTabId);
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
  }
}

export async function inverseSync(ctx: EditorModeDeps, file: string, line: number) {
  const normFile = file.replace(/\\/g, "/").split("/").filter(s => s !== ".").join("/");
  const found = ctx.pm.findTabByPath(normFile);
  if (found && found.panel === "main") {
    ctx.pm.main.select(found.tab.id);
  } else {
    const ext = ctx.extFromPath(normFile);
    await ctx.pm.openInMain(normFile, { silent: true, preview: true, sourceType: ext === "tex" ? "latex" : undefined });
  }
  ctx.setJumpToLine(line - 1);
  setEditorMode(ctx, "raw");
}

export async function jumpToLine(ctx: EditorModeDeps, line: number, path?: string | null, sessionId?: string | null) {
  const target = path ?? ctx.pm.side.activeTab?.path;
  // Phase 3 (C) : `sessionId` = id du tab side émetteur du double-clic.
  // Résolution VIA la table de liens (phase 2 B) : si CE preview est lié à un
  // tab éditeur main ET que le fichier rendu est celui du tab lié, le saut va
  // directement dans ce tab — jamais un doublon créé par une recherche par
  // chemin. Sinon (fichier rendu ≠ tab lié, ex. bloc transclusé) → repli
  // historique : ouvrir le fichier RENDU dans l'éditeur.
  if (target && sessionId) {
    const linkedId = ctx.pm.linkedEditorTabId(sessionId);
    const linked = linkedId
      ? ctx.pm.main.tabs.find((t: any) => t.id === linkedId && (!t.kind || t.kind === "file"))
      : null;
    if (linked) {
      const norm = (p: string) => p.replace(/\\/g, "/").split("/").filter(s => s !== ".").join("/");
      if (norm(linked.path) === norm(target)) {
        ctx.pm.main.select(linked.id);
        ctx.setJumpToLine(line);
        setEditorMode(ctx, "raw");
        return;
      }
    }
  }
  // Double-click in the preview: the jump targets the file that is RENDERED
  // (the preview tab's path — the tab is re-associated on every navigation),
  // never the file active in the main panel. The .md IS opened if it isn't
  // already in the editor (forced open — user rule), but ALWAYS the rendered
  // file, never an arbitrary active tab.
  if (target) {
    const norm = (p: string) => p.replace(/\\/g, "/").split("/").filter(s => s !== ".").join("/");
    const normTarget = norm(target);
    const mainTab = ctx.pm.main.tabs.find(t => norm(t.path) === normTarget);
    if (mainTab) {
      ctx.pm.main.select(mainTab.id);
    } else {
      await ctx.pm.openInMain(normTarget, { silent: true, preview: true }).catch(() => {});
    }
  }
  ctx.setJumpToLine(line);
  setEditorMode(ctx, "raw");
}

export function consoleJump(ctx: EditorModeDeps, line: number, col?: number | null) {
  ctx.setSideVisible(false);
  ctx.pm.sideVisible = false;
  ctx.setJumpToLine(line - 1);
  ctx.setJumpToCol(col != null ? col - 1 : null);
}
