import { expect, test } from "bun:test";

// Bun n'embarque pas de localStorage : polyfill minimal avant tout usage.
(globalThis as Record<string, unknown>).localStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  };
})();

import { PanelManager, type PanelManagerSession } from "../src/lib/panel-manager";
import { ContentStore, type ContentFs } from "../src/lib/content-store";
import { restorePreviewLinks, selectSideActiveTab } from "../src/lib/session-restore";
import type { SessionSideData } from "../src/lib/session";
import { setSessionScope, saveSession, loadSession } from "../src/lib/session";
import { findTabByPath } from "../src/lib/session-utils";
import { navigate, type NavDeps } from "../src/lib/navigation";
import { followPreviewNavigation } from "../src/lib/preview-follow";

setSessionScope("/test-vault");

// ── Tests de la SYNCHRO éditeur→viewer avec le VRAI PanelManager + ContentStore
// (les tests du reducer utilisent des fakes ; ici c'est la preuve runtime du
// comportement réel : couplage explicite par tab, recyclage du tab éditeur,
// restauration du couplage au boot).

function makeFakeFs(files: Record<string, string>): ContentFs {
  const drafts = new Map<string, string>();
  return {
    async readText(path: string) {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return files[path];
    },
    async writeText(path: string, text: string) {
      files[path] = text;
    },
    saveDraft(path: string, text: string) {
      drafts.set(path, text);
    },
    loadDraft(path: string) {
      return drafts.get(path) ?? null;
    },
    clearDraft(path: string) {
      drafts.delete(path);
    },
  };
}

function makeDeps(pm: PanelManager): NavDeps {
  return {
    pm,
    rootPath: () => "/vault",
    activePath: () => pm.main.activePath,
    sideActivePath: () => pm.side.activePath,
    expandedPanel: () => null,
    isPreviewNavMode: () => false,
    setPreviewNavMode: () => {},
    unexpandSide: () => {},
    navPush: () => {},
    navBack: () => null,
    navForwardStep: () => null,
    navPushForward: () => {},
    setScrollTarget: () => {},
    setSyncLine: () => {},
    setJumpToLine: () => {},
    setEditorModeRaw: () => {},
    setSideVisible: () => {},
    notifyError: () => {},
    notifyInfo: () => {},
    t: (k: string) => k,
    readText: async (p: string) => files[p],
    trackMtime: async () => {},
    jumpToLine: () => {},
    openDocArticle: async () => {},
    ensureDailyNote: async () => null,
    journalScan: async () => {},
  };
}

const files: Record<string, string> = { "/a.md": "a", "/b.md": "b", "/c.md": "c" };

/** Ouvre l'éditeur sur `path` et son viewer (comme setEditorMode("preview")).
 *  Phase G : aucun couplage à créer — les tabs se reconnaissent par contenu. */
async function openLinked(pm: PanelManager, path: string, mode = "preview") {
  await pm.openInMain(path);
  const mainId = pm.main.activeTabId!;
  await pm.side.open(path, { preview: true, forceNew: true });
  const sideId = pm.side.activeTabId!;
  pm.side.setRenderMode(sideId, mode as never);
  return { mainId, sideId };
}


test("boot : le tab side ACTIF de la session est sélectionné dans le panel SIDE (bug : id cherché dans main)", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  await pm.openInMain("/a.md");
  await pm.openInMain("/b.md");
  await pm.openInSide("/a.md", { silent: true });
  await pm.openInSide("/b.md", { silent: true });
  pm.side.tabs = pm.side.tabs.map((t) => ({ ...t, preview: true }));

  // La session dit : tab side actif = /b.md (l'ordre de restauration finit
  // sur /a.md — le select du boot doit rétablir /b.md).
  const sideSession: SessionSideData = {
    tabs: [
      { path: "/a.md", title: "a.md" },
      { path: "/b.md", title: "b.md" },
    ],
    activePath: "/b.md",
    visible: true,
  };

  // Comportement BUGUÉ (avant correctif) : findTabByPath cherche dans le panel
  // MAIN, puis on sélectionne cet id dans le panel side → aucun tab ne matche.
  const wrong = findTabByPath(pm, sideSession.activePath!);
  expect(wrong).not.toBeUndefined();
  if (wrong) pm.side.select(wrong.id as string);
  expect(pm.side.activePath).not.toBe("/b.md"); // l'id main est invalide en side

  // Correctif : la résolution se fait dans le panel SIDE → /b.md est rétabli.
  selectSideActiveTab(pm, sideSession.activePath);
  expect(pm.side.activePath).toBe("/b.md");
});

