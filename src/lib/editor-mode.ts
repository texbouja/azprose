import { getCurrentWindow } from "@tauri-apps/api/window";
import type { PanelManager } from "@/lib/panel-manager";
import { tabContentKind, tabSpace } from "@/lib/panel-store";
import type { LatexState } from "@/latex";

export type EditorMode = "raw" | "preview" | "presentation" | "colle";

export interface EditorModeDeps {
  pm: PanelManager;
  get activePath(): string | null;
  get sideVisible(): boolean;
  setSideVisible: (v: boolean) => void;
  get presentationFs(): boolean;
  setPresentationFs: (v: boolean) => void;
  bumpPanelVersion: () => void;
  get jumpToLine(): number | null;
  setJumpToLine: (v: number | null) => void;
  get jumpToCol(): number | null;
  setJumpToCol: (v: number | null) => void;
  ls: LatexState;
  extFromPath: (path: string) => string;
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  notify: { setInfo: (msg: string) => void };
  /** Monte `path` dans le PINNED slot de son format via le reducer (Phase D —
   *  re-point + historique de montage + compagnon qui suit) ; `false` si aucun
   *  slot n'est épinglé pour ce format. Injecté par l'app (le reducer est le
   *  seul à muter la session de navigation). */
  mountInPinnedSlot?: (path: string) => Promise<boolean>;
}

/** Tab viewer side affichant DÉJÀ `path` : le bouton Preview l'ACTIVE au lieu
 *  de créer un doublon (décision utilisateur) — `forceNew` ne s'applique que si
 *  AUCUN tab n'affiche le fichier. L'identité est le CONTENU (Phase G : plus
 *  aucun registre de couplage).
 *
 *  Sphère pinned (Phase C) : quand l'ÉDITEUR ACTIF est épinglé, le viewer
 *  compagnon vit dans la sphère pinned — la recherche est limitée aux viewers
 *  `space: "pinned"` (dédup par ESPACE, R2/R3 : un viewer libre du même
 *  contenu n'est jamais adopté ici — l'adoption se fait à l'épinglage). */
function findSideTabFor(ctx: EditorModeDeps, path: string | null): { id: string } | null {
  if (!path) return null;
  const editor = ctx.pm.main.tabs.find((t: any) => t.id === ctx.pm.main.activeTabId);
  const pinnedEditor = editor != null && tabSpace(editor) === "pinned";
  const inSpace = (t: any) => !pinnedEditor || tabSpace(t) === "pinned";
  return (
    ctx.pm.side.tabs.find(
      (t: any) => t.path === path && inSpace(t) && tabContentKind(t.kind) === "file",
    ) ?? null
  );
}

/** Options d'espace du viewer du bouton Preview/Présentation/Colle (Phase C) :
 *  la sphère pinned si l'éditeur actif est épinglé — le viewer devient son
 *  COMPAGNON (`pinnedOwner` = id du slot, la liaison tient en excursion) ;
 *  sinon espace libre (aucune option). */
