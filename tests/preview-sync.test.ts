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

test("runtime : repoint éditeur échoué → ROMPT le couplage (viewer navigue seul, jamais d'état divergent)", async () => {
  // Preview-follow : le viewer navigue vers /missing.md (illisible, absent du
  // fs). Le tab éditeur lié ne peut pas suivre → la règle forte exige la
  // RUPTURE du lien (le viewer continue seul, l'éditeur reste sur /a.md).
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  const { sideId } = await openLinked(pm, "/a.md");
  expect(pm.linkedEditorTabId(sideId)).not.toBeNull();

  const res = await followPreviewNavigation(pm, "/missing.md");

  expect(res.followed).toBe(false);
  expect(res.parked).toBe(false);
  expect(pm.linkedEditorTabId(sideId)).toBeNull();
  expect(pm.main.activePath).toBe("/a.md");
});


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

test("session v2 : fromJSON re-couple PAR CONTENU (viewer et éditeur du même fichier)", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  const { mainId } = await openLinked(pm, "/a.md");
  // Un second viewer, sur un autre fichier, sans éditeur correspondant.
  await pm.openInSide("/b.md", { silent: true, forceNew: true });

  const pm2 = new PanelManager({ content: store });
  pm2.fromJSON(pm.toJSON());

  const sideA = pm2.side.tabs.find((t) => t.path === "/a.md")!;
  const sideB = pm2.side.tabs.find((t) => t.path === "/b.md")!;
  const mainA = pm2.main.tabs.find((t) => t.path === "/a.md")!;
  expect(pm2.linkedEditorTabId(sideA.id)).toBe(mainA.id);
  // Aucun éditeur /b.md : le viewer reste indépendant (jamais de couplage vers
  // un fichier différent — la divergence est impossible par construction).
  expect(pm2.linkedEditorTabId(sideB.id)).toBeNull();
  expect(mainId).not.toBe(mainA.id); // ids RÉGÉNÉRÉS : c'est bien le contenu qui identifie
});

test("session v2 : éditeur fermé puis rouvert → le couplage revit au boot (identité par contenu)", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  const { mainId } = await openLinked(pm, "/a.md");
  await pm.main.close(mainId);
  await pm.openInMain("/a.md"); // nouvel id

  const pm2 = new PanelManager({ content: store });
  pm2.fromJSON(pm.toJSON());

  const sideA = pm2.side.tabs.find((t) => t.path === "/a.md")!;
  const mainA = pm2.main.tabs.find((t) => t.path === "/a.md")!;
  expect(pm2.linkedEditorTabId(sideA.id)).toBe(mainA.id);
});

test("session v2 : E2E — saveSession → localStorage → boot → couplage reconstruit par contenu", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  await pm.openInMain("/a.md");
  await pm.side.open("/a.md", { preview: true, forceNew: true });

  const data = pm.toJSON();
  saveSession({ main: data.main, side: { ...data.side, visible: true } });
  const loaded = loadSession();
  // La session écrite ne contient plus rien du couplage.
  expect(loaded.side.tabs.find((t) => t.path === "/a.md")).not.toHaveProperty("linkedTo");

  const pm2 = new PanelManager({ content: store });
  await pm2.openInMain("/a.md");
  await pm2.openInSide("/a.md", { silent: true });
  restorePreviewLinks(pm2);

  const sideA = pm2.side.tabs.find((t) => t.path === "/a.md")!;
  const mainA = pm2.main.tabs.find((t) => t.path === "/a.md")!;
  expect(pm2.linkedEditorTabId(sideA.id)).toBe(mainA.id);
});

test("session v2 : une session v1 (avec linkedTo) reste lisible — la clé est simplement ignorée", async () => {
  const store = new ContentStore(makeFakeFs(files));
  const pm = new PanelManager({ content: store });
  // Session v1 : le viewer /a.md porte linkedTo, le viewer /b.md linkedTo null.
  pm.fromJSON({
    main: { tabs: [{ path: "/a.md", title: "a.md" }], activePath: "/a.md" },
    side: {
      tabs: [
        { path: "/a.md", title: "a.md", linkedTo: "/a.md" },
        { path: "/b.md", title: "b.md", linkedTo: null },
      ],
      activePath: "/a.md",
    },
    layout: "main+side",
    splitRatio: 0.5,
  } as unknown as PanelManagerSession);

  const sideA = pm.side.tabs.find((t) => t.path === "/a.md")!;
  const sideB = pm.side.tabs.find((t) => t.path === "/b.md")!;
  const mainA = pm.main.tabs.find((t) => t.path === "/a.md")!;
  // Reconstruction par contenu : /a.md couplé (éditeur du même fichier),
  // /b.md indépendant (aucun éditeur) — le linkedTo persisté n'est plus lu.
  expect(pm.linkedEditorTabId(sideA.id)).toBe(mainA.id);
  expect(pm.linkedEditorTabId(sideB.id)).toBeNull();
  // Migration one-shot : la prochaine sauvegarde écrit le schema v2.
  expect(pm.toJSON().side.tabs[0]).not.toHaveProperty("linkedTo");
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
