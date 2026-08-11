import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { loadSession, saveSession, saveLastFile, loadLastFile } from "@/lib/session";
import type { SessionSideData } from "@/lib/session";
import { loadProjectSession } from "@/lib/project-session";
import { tabContentKind, type Tab } from "@/lib/panel-store";
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
              for (const tab of session.side.tabs) {
                if (cancelled) break;
                await ctx.pm.openInSide(tab.path, { silent: true, sourceType: tab.sourceType });
              }
              // Les tabs du side panel sont des previews : stamp le flag `preview`
              // APRÈS la boucle (le passer à open() ré-affecterait les onglets
              // précédemment restaurés au lieu d'en créer un par entrée). Le flag
              // sert à la ré-affectation en place des navigations open(…, { preview: true }).
              ctx.pm.side.tabs = ctx.pm.side.tabs.map(t => ({ ...t, preview: true }));
              // Restaure le couplage éditeur↔viewer (voir restorePreviewLinks) :
              // linkedTo persisté d'abord, repli path-match pour les sessions
              // legacy sauvegardées avant la persistance du couplage.
              restorePreviewLinks(ctx.pm, session.side);
              if (!cancelled && session.side.activePath) {
                // Sélectionne le tab SIDE actif de la session dans le panel
                // SIDE (par chemin normalisé) — jamais via findTabByPath qui
                // ne cherche que dans le panel MAIN : sélectionner un id de
                // tab main dans le panel side ne correspond à aucun tab (bug :
                // au boot, le tab side actif restauré ne redevenait pas celui
                // de la session).
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
 * Restaure le couplage éditeur↔viewer après la restauration des tabs (boot).
 * Le registre `previewLinks` du PanelManager est un état runtime ids-only —
 * jamais persisté tel quel — et les ids de tabs sont RÉGÉNÉRÉS au restore :
 * le chemin est le seul identifiant stable de la session.
 *
 * Règle forte (décision utilisateur) : en état de couplage, un tab éditeur et
 * un tab viewer affichent strictement le MÊME md — un état divergent est
 * IMPOSSIBLE (ruptures runtime + gardes au save/restore). Cette fonction n'en
 * restaure donc jamais un : la cohérence `linkedTo == chemin du viewer` est la
 * seule porte d'entrée.
 *
 * Deux familles de sessions :
 *  1. **Modernes** (au moins un tab side porte la clé `linkedTo`, écrite
 *     SYSTÉMATIQUEMENT string|null par PanelManager.toJSON) : `linkedTo` est
 *     EXPLICITE et fait foi.
 *      - `linkedTo` = chemin (cohérent, == chemin du viewer par construction)
 *        → re-couplage vers le tab éditeur main de ce chemin. Si ce tab
 *        n'existe pas au restore (fichier illisible) → PAS de repli : le
 *        couplage explicite est mort avec son éditeur.
 *      - `linkedTo` = null → viewer EXPLICITEMENT indépendant, JAMAIS re-couplé
 *        (l'ancien path-match déduisait un couplage là où l'utilisateur avait
 *        choisi l'indépendance — l'information est désormais persistée).
 *      - `linkedTo` ≠ chemin du viewer (donnée corrompue ou session d'une
 *        version antérieure au correctif règle forte) → IGNORÉ : jamais d'état
 *        divergent restauré, et PAS de repli path-match non plus (le champ
 *        explicite fait foi, y compris pour dire « rien »).
 *  2. **Legacy** (aucune clé `linkedTo`) : repli path-match historique — un tab
 *     side de fichier affichant le même chemin qu'un tab main est re-couplé.
 *     Faux positif bénin documenté : viewer indépendant + éditeur du même
 *     fichier → le viewer suit l'éditeur (règle de défaut attendue). Transition
 *     de migration : dès le premier changement de session, toJSON écrit
 *     `linkedTo` partout et la session devient moderne.
 *
 * Sûr par construction :
 *  - le mode nav n'est PAS persisté (état d'interaction éphémère par tab) →
 *    aucun viewer restauré n'est en mode nav, donc jamais de re-couplage d'un
 *    viewer qui aurait été volontairement libéré ;
 *  - l'invariant « un seul viewer couplé par éditeur » est maintenu par
 *    `linkPreview` (coupler un viewer découple automatiquement l'autre).
 */
export function restorePreviewLinks(
  pm: PanelManager,
  sideSession?: SessionSideData,
): void {
  const modern = sideSession?.tabs.some((e) => "linkedTo" in e) ?? false;
  for (const s of pm.side.tabs) {
    if (tabContentKind(s.kind) !== "file" || !s.path) continue;
    // L'entrée de session du viewer restauré, par chemin (les tabs side sont
    // dédupliqués par chemin → correspondance unique).
    const entry = sideSession?.tabs.find(
      (e) => normPath(e.path) === normPath(s.path),
    );
    let target: Tab | undefined;
    if (modern) {
      const linkedPath = entry?.linkedTo;
      // Règle forte : un linkedTo cohérent (== chemin du viewer) est la seule
      // porte d'entrée — un chemin divergent (donnée corrompue) est IGNORÉ.
      if (linkedPath && normPath(linkedPath) === normPath(s.path)) {
        target = pm.main.tabs.find(
          (t) => tabContentKind(t.kind) === "file" && normPath(t.path) === normPath(linkedPath),
        );
      }
    } else {
      // Session legacy (sans clé linkedTo) : repli par chemin (viewer ↔
      // éditeur du même fichier).
      target = pm.main.tabs.find(
        (t) => tabContentKind(t.kind) === "file" && normPath(t.path) === normPath(s.path),
      );
    }
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
  if (sideTab) pm.side.select(sideTab.id);
}
