import { expect, test } from "bun:test";
import {
  PanelState,
  pickOpenTarget,
  tabContentKey,
  targetContentKey,
  tabPinFormat,
  canPinTab,
  tabSpace,
  type Tab,
} from "../src/lib/panel-store";
import { ContentStore, type ContentFs } from "../src/lib/content-store";

/** Fake fs DI — le ContentStore est PUR : aucun Tauri requis. */
function makeFakeFs(initial: Record<string, string> = {}) {
  const disk = new Map(Object.entries(initial));
  const drafts = new Map<string, string>();
  const fs: ContentFs = {
    async readText(path) {
      const v = disk.get(path);
      if (v === undefined) throw new Error(`ENOENT ${path}`);
      return v;
    },
    async writeText(path, text) {
      disk.set(path, text);
    },
    saveDraft(path, text) {
      drafts.set(path, text);
    },
    loadDraft(path) {
      return drafts.get(path) ?? null;
    },
    clearDraft(path) {
      drafts.delete(path);
    },
  };
  return { fs, disk, drafts };
}

function mkTab(over: Partial<Tab>): Tab {
  return { id: "t", title: "t.md", path: "/t.md", source: "", savedContent: "", ...over };
}

// ── Phase A : identité par CONTENU (contentKey) ────────────────────────────

test("contentKey : fichier = chemin normalisé (drop des segments .)", () => {
  const a = mkTab({ path: "/a/./b.md" });
  const b = mkTab({ path: "/a/b.md" });
  expect(tabContentKey(a)).toBe("/a/b.md");
  expect(tabContentKey(b)).toBe("/a/b.md");
});

test("contentKey : datafilter = ensemble TRIÉ des ids (le path est partagé)", () => {
  const a = mkTab({ path: "datafilter://stack", kind: "datafilter", datafilterIds: ["z", "a"] });
  const b = mkTab({ path: "datafilter://stack", kind: "datafilter", datafilterIds: ["a", "z"] });
  const c = mkTab({ path: "datafilter://stack", kind: "datafilter", datafilterIds: ["a"] });
  expect(tabContentKey(a)).toBe(tabContentKey(b));
  expect(tabContentKey(a)).not.toBe(tabContentKey(c));
});

test("contentKey : custom/spreadsheet = chemin unique par identité", () => {
  expect(tabContentKey(mkTab({ path: "custom://calendar", kind: "custom" }))).toBe("custom://calendar");
  expect(tabContentKey(mkTab({ path: "spreadsheet://42", kind: "spreadsheet" }))).toBe("spreadsheet://42");
});

test("targetContentKey : même convention que tabContentKey", () => {
  expect(targetContentKey("/a/./b.md")).toBe("/a/b.md");
  expect(targetContentKey("datafilter://stack", "datafilter", ["z", "a"])).toBe(
    tabContentKey(mkTab({ path: "datafilter://stack", kind: "datafilter", datafilterIds: ["a", "z"] })),
  );
});

// ── Phase A : format d'épingle + épinglabilité ─────────────────────────────

test("tabPinFormat : extension en minuscule, null sans extension", () => {
  expect(tabPinFormat("/a/b.md")).toBe("md");
  expect(tabPinFormat("/a/B.TEX")).toBe("tex");
  expect(tabPinFormat("/a/noext")).toBeNull();
});

test("canPinTab : seuls les tabs de fichier TEXTE sont épinglables", () => {
  expect(canPinTab(mkTab({ path: "/a.md" }))).toBe(true);
  expect(canPinTab(mkTab({ path: "/a.tex" }))).toBe(true);
  expect(canPinTab(mkTab({ path: "/a.pdf" }))).toBe(false); // viewer dédié
  expect(canPinTab(mkTab({ path: "/a.png" }))).toBe(false); // image
  expect(canPinTab(mkTab({ path: "/help/index.md", kind: "doc" }))).toBe(false); // aide
  expect(canPinTab(mkTab({ path: "spreadsheet://1", kind: "spreadsheet" }))).toBe(false); // outil
  expect(canPinTab(mkTab({ path: "/noext" }))).toBe(false);
});

// ── Phase A : épingle runtime (commutation par format, NON persistée) ──────