// ── Phase E — SESSION SCHEMA V2 : la session ne persiste QUE le contenu des
// onglets. Aucun état de couplage (`linkedTo` v1 supprimé), aucun espace
// pinned, aucun historique : le couplage est reconstruit PAR CONTENU au boot
// (D1) et un couple divergent est structurellement impossible ──

test("session v2 : toJSON ne persiste AUCUN état runtime (couplage, espace, propriétaire, dormance)", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  const { mainId, sideId } = await openLinked(pm, "/a.md");
  pm.setMainPinned(mainId, true);
  pm.side.setSpace(sideId, "pinned", mainId);

  const json = pm.toJSON();
  const entry = json.side.tabs.find((t) => t.path === "/a.md")!;

  expect(entry).not.toHaveProperty("linkedTo");
  expect(entry).not.toHaveProperty("space");
  expect(entry).not.toHaveProperty("pinnedOwner");
  expect(entry).not.toHaveProperty("dormant");
  expect(json.main.tabs.find((t) => t.path === "/a.md")).not.toHaveProperty("space");
});

// ── Phase E — BOOT « rien que du texte pur » : les viewers restaurés sont des
// onglets DORMANTS (visibles, grisés), montés au premier clic ──

test("boot : un viewer restauré est DORMANT — aucun contenu lu tant qu'il n'est pas cliqué", async () => {
  let reads = 0;
  const fs = makeFakeFs(files);
  const store = new ContentStore({ ...fs, readText: async (p) => { reads++; return fs.readText(p); } });
  const pm = new PanelManager({ content: store });

  const id = pm.side.restoreDormantTab({ path: "/a.md", title: "a.md", renderMode: "preview" });

  expect(pm.side.tabs).toHaveLength(1);
  expect(pm.side.tabs[0].dormant).toBe(true);
  expect(pm.side.tabs[0].source).toBe("");
  expect(reads).toBe(0); // AUCUNE lecture disque au boot

  await pm.side.wake(id);

  expect(pm.side.tabs[0].dormant).toBeUndefined();
  expect(pm.side.tabs[0].source).toBe(files["/a.md"]);
  expect(reads).toBe(1);
});

test("boot : le clic réveille le tab dormant (select → wake), et le réveil est idempotent", async () => {
  let reads = 0;
  const fs = makeFakeFs(files);
  const store = new ContentStore({ ...fs, readText: async (p) => { reads++; return fs.readText(p); } });
  const pm = new PanelManager({ content: store });
  const id = pm.side.restoreDormantTab({ path: "/a.md" });

  pm.side.select(id);
  await pm.side.wake(id); // second appel : déjà éveillé → no-op
  await new Promise((r) => setTimeout(r, 0));

  expect(pm.side.tabs[0].dormant).toBeUndefined();
  expect(reads).toBe(1);
});

test("boot : un viewer dormant dont le fichier a disparu est retiré au réveil (jamais d'onglet fantôme)", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const errors: string[] = [];
  const pm = new PanelManager({ content: store, onError: (title) => errors.push(title) });
  const id = pm.side.restoreDormantTab({ path: "/missing.md" });

  await pm.side.wake(id);

  expect(pm.side.tabs).toHaveLength(0);
  expect(errors).toHaveLength(1);
});

test("boot : l'onglet side ACTIF restauré reste DORMANT (aucun rendu au boot, réveil au clic)", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  const id = pm.side.restoreDormantTab({ path: "/a.md" });

  selectSideActiveTab(pm, "/a.md");

  expect(pm.side.activeTabId).toBe(id);
  expect(pm.side.tabs[0].dormant).toBe(true); // toujours grisé : rien n'a été monté

  pm.side.select(id); // clic utilisateur
  await new Promise((r) => setTimeout(r, 0));
  expect(pm.side.tabs[0].dormant).toBeUndefined();
});
