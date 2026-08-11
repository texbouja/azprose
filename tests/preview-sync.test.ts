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

import { PanelManager } from "../src/lib/panel-manager";
import { ContentStore, type ContentFs } from "../src/lib/content-store";
import { restorePreviewLinks } from "../src/lib/session-restore";
import type { SessionSideData } from "../src/lib/session";
import { setSessionScope } from "../src/lib/session";
import { navigate, type NavDeps } from "../src/lib/navigation";

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

/** Ouvre l'éditeur sur `path` et un viewer lié (comme setEditorMode("preview")). */
async function openLinked(pm: PanelManager, path: string, mode = "preview") {
  await pm.openInMain(path);
  const mainId = pm.main.activeTabId!;
  await pm.side.open(path, { preview: true, forceNew: true });
  const sideId = pm.side.activeTabId!;
  pm.side.setRenderMode(sideId, mode as never);
  pm.linkPreview(sideId, mainId);
  return { mainId, sideId };
}

test("synchro : clic sidebar (open-active) → le viewer COUPLÉ suit le tab éditeur recyclé", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  await openLinked(pm, "/a.md");
  expect(pm.side.activePath).toBe("/a.md");

  await navigate(makeDeps(pm), { type: "open-active", path: "/b.md" });

  expect(pm.main.activePath).toBe("/b.md");
  expect(pm.side.activePath).toBe("/b.md");
});

test("synchro : le recyclage avec BROUILLON parké (politique A) ne casse pas le suivi", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  await openLinked(pm, "/a.md");
  // Flux réel de l'éditeur (app.svelte onSourceChange) : buffer du store +
  // reflet du tab main — rend `source !== savedContent` → park à la nav.
  store.setBuffer("/a.md", "a modifié");
  pm.main.setSource("a modifié");

  await navigate(makeDeps(pm), { type: "open-active", path: "/b.md" });

  expect(pm.side.activePath).toBe("/b.md");
  expect(store.getDraft("/a.md")).toBe("a modifié");
});

test("synchro : un viewer en mode COLLE suit le recyclage et retombe en preview sur la cible", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  await openLinked(pm, "/a.md", "colle");
  expect(pm.side.activeTab?.renderMode).toBe("colle");

  await navigate(makeDeps(pm), { type: "open-active", path: "/b.md" });

  expect(pm.side.activePath).toBe("/b.md");
  expect(pm.side.activeTab?.renderMode).toBe("preview");
});

test("restore : restorePreviewLinks re-couple les viewers au tab éditeur du même chemin", async () => {
  // Simule le boot (session-restore) : tabs main PUIS tabs side restaurés par
  // chemin, SANS couplage (le registre previewLinks est un état runtime).
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  await pm.openInMain("/a.md");
  const mainA = pm.main.activeTabId!;
  await pm.openInMain("/b.md");
  const mainB = pm.main.activeTabId!;
  // Un tab d'outil en main (jamais couplable) + le tab actif repointe sur A.
  pm.main.openCustom("datafilter", "Filtre");
  pm.main.select(mainA);

  await pm.openInSide("/a.md", { silent: true });
  const sideA = pm.side.activeTabId!;
  await pm.openInSide("/b.md", { silent: true });
  const sideB = pm.side.activeTabId!;
  await pm.side.openCustom("datafilter", "Filtre"); // outil side : jamais couplé
  // Stamp du flag preview (miroir du restore réel).
  pm.side.tabs = pm.side.tabs.map((t) => ({ ...t, preview: true }));

  expect(pm.sideTabLinkedTo(mainA)).toBeNull(); // avant restauration : aucun lien

  restorePreviewLinks(pm);

  // Couplages par chemin : sideA↔mainA, sideB↔mainB ; l'outil n'est PAS couplé.
  expect(pm.linkedEditorTabId(sideA)).toBe(mainA);
  expect(pm.linkedEditorTabId(sideB)).toBe(mainB);
  expect(pm.sideTabLinkedTo(mainA)).toBe(sideA);
  expect(pm.sideTabLinkedTo(mainB)).toBe(sideB);

  // La synchro redevient fonctionnelle après restauration : clic sidebar sur
  // /c.md (pas encore ouvert en main) → le tab éditeur actif (mainA, /a.md) est
  // recyclé → le viewer couplé sideA suit et devient /c.md (l'outil side actif,
  // lui, n'est jamais repointé).
  await navigate(makeDeps(pm), { type: "open-active", path: "/c.md" });
  expect(pm.main.activePath).toBe("/c.md");
  expect(pm.side.tabs.find((t) => t.id === sideA)?.path).toBe("/c.md");
  expect(pm.side.activeTab?.kind).toBe("custom");
});

test("restore : pas de re-couplage quand le chemin n'existe pas en main (viewer indépendant)", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  await pm.openInMain("/a.md");
  await pm.openInSide("/b.md", { silent: true }); // /b.md n'a pas d'équivalent main

  restorePreviewLinks(pm);

  expect(pm.linkedEditorTabId(pm.side.activeTabId!)).toBeNull();
});

