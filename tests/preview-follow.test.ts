import { expect, test } from "bun:test";

// Bun n'embarque pas de localStorage : polyfill minimal avant tout usage.
// (session.ts n'y touche qu'à l'appel — importé sans effet de bord.)
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
import { followPreviewNavigation } from "../src/lib/preview-follow";
import { saveDraft, loadDraft, clearDraft, setSessionScope } from "../src/lib/session";

// Follow « l'éditeur suit le preview » (Phase 1). Les chemins appuyés sur le FS
// (repoint lit le fichier cible — readText Tauri échoue sous bun) ne sont pas
// testables ici : ces tests couvrent la logique de décision qui s'exécute AVANT
// toute lecture FS, plus les gardes de repoint et l'étape « park brouillon »
// (politique A) qui précède elle-même la lecture.

setSessionScope("/test-vault");

function seed(
  pm: PanelManager,
  main: Array<{ id: string; path: string; source?: string; savedContent?: string; preview?: boolean; kind?: string }>,
) {
  pm.main.tabs = main.map(m => ({
    id: m.id,
    title: m.path.split("/").pop()!,
    path: m.path,
    source: m.source ?? "",
    savedContent: m.savedContent ?? "",
    preview: m.preview,
    kind: m.kind as never,
  }));
  pm.main.activeTabId = main[0]?.id ?? null;
}

test("sans lien → followed:false (repli legacy, rien ne bouge)", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }]);
  const r = await followPreviewNavigation(pm, "/b.md");
  expect(r).toEqual({ followed: false, parked: false });
});

test("lien périmé (tab fermé) → délie et repli legacy", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }]);
  pm.previewLinkedTabId = "ghost";
  const r = await followPreviewNavigation(pm, "/b.md");
  expect(r.followed).toBe(false);
  expect(pm.previewLinkedTabId).toBeNull();
});

test("lien sur un tab d'outil → délie et repli legacy", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md", kind: "spreadsheet" }]);
  pm.previewLinkedTabId = "t1";
  const r = await followPreviewNavigation(pm, "/b.md");
  expect(r.followed).toBe(false);
  expect(pm.previewLinkedTabId).toBeNull();
});

test("le tab lié affiche déjà la cible → followed:true, sélection (no-op)", async () => {
  const pm = new PanelManager();
  seed(pm, [
    { id: "t1", path: "/a.md" },
    { id: "t2", path: "/b.md" },
  ]);
  pm.main.activeTabId = "t2";
  pm.previewLinkedTabId = "t1";
  const r = await followPreviewNavigation(pm, "/a.md");
  expect(r).toEqual({ followed: true, parked: false });
  expect(pm.main.activeTabId).toBe("t1");
});

test("adopt-if-open : cible déjà ouverte ailleurs → le lien s'y déplace, pas de doublon", async () => {
  const pm = new PanelManager();
  seed(pm, [
    { id: "t1", path: "/a.md" },
    { id: "t2", path: "/b.md" },
  ]);
  pm.main.activeTabId = "t1";
  pm.previewLinkedTabId = "t1";
  const r = await followPreviewNavigation(pm, "/b.md");
  expect(r.followed).toBe(true);
  expect(pm.previewLinkedTabId).toBe("t2");
  expect(pm.main.activeTabId).toBe("t2");
  expect(pm.main.tabs).toHaveLength(2); // jamais un doublon
});

test("l'adoption retire le flag preview → le tab sort du pool jumpToLine", async () => {
  const pm = new PanelManager();
  seed(pm, [
    { id: "t1", path: "/a.md" },
    { id: "t2", path: "/b.md", preview: true },
  ]);
  pm.previewLinkedTabId = "t1";
  const r = await followPreviewNavigation(pm, "/b.md");
  expect(r.followed).toBe(true);
  expect(pm.main.tabs.find(t => t.id === "t2")?.preview).toBe(false);
});

// ── repoint : gardes (aucun FS nécessaire) ────────────────────────────────

test("repoint vers un chemin non ouvrable → ok:false, tab inchangé", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md" }]);
  const r = await pm.main.repoint("t1", "/a.unknown");
  expect(r.ok).toBe(false);
  expect(pm.main.tabs[0].path).toBe("/a.md");
});

test("repoint vers le même chemin → ok:true, no-op", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md", source: "x", savedContent: "x" }]);
  const r = await pm.main.repoint("t1", "/a.md");
  expect(r).toEqual({ ok: true, parked: false });
});

test("repoint parke les edits non enregistrés AVANT le mouvement (politique A), et laisse le tab intact si la lecture échoue", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md", source: "EDITS NON SAUVÉS", savedContent: "sauvé" }]);
  clearDraft("/a.md");
  // readText échoue sous bun → le repoint échoue, mais le park a déjà eu lieu.
  const r = await pm.main.repoint("t1", "/b.md");
  expect(r.ok).toBe(false);
  expect(r.parked).toBe(true);
  expect(loadDraft("/a.md")).toBe("EDITS NON SAUVÉS"); // parké malgré l'échec
  expect(pm.main.tabs[0].path).toBe("/a.md");           // jamais un tab à moitié re-pointé
  expect(pm.main.tabs[0].source).toBe("EDITS NON SAUVÉS");
  clearDraft("/a.md");
});

test("repoint sans modifications → rien n'est parké", async () => {
  const pm = new PanelManager();
  seed(pm, [{ id: "t1", path: "/a.md", source: "propre", savedContent: "propre" }]);
  clearDraft("/a.md");
  const r = await pm.main.repoint("t1", "/b.md");
  expect(r.parked).toBe(false);
  expect(loadDraft("/a.md")).toBeNull();
});

test("le draft parké du fichier cible est lu au retour (saveDraft/loadDraft round-trip)", () => {
  saveDraft("/b.md", "brouillon du retour");
  expect(loadDraft("/b.md")).toBe("brouillon du retour");
  clearDraft("/b.md");
  expect(loadDraft("/b.md")).toBeNull();
});