test("setPinned : épingler un tab, un seul épinglé par format (commutation)", () => {
  const p = new PanelState("main");
  p.tabs = [
    mkTab({ id: "a", path: "/a.md" }),
    mkTab({ id: "b", path: "/b.md" }),
    mkTab({ id: "c", path: "/c.tex" }),
  ];
  p.setPinned("a", true);
  expect(tabSpace(p.tabs[0])).toBe("pinned");
  // Épingler un autre .md commute : a redevient libre.
  p.setPinned("b", true);
  expect(tabSpace(p.tabs[1])).toBe("pinned");
  expect(tabSpace(p.tabs[0])).toBe("free");
  // Un format différent cohabite (un épinglé par format).
  p.setPinned("c", true);
  expect(tabSpace(p.tabs[2])).toBe("pinned");
  expect(p.tabs.filter(t => tabSpace(t) === "pinned")).toHaveLength(2);
  // Dé-épingler.
  p.setPinned("b", false);
  expect(tabSpace(p.tabs[1])).toBe("free");
});

test("setPinned : no-op sur un tab non épinglable (doc/outil/pdf)", () => {
  const p = new PanelState("main");
  p.tabs = [mkTab({ id: "d", path: "/help/x.md", kind: "doc" })];
  p.setPinned("d", true);
  expect(tabSpace(p.tabs[0])).toBe("free");
});

test("pinnedTab : retrouve le tab épinglé d'un format", () => {
  const p = new PanelState("main");
  p.tabs = [mkTab({ id: "a", path: "/a.md" }), mkTab({ id: "c", path: "/c.tex" })];
  p.setPinned("c", true);
  expect(p.pinnedTab("tex")?.id).toBe("c");
  expect(p.pinnedTab("md")).toBeUndefined();
});

test("épingle NON persistée : toJSON ne l'écrit jamais, fromJSON restaure tout libre (R9)", () => {
  const p = new PanelState("main");
  p.tabs = [mkTab({ id: "a", path: "/a.md" }), mkTab({ id: "b", path: "/b.md" })];
  p.setPinned("a", true);
  p.activeTabId = "a";

  const json = p.toJSON();
  expect(json.tabs[0]).not.toHaveProperty("space");

  const p2 = new PanelState("main");
  p2.fromJSON(json);
  // Boot : AUCUN tab épinglé — l'utilisateur ré-épingle (rounds 4-5).
  expect(p2.tabs.every(t => tabSpace(t) === "free")).toBe(true);
});

// ── Phase A : dédup PAR ESPACE (R3 — isolation des espaces) ────────────────

test("open : dédup par espace — le même fichier peut être épinglé ET libre", async () => {
  const { fs } = makeFakeFs({ "/a.md": "hello" });
  const store = new ContentStore(fs);
  const p = new PanelState("main", {}, store);

  await p.open("/a.md", { space: "pinned" });
  const pinnedId = p.activeTabId!;
  expect(tabSpace(p.activeTab!)).toBe("pinned");

  // Ouverture libre du MÊME fichier : dédup dans l'espace libre → nouveau tab.
  await p.open("/a.md");
  expect(p.activeTabId).not.toBe(pinnedId);
  expect(tabSpace(p.activeTab!)).toBe("free");
  expect(p.tabs).toHaveLength(2);

  // Ré-ouverture libre : dédup intra-espace → activation, pas de doublon.
  await p.open("/a.md");
  expect(p.tabs).toHaveLength(2);
  expect(tabSpace(p.activeTab!)).toBe("free");
});

// ── Phase A : pickOpenTarget filtré par espace ─────────────────────────────

test("pickOpenTarget : un tab ÉPINGLÉ n'est jamais la cible d'une ouverture libre", () => {
  const pinned = mkTab({ id: "pin", path: "/a.md", preview: true, space: "pinned" });
  const free = mkTab({ id: "free", path: "/b.md", preview: true });
  const tabs = [pinned, free];
  // Ré-affectation d'un onglet éphémère : le tab LIBRE est choisi, jamais le
  // pinned (isolation des espaces — R3).
  expect(pickOpenTarget(tabs, true, "free")).toEqual({ id: "free", isFallback: false });
  // Sans éphémère libre disponible → nouveau tab (le pinned reste intact).
  expect(pickOpenTarget([pinned], true, "free")).toEqual({ id: null, isFallback: false });
  // Une cible épinglée, elle, peut ré-affecter le tab épinglé.
  expect(pickOpenTarget(tabs, true, "pinned")).toEqual({ id: "pin", isFallback: false });
});

