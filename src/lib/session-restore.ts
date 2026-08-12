import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { loadSession, saveSession, saveLastFile, loadLastFile } from "@/lib/session";
import { loadProjectSession } from "@/lib/project-session";
import { tabContentKind } from "@/lib/panel-store";
import type { PanelManager } from "@/lib/panel-manager";

export interface SessionRestoreDeps {
  pm: PanelManager
  projectRoot: string | null
  openFileInTab: (path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean; sourceType?: "latex" }) => Promise<void>
  findTabByPath: (path: string) => { id: string; panel: string } | undefined
  setSideVisible: (v: boolean) => void
  setRootPath: (v: string | null) => void
  setSessionScope: (v: string | null) => void
  folders: { current: string[]; update: (fn: () => string[]) => void }
  setProjectRoot: (v: string | null) => void
  loadGuests: () => string[]
  handleOpenProjectByPath: (folder: string) => Promise<void>
}

export function setupSessionRestore(
  ctx: SessionRestoreDeps,
  urlRoot: string | null,
): () => void {
  let cancelled = false;
  let unlisteners: (() => void)[] = [];

  listen<string>("azprose:open-file", (event) => {
    const path = event.payload;
    if (cancelled) return;
    if (typeof path === "string" && path.length > 0) {
      void ctx.openFileInTab(path).catch(() => {});
    }
  }).then((un) => {
    if (cancelled) { un(); return; }
    unlisteners.push(un);
    void invoke<string[]>("take_pending_open_files")
      .then(async (paths) => {
        if (cancelled) return;
        const latest = paths[paths.length - 1];
        if (latest) {
          void ctx.openFileInTab(latest).catch(() => {});
        } else {
          let session = loadSession();
          if (session.main.tabs.length === 0 && ctx.projectRoot) {
            const portable = await loadProjectSession(ctx.projectRoot);
            if (portable && portable.main.tabs.length > 0) {
              session = { main: portable.main, side: portable.side };
              saveSession(session);
              if (portable.lastFile) saveLastFile(portable.lastFile);
            }
          }
          if (session.main.tabs.length > 0) {
            for (const tab of session.main.tabs) {
              if (cancelled) break;
              await ctx.openFileInTab(tab.path, { preferDraft: true, silent: true, sourceType: tab.sourceType });
            }
            if (!cancelled && session.main.activePath) {
              const active = ctx.findTabByPath(session.main.activePath);
              if (active) ctx.pm.main.select(active.id);
            }
            if (session.side.visible && session.side.tabs.length > 0) {
              // Phase E (R9) : les viewers restaurés sont DORMANTS — onglets
              // visibles et grisés, AUCUN travail au boot (ni lecture disque ni
              // rendu markdown/PDF, « rien que du texte pur ») ; le premier
              // clic les monte (`PanelState.wake`). Le flag `preview` est posé
              // d'emblée (chaque entrée crée son onglet, pas de ré-affectation).
              for (const tab of session.side.tabs) {
                if (cancelled) break;
                ctx.pm.side.restoreDormantTab({
                  path: tab.path,
                  title: tab.title,
                  renderMode: tab.renderMode,
                  sourceType: tab.sourceType,
                  kind: tab.kind,
                });
              }
              // Couplage éditeur↔viewer reconstruit PAR CONTENU (Phase E — D1 :
              // plus aucun état de couplage persisté, les tabs se reconnaissent
              // par leur contenu).
              restorePreviewLinks(ctx.pm);
              if (!cancelled) {
                // Sélectionne le tab SIDE actif de la session dans le panel
                // SIDE (par chemin normalisé) — jamais via findTabByPath qui
                // ne cherche que dans le panel MAIN : sélectionner un id de
                // tab main dans le panel side ne correspond à aucun tab (bug :
                // au boot, le tab side actif restauré ne redevenait pas celui
                // de la session). Sans chemin actif, le panel reste visible
                // avec ses onglets (dormants) — la visibilité vient de la
                // session, jamais d'un effet de bord d'ouverture.
                selectSideActiveTab(ctx.pm, session.side.activePath);
                ctx.setSideVisible(true);
              }
            }
          } else {
            const lastFile = loadLastFile();
            if (lastFile) {
              void ctx.openFileInTab(lastFile, { preferDraft: true }).catch(() => {
                saveLastFile(null);
              });
            }
          }
        }
      })
      .catch((err) => console.warn("azprose: pending open-file check failed", err));
  });

  void invoke<string | null>("take_project_folder", { label: "main" }).then((dir) => {
    if (cancelled) return;
    if (dir && !urlRoot) {
      ctx.setRootPath(dir);
      ctx.setSessionScope(dir);
      ctx.folders.update(() => [dir, ...ctx.loadGuests().filter((g) => g !== dir)]);
      ctx.setProjectRoot(dir);
    }
  });

  listen<string>("azprose:open-project", (event) => {
    const dir = event.payload;
    if (cancelled) return;
    if (typeof dir === "string" && dir.length > 0) {
      void ctx.handleOpenProjectByPath(dir);
    }
  }).then((un) => {
    if (cancelled) return;
    unlisteners.push(un);
  });

  return () => {
    cancelled = true;
    unlisteners.forEach((u) => u());
  };
}

/**
 * Reconstruit le couplage éditeur↔viewer au boot — PAR CONTENU (Phase E, D1 :
 * « plus aucun état de couplage persisté, les tabs se reconnaissent par leurs
 * contenus »). Un tab viewer et un tab éditeur affichant le MÊME fichier sont
 * couplés ; tout le reste est indépendant.
 *
 * Le registre `previewLinks` est un état runtime ids-only et les ids de tabs
 * sont RÉGÉNÉRÉS au restore : le contenu est le seul identifiant stable d'une
 * session à l'autre. Le champ `linkedTo` (schema v1) n'est plus ni écrit ni
 * lu — un couplage divergent est structurellement impossible ici, puisque la
 * seule porte d'entrée est l'égalité des chemins.
 *
 * L'invariant « un seul viewer couplé par éditeur » est maintenu par
 * `linkPreview` (coupler un viewer découple automatiquement l'autre).
 */
export function restorePreviewLinks(pm: PanelManager): void {
  for (const s of pm.side.tabs) {
    if (tabContentKind(s.kind) !== "file" || !s.path) continue;
    const target = pm.main.tabs.find(
      (t) => tabContentKind(t.kind) === "file" && normPath(t.path) === normPath(s.path),
    );
    if (target) pm.linkPreview(s.id, target.id);
  }
}

const normPath = (p: string) => p.split("/").filter((s) => s !== ".").join("/");

/** Sélectionne le tab SIDE actif de la session au boot — cherché dans le
 *  panel SIDE par chemin normalisé (les tabs side sont restaurés via
 *  openInSide → ids régénérés, le chemin est le seul identifiant stable).
 *  Ne JAMAIS chercher dans le panel main (session-utils.findTabByPath) puis
 *  sélectionner cet id dans le panel side : l'id n'y existe pas (bug fixé). */
export function selectSideActiveTab(pm: PanelManager, activePath: string | null): void {
  if (!activePath) return;
  const sideTab = pm.side.tabs.find((t) => normPath(t.path) === normPath(activePath));
  // `wake: false` (Phase E — R9) : l'onglet actif restauré reste DORMANT (grisé,
  // rien de monté) ; c'est le premier clic de l'utilisateur qui le réveille —
  // le boot ne fait « rien que du texte pur ».
  if (sideTab) pm.side.select(sideTab.id, { wake: false });
}