function viewerSpaceOpts(ctx: EditorModeDeps): { space?: "pinned"; pinnedOwner?: string } {
  const id = ctx.pm.main.activeTabId;
  const editor = ctx.pm.main.tabs.find((t: any) => t.id === id);
  if (editor == null || tabSpace(editor) !== "pinned") return {};
  return { space: "pinned", pinnedOwner: editor.id };
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
      { const tab = ctx.pm.main.tabs.find((t: any) => t.path === ctx.activePath);
        if (tab) ctx.pm.main.setRenderMode(tab.id, "raw"); }
      break;
    case "preview": {
      if (!isPreviewable) return;
      // Réutilise un tab side affichant DÉJÀ ce md — d'abord celui lié à
      // l'éditeur actif, sinon tout tab de fichier sur ce chemin (décision
      // utilisateur : JAMAIS de doublon — le bouton Preview active le couplage
      // avec un tab viewer déjà ouvert). Un tab preview NON associé n'est
      // ré-affecté que s'il affiche le MÊME fichier (le couplage éditeur↔preview
      // exige que le tab preview soit l'image du tab éditeur courant) ; sinon un
      // NOUVEL onglet est créé (forceNew) puis lié.
      const existing = findSideTabFor(ctx, ctx.activePath);
      if (existing) {
        ctx.pm.side.setRenderMode(existing.id, "preview");
        ctx.pm.side.select(existing.id);
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
      } else {
        ctx.pm.openInSide(ctx.activePath!, { preview: true, forceNew: true, ...viewerSpaceOpts(ctx) }).catch(() => {});
        const tab = ctx.pm.side.tabs.find((t: any) => t.id === ctx.pm.side.activeTabId);
        if (tab) ctx.pm.side.setRenderMode(tab.id, "preview");
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
        ctx.bumpPanelVersion();
      }
      break;
    }
    case "presentation": {
      if (!isMd) return;
      const existing = findSideTabFor(ctx, ctx.activePath);
      if (existing) {
        ctx.pm.side.setRenderMode(existing.id, "presentation");
        ctx.pm.side.select(existing.id);
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
      } else {
        ctx.pm.openInSide(ctx.activePath!, { preview: true, forceNew: true, ...viewerSpaceOpts(ctx) }).catch(() => {});
        const tab = ctx.pm.side.tabs.find((t: any) => t.id === ctx.pm.side.activeTabId);
        if (tab) ctx.pm.side.setRenderMode(tab.id, "presentation");
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
        ctx.bumpPanelVersion();
      }
      break;
    }
    case "colle": {
      if (!isMd) return;
      // Le main panel reste sur l'éditeur (règle structurelle) ; la vue colles
      // s'ouvre dans le side panel avec renderMode "colle".
      const existing = findSideTabFor(ctx, ctx.activePath);
      if (existing) {
        ctx.pm.side.setRenderMode(existing.id, "colle");
        ctx.pm.side.select(existing.id);
        ctx.setSideVisible(true);
        ctx.pm.sideVisible = true;
      } else {
        ctx.pm.openInSide(ctx.activePath!, { preview: true, forceNew: true, ...viewerSpaceOpts(ctx) }).catch(() => {});
        const tab = ctx.pm.side.tabs.find((t: any) => t.id === ctx.pm.side.activeTabId);
        if (tab) ctx.pm.side.setRenderMode(tab.id, "colle");
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

// FORWARD SEARCH RETIRÉ (Phase G — D12/R15) : `synctex_forward` (clic gouttière
// tex → page du PDF) n'a jamais fonctionné en pratique. L'INVERSE search
// (PDF → source, `inverseSync`) est conservé — c'est lui qui sert.

/**
 * Inverse search (PDF → source). Sphère pinned (Phase D — règle 1.3
 * « historique de montage, inverse search et drafts ne concernent QUE les
 * pinned tabs ») : si un slot du format est épinglé, la source est montée DANS
 * le slot (re-point, historique de montage empilé) — y compris pour un fichier
 * INCLUS (excursion : le viewer reste sur le PDF du maître, R7). Sans slot
 * épinglé, comportement historique : tab existant activé, sinon ouverture.
 */
export async function inverseSync(ctx: EditorModeDeps, file: string, line: number) {
  const normFile = file.replace(/\\/g, "/").split("/").filter(s => s !== ".").join("/");
  const ext = ctx.extFromPath(normFile);
  const mounted = await ctx.mountInPinnedSlot?.(normFile);
  if (!mounted) {
    const found = ctx.pm.findTabByPath(normFile);
    if (found && found.panel === "main") {
      ctx.pm.main.select(found.tab.id);
    } else {
      await ctx.pm.openInMain(normFile, { silent: true, preview: true, sourceType: ext === "tex" ? "latex" : undefined });
    }
  }
  ctx.setJumpToLine(line - 1);
  setEditorMode(ctx, "raw");
}

export async function jumpToLine(ctx: EditorModeDeps, line: number, path?: string | null) {
  const target = path ?? ctx.pm.side.activeTab?.path;
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