// ── Phase C : sphère pinned (adoption, libération, fermeture couplée) ───────

import { PanelManager } from "../src/lib/panel-manager";

/** Seed main+side sur des chemins distincts, tous libres. */
function seedPm(pm: PanelManager, main: Array<[string, string]>, side: Array<[string, string]>) {
  pm.main.tabs = main.map(([id, path]) => ({
    id, title: path.split("/").pop()!, path, source: "", savedContent: "",
  }));
  pm.main.activeTabId = main[0]?.[0] ?? null;
  pm.side.tabs = side.map(([id, path]) => ({
    id, title: path.split("/").pop()!, path, source: "", savedContent: "",
  }));
  pm.side.activeTabId = side[0]?.[0] ?? null;
}

test("setSpace : marque un tab pinned puis le libère (champ absent = libre)", () => {
  const p = new PanelState("side");
  p.tabs = [mkTab({ id: "s1", path: "/a.md" })];
  p.setSpace("s1", "pinned");
  expect(tabSpace(p.tabs[0])).toBe("pinned");
  p.setSpace("s1", "free");
  expect(tabSpace(p.tabs[0])).toBe("free");
  // Le champ est retiré (absent = libre) — jamais persisté par toJSON.
  expect(p.toJSON().tabs[0]).not.toHaveProperty("space");
});

test("adoption (R1 round 5) : épingler un éditeur ADOPTE le viewer side du même contenu", () => {
  const pm = new PanelManager();
  seedPm(pm, [["a", "/a.md"]], [["s1", "/a.md"]]);
  expect(tabSpace(pm.side.tabs[0])).toBe("free");

  pm.setMainPinned("a", true);
  // Le viewer /a.md (libre) devient le compagnon de la sphère pinned.
  expect(tabSpace(pm.side.tabs[0])).toBe("pinned");

  // Dé-épingler : le compagnon redevient libre.
  pm.setMainPinned("a", false);
  expect(tabSpace(pm.side.tabs[0])).toBe("free");
});

test("adoption : la commutation libère le viewer de l'ancien pinned, adopte celui du nouveau", () => {
  const pm = new PanelManager();
  seedPm(pm, [["a", "/a.md"], ["b", "/b.md"]], [["s1", "/a.md"], ["s2", "/b.md"]]);

  pm.setMainPinned("a", true);
  expect(tabSpace(pm.side.tabs[0])).toBe("pinned");
  expect(tabSpace(pm.side.tabs[1])).toBe("free");

  // Épingler b commute a (libre) → s2 adopté, s1 libéré.
  pm.setMainPinned("b", true);
  expect(tabSpace(pm.side.tabs[0])).toBe("free");
  expect(tabSpace(pm.side.tabs[1])).toBe("pinned");
});

test("adoption : le compagnon adopté APPARTIENT à la sphère de l'éditeur épinglé (D4)", () => {
  const pm = new PanelManager();
  seedPm(pm, [["a", "/a.md"]], [["s1", "/a.md"]]);
  expect(pm.pinnedCompanion("a")).toBeNull();

  pm.setMainPinned("a", true);

  // Phase G : plus de registre de couplage — l'appartenance à la sphère
  // (`pinnedOwner` = id du slot) EST la relation qui fait suivre le compagnon.
  expect(pm.pinnedCompanion("a")?.id).toBe("s1");
  expect(pm.side.tabs[0].pinnedOwner).toBe("a");

  pm.setMainPinned("a", false);
  expect(pm.pinnedCompanion("a")).toBeNull();
});

test("adoption : un viewer d'un AUTRE contenu n'est jamais adopté", () => {
  const pm = new PanelManager();
  seedPm(pm, [["a", "/a.md"]], [["s1", "/other.md"]]);
  pm.setMainPinned("a", true);
  expect(tabSpace(pm.side.tabs[0])).toBe("free");
});

