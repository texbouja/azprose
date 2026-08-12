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

test("openInActiveTab : un tab épinglé n'est JAMAIS re-pointé par une ouverture libre", async () => {
  const { fs } = makeFakeFs({ "/a.md": "hello", "/b.md": "world" });
  const store = new ContentStore(fs);
  const p = new PanelState("main", {}, store);

  await p.open("/a.md", { space: "pinned" });
  const pinnedId = p.activeTabId!;

  // Cible libre : le tab actif (épinglé) n'est pas ré-affecté — nouveau tab.
  await p.openInActiveTab("/b.md");
  expect(p.activeTabId).not.toBe(pinnedId);
  expect(p.activePath).toBe("/b.md");
  expect(tabSpace(p.activeTab!)).toBe("free");
  // Le pinned reste intact sur /a.md.
  expect(p.tabs.find(t => t.id === pinnedId)?.path).toBe("/a.md");
  expect(tabSpace(p.tabs.find(t => t.id === pinnedId)!)).toBe("pinned");
});

test("openInActiveTab : re-point du tab actif dans le MÊME espace (comportement libre historique)", async () => {
  const { fs } = makeFakeFs({ "/a.md": "hello", "/b.md": "world" });
  const store = new ContentStore(fs);
  const p = new PanelState("main", {}, store);

  await p.open("/a.md"); // libre
  const id = p.activeTabId!;
  await p.openInActiveTab("/b.md");
  expect(p.activeTabId).toBe(id); // même tab re-pointé
  expect(p.activePath).toBe("/b.md");
});

// ── Phase A : pickOpenTarget filtré par espace ─────────────────────────────

test("pickOpenTarget : un tab ÉPINGLÉ n'est jamais la cible d'une ouverture libre", () => {
  const pinned = mkTab({ id: "pin", path: "/a.md", preview: true, space: "pinned" });
  const free = mkTab({ id: "free", path: "/b.md", preview: true });
  const tabs = [pinned, free];
  // Réaffectation preview libre : le tab libre preview est choisi, jamais le pinned.
  expect(pickOpenTarget(tabs, "pin", true, undefined, "free")).toEqual({ id: "free", isFallback: false });
  // fallbackToActive : le tab actif épinglé n'est pas ré-affecté par une cible
  // libre — le relais retombe sur le tab preview du MÊME espace (jamais le pinned).
  expect(pickOpenTarget(tabs, "pin", true, true, "free")).toEqual({ id: "free", isFallback: false });
  // Sans preview libre disponible, plus de cible → nouveau tab.
  expect(pickOpenTarget([pinned], "pin", true, true, "free")).toEqual({ id: null, isFallback: false });
  // Une cible épinglée, elle, peut ré-affecter le tab épinglé.
  expect(pickOpenTarget(tabs, "pin", true, true, "pinned")).toEqual({ id: "pin", isFallback: true });
});