// ── Couplage PERSISTÉ (linkedTo) : le couplage éditeur↔viewer survit au
// redémarrage, même quand le viewer a divergé du chemin du tab éditeur lié ──

test("session : toJSON persiste le couplage (linkedTo) et fromJSON le restaure", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  await openLinked(pm, "/a.md");

  const json = pm.toJSON();
  // Le viewer couplé porte linkedTo = chemin du tab éditeur lié.
  expect(json.side.tabs.find((t) => t.path === "/a.md")?.linkedTo).toBe("/a.md");

  // Un viewer INDÉPENDANT (ouvert par wikilink hors mode nav) n'écrit PAS de
  // linkedTo — jamais de faux couplage persisté.
  await pm.openInSide("/b.md", { silent: true });
  expect(pm.toJSON().side.tabs.find((t) => t.path === "/b.md")?.linkedTo).toBeUndefined();

  // Redémarrage simulé : fromJSON régénère les ids, le couplage revit.
  const pm2 = new PanelManager({ content: store });
  pm2.fromJSON(json);
  const sideTab = pm2.side.tabs.find((t) => t.path === "/a.md")!;
  const mainTab = pm2.main.tabs.find((t) => t.path === "/a.md")!;
  expect(pm2.linkedEditorTabId(sideTab.id)).toBe(mainTab.id);
  expect(pm2.sideTabLinkedTo(mainTab.id)).toBe(sideTab.id);
});

test("session : couplage vers un tab éditeur RE-POINTÉ — linkedTo = chemin actuel du tab lié", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  const { mainId, sideId } = await openLinked(pm, "/a.md");
  // Le tab éditeur LIÉ est re-pointé vers /c.md (sidebar, preview-follow) et le
  // viewer RESTE sur /a.md (repoint viewer silencieux échoué, navigation
  // openFile sans synchro : journal, oxide…). Le couplage tab→tab est intact —
  // c'est lui qui doit survivre au redémarrage, pas un appariement par chemin.
  await pm.main.repoint(mainId, "/c.md", { silent: true });
  expect(pm.side.activePath).toBe("/a.md");
  expect(pm.main.tabs.find((t) => t.id === mainId)?.path).toBe("/c.md");
  expect(pm.linkedEditorTabId(sideId)).toBe(mainId);

  const json = pm.toJSON();
  expect(json.side.tabs.find((t) => t.path === "/a.md")?.linkedTo).toBe("/c.md");

  const pm2 = new PanelManager({ content: store });
  pm2.fromJSON(json);
  const sideA = pm2.side.tabs.find((t) => t.path === "/a.md")!;
  const mainC = pm2.main.tabs.find((t) => t.path === "/c.md")!;
  expect(pm2.linkedEditorTabId(sideA.id)).toBe(mainC.id);
});

test("session : restorePreviewLinks — le couplage persisté (linkedTo) prime sur le path-match", async () => {
  // Boot simulé : main /a.md (éditeur indépendant) + /c.md (tab lié re-pointé) ;
  // le viewer /a.md est COUPLÉ au tab /c.md — le path-match legacy aurait
  // couplé à tort le viewer au tab /a.md.
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  await pm.openInMain("/a.md");
  const mainA = pm.main.activeTabId!;
  await pm.openInMain("/c.md");
  const mainC = pm.main.activeTabId!;
  await pm.openInSide("/a.md", { silent: true });
  const sideA = pm.side.activeTabId!;
  pm.side.tabs = pm.side.tabs.map((t) => ({ ...t, preview: true }));
  pm.main.select(mainA);

  // Session persistée : l'entrée side /a.md porte linkedTo=/c.md (explicite).
  const sideSession: SessionSideData = {
    tabs: [{ path: "/a.md", title: "a.md", linkedTo: "/c.md" }],
    activePath: "/a.md",
    visible: true,
  };
  restorePreviewLinks(pm, sideSession);

  expect(pm.linkedEditorTabId(sideA)).toBe(mainC);
  expect(pm.sideTabLinkedTo(mainA)).toBeNull();
});

test("session : linkedTo sans tab main au restore → pas de lien (couplage explicite mort, jamais de repli)", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  await pm.openInMain("/a.md");
  await pm.openInSide("/b.md", { silent: true });
  pm.side.tabs = pm.side.tabs.map((t) => ({ ...t, preview: true }));

  // linkedTo=/c.md mais AUCUN tab main /c.md au restore (fichier illisible) :
  // le couplage explicite est mort avec son éditeur — pas de déduction par
  // chemin qui pourrait coupler au mauvais éditeur.
  const sideSession: SessionSideData = {
    tabs: [{ path: "/b.md", title: "b.md", linkedTo: "/c.md" }],
    activePath: "/b.md",
    visible: true,
  };
  restorePreviewLinks(pm, sideSession);

  expect(pm.linkedEditorTabId(pm.side.activeTabId!)).toBeNull();
});