test("fermeture couplée (R4) : fermer le pinned éditeur ferme son viewer pinned ; l'inverse non", () => {
  const pm = new PanelManager();
  seedPm(pm, [["a", "/a.md"], ["b", "/b.md"]], [["s1", "/a.md"], ["s2", "/b.md"]]);
  pm.setMainPinned("a", true);
  expect(tabSpace(pm.side.tabs[0])).toBe("pinned");

  // Fermer un éditeur LIBRE : aucun viewer ne bouge.
  pm.closeMainTab("b");
  expect(pm.side.tabs).toHaveLength(2);

  // Fermer le pinned : son viewer pinned part aussi (R4 — inverse non).
  pm.closeMainTab("a");
  expect(pm.main.tabs.map(t => t.id)).toEqual([]);
  expect(pm.side.tabs.map(t => t.id)).toEqual(["s2"]);
  expect(tabSpace(pm.side.tabs[0])).toBe("free");

  // Fermer un viewer (side) ne ferme JAMAIS l'éditeur.
  pm.closeMainTab("b"); // b n'existe plus (fermé) → no-op
  pm.side.close("s2");
  expect(pm.side.tabs).toHaveLength(0);
});

test("openInSide space: pinned : le viewer du bouton preview d'un éditeur épinglé vit dans la sphère pinned", async () => {
  const { fs } = makeFakeFs({ "/a.md": "hello" });
  const store = new ContentStore(fs);
  const pm = new PanelManager({ content: store });
  await pm.openInMain("/a.md", { space: "pinned" });
  const pinnedId = pm.main.activeTabId!;
  expect(tabSpace(pm.main.activeTab!)).toBe("pinned");

  await pm.openInSide("/a.md", { preview: true, forceNew: true, space: "pinned" });
  expect(tabSpace(pm.side.activeTab!)).toBe("pinned");

  // Dédup PAR ESPACE : une ré-ouverture libre du même contenu crée un viewer
  // LIBRE séparé (R2/R3 — duplication inter-espaces légale).
  await pm.openInSide("/a.md", { preview: true, forceNew: true });
  expect(pm.side.tabs).toHaveLength(2);
  expect(pm.side.tabs.filter(t => t.path === "/a.md" && tabSpace(t) === "pinned")).toHaveLength(1);
  expect(pm.side.tabs.filter(t => t.path === "/a.md" && tabSpace(t) === "free")).toHaveLength(1);
  expect(tabSpace(pm.side.activeTab!)).toBe("free");
});

// ── Phase C : viewer PDF latex (R7 — mécanisme maître, sphère pinned) ────────

test("openLatexViewerPdf : éditeur tex épinglé → viewer pinned (sphère pinned)", async () => {
  const { fs } = makeFakeFs({ "/main.tex": "\\documentclass{article}", "/out/main.pdf": "%PDF-1.4" });
  const store = new ContentStore(fs);
  const pm = new PanelManager({ content: store });
  await pm.openInMain("/main.tex", { space: "pinned" });
  expect(tabSpace(pm.main.activeTab!)).toBe("pinned");

  await pm.openLatexViewerPdf("/out/main.pdf");

  expect(pm.side.tabs).toHaveLength(1);
  expect(pm.side.activeTab?.path).toBe("/out/main.pdf");
  expect(tabSpace(pm.side.activeTab!)).toBe("pinned");
});

test("openLatexViewerPdf : adoption — un viewer libre du même PDF est adopté, jamais un doublon pinned", async () => {
  const { fs } = makeFakeFs({ "/main.tex": "\\documentclass{article}", "/out/main.pdf": "%PDF-1.4" });
  const store = new ContentStore(fs);
  const pm = new PanelManager({ content: store });
  await pm.openInMain("/main.tex", { space: "pinned" });
  await pm.openInSide("/out/main.pdf", { sourceType: "latex" }); // déjà ouvert, libre
  expect(pm.side.tabs).toHaveLength(1);
  expect(tabSpace(pm.side.activeTab!)).toBe("free");

  await pm.openLatexViewerPdf("/out/main.pdf");

  expect(pm.side.tabs).toHaveLength(1); // adoption, PAS de doublon pinned
  expect(tabSpace(pm.side.activeTab!)).toBe("pinned");
});

test("openLatexViewerPdf : éditeur tex NON épinglé → viewer libre (comportement historique)", async () => {
  const { fs } = makeFakeFs({ "/main.tex": "\\documentclass{article}", "/out/main.pdf": "%PDF-1.4" });
  const store = new ContentStore(fs);
  const pm = new PanelManager({ content: store });
  await pm.openInMain("/main.tex");
  expect(tabSpace(pm.main.activeTab!)).toBe("free");

  await pm.openLatexViewerPdf("/out/main.pdf");

  expect(pm.side.activeTab?.path).toBe("/out/main.pdf");
  expect(tabSpace(pm.side.activeTab!)).toBe("free");
});

test("propriétaire (R7) : le viewer PDF reste dans la sphère quand un AUTRE format est épinglé", () => {
  const pm = new PanelManager();
  seedPm(pm, [["tex", "/main.tex"], ["md", "/note.md"]], [["pdf", "/out/main.pdf"]]);

  pm.setMainPinned("tex", true);
  // Le PDF n'a pas le contenu de l'éditeur : l'adoption passe par le
  // mécanisme maître (le tex épinglé devient le PROPRIÉTAIRE du viewer).
  expect(pm.adoptLatexViewer("/out/main.pdf")).toBe(true);
  expect(tabSpace(pm.side.tabs[0])).toBe("pinned");
  expect(pm.side.tabs[0].pinnedOwner).toBe("tex");

  // Épingler un .md (autre format, autre sphère) ne libère PAS le viewer PDF.
  pm.setMainPinned("md", true);
  expect(tabSpace(pm.side.tabs[0])).toBe("pinned");

  // Dé-épingler le tex propriétaire, en revanche, le libère.
  pm.setMainPinned("tex", false);
  expect(tabSpace(pm.side.tabs[0])).toBe("free");
  expect(pm.side.tabs[0].pinnedOwner).toBeUndefined();
});

test("adoptLatexViewer : sans tex épinglé, aucune adoption (espace libre inchangé)", () => {
  const pm = new PanelManager();
  seedPm(pm, [["tex", "/main.tex"]], [["pdf", "/out/main.pdf"]]);
  expect(pm.adoptLatexViewer("/out/main.pdf")).toBe(false);
  expect(tabSpace(pm.side.tabs[0])).toBe("free");
});

test("fermeture couplée (R4) : fermer le tex épinglé ferme son viewer PDF (contenus différents)", () => {
  const pm = new PanelManager();
  seedPm(pm, [["tex", "/main.tex"]], [["pdf", "/out/main.pdf"], ["other", "/other.pdf"]]);
  pm.setMainPinned("tex", true);
  pm.adoptLatexViewer("/out/main.pdf");

  pm.closeMainTab("tex");

  expect(pm.side.tabs.map(t => t.id)).toEqual(["other"]);
});

// ── Rectification 3 : l'état « il y a un pinned tab » est TRANSCENDANT ───────

test("index des slots : hasPinned/pinnedSlots reflètent immédiatement toute mutation", () => {
  const p = new PanelState("main");
  expect(p.hasPinned()).toBe(false);

  p.tabs = [mkTab({ id: "a", path: "/a.md" }), mkTab({ id: "t", path: "/main.tex" })];
  expect(p.hasPinned()).toBe(false);

  p.setPinned("a", true);
  expect(p.hasPinned()).toBe(true);
  expect(p.pinnedSlots().get("md")?.id).toBe("a");
  expect(p.pinnedSlots().has("tex")).toBe(false);

  p.setPinned("t", true);
  expect(p.pinnedSlots().size).toBe(2);
  expect(p.pinnedSlots().get("tex")?.id).toBe("t");

  // Commutation : le slot md change d'occupant, l'index suit.
  p.tabs = [...p.tabs, mkTab({ id: "b", path: "/b.md" })];
  p.setPinned("b", true);
  expect(p.pinnedSlots().get("md")?.id).toBe("b");

  // Fermeture du dernier slot md : l'index se vide de ce format.
  p.close("b");
  expect(p.pinnedSlots().has("md")).toBe(false);
  expect(p.hasPinned()).toBe(true); // le slot tex vit toujours

  p.setPinned("t", false);
  expect(p.hasPinned()).toBe(false);
});

test("index des slots : le cache est invalidé par un re-point du slot (changement de format)", async () => {
  const { fs } = makeFakeFs({ "/a.md": "a", "/main.tex": "t" });
  const store = new ContentStore(fs);
  const p = new PanelState("main", {}, store);
  await p.open("/a.md", { space: "pinned" });
  const id = p.activeTabId!;
  expect(p.pinnedSlots().get("md")?.id).toBe(id);

  await p.repoint(id, "/main.tex", { silent: true });

  // Le slot a changé de contenu — donc de format : l'index reflète le NOUVEAU
  // format sans qu'aucune structure parallèle n'ait eu à être maintenue.
  expect(p.pinnedSlots().has("md")).toBe(false);
  expect(p.pinnedSlots().get("tex")?.id).toBe(id);
});
