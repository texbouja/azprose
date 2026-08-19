import { expect, test } from "bun:test";
import { PanelState, normaliserRenderMode } from "../src/lib/panel-store";
import { ContentStore, type ContentFs } from "../src/lib/content-store";

/** Fake fs DI — le ContentStore est PUR : aucun Tauri requis. */
function makeFakeFs(initial: Record<string, string> = {}) {
  const disk = new Map(Object.entries(initial));
  const drafts = new Map<string, string>();
  const calls: string[] = [];
  const fs: ContentFs = {
    async readText(path) {
      calls.push(`read:${path}`);
      const v = disk.get(path);
      if (v === undefined) throw new Error(`ENOENT ${path}`);
      return v;
    },
    async writeText(path, text) {
      calls.push(`write:${path}`);
      disk.set(path, text);
    },
    saveDraft(path, text) {
      calls.push(`saveDraft:${path}`);
      drafts.set(path, text);
    },
    loadDraft(path) {
      return drafts.get(path) ?? null;
    },
    clearDraft(path) {
      drafts.delete(path);
    },
  };
  return { fs, disk, drafts, calls };
}

test("open avec store : contenu chargé dans le store, reflets = store", async () => {
  const { fs, disk } = makeFakeFs({ "/a.md": "hello" });
  const store = new ContentStore(fs);
  const p = new PanelState("main", {}, store);

  await p.open("/a.md");

  // Le store est l'autorité : l'entrée existe avec saved=buffer=disque.
  expect(store.has("/a.md")).toBe(true);
  expect(store.get("/a.md")).toBe("hello");
  expect(store.getSaved("/a.md")).toBe("hello");
  // Les reflets du tab reflètent le store.
  const tab = p.activeTab!;
  expect(tab.source).toBe("hello");
  expect(tab.savedContent).toBe("hello");
  expect(disk.size).toBe(1);
});

test("save avec store : persist écrit le buffer, clearDraft, savedContent suit", async () => {
  const { fs, disk, drafts } = makeFakeFs({ "/a.md": "hello" });
  const store = new ContentStore(fs);
  const p = new PanelState("main", {}, store);
  await p.open("/a.md");

  // Édition (écrivain unique : setBuffer sur le path, reflet setSource).
  store.setBuffer("/a.md", "édité");
  p.setSource("édité");
  expect(p.source).toBe("édité");
  expect(p.savedContent).toBe("hello");

  // Save : le store persist (jamais de writeText direct sur le reflet).
  await p.save();
  expect(disk.get("/a.md")).toBe("édité");
  expect(drafts.size).toBe(0); // clearDraft appelé
  expect(store.getSaved("/a.md")).toBe("édité");
  expect(p.savedContent).toBe("édité");
  expect(p.source).toBe("édité");
});

test("close avec edits → park : draft dans le store ET dans le fake fs, buffer libéré", async () => {
  const { fs, drafts } = makeFakeFs({ "/a.md": "hello" });
  const store = new ContentStore(fs);
  const p = new PanelState("main", {}, store);
  await p.open("/a.md");
  const id = p.activeTabId!;

  store.setBuffer("/a.md", "édition non sauvée");
  p.setSource("édition non sauvée");

  await p.close(id);

  // Politique A : le buffer part en draft (store ET fake fs), jamais perdu.
  expect(drafts.get("/a.md")).toBe("édition non sauvée");
  expect(store.getDraft("/a.md")).toBe("édition non sauvée");
  expect(store.get("/a.md")).toBe("édition non sauvée"); // draft ?? saved
  expect(p.tabs).toHaveLength(0);
});

test("setTabSource reste un REFLET — ne touche JAMAIS le buffer du store", async () => {
  const { fs, disk } = makeFakeFs({ "/a.md": "disque" });
  const store = new ContentStore(fs);
  const p = new PanelState("main", {}, store);
  await p.open("/a.md");

  // L'utilisateur tape dans l'éditeur (buffer du store).
  store.setBuffer("/a.md", "buffer live");

  // Le polling « side sync » écrit le reflet side avec le contenu SAUVÉ —
  // il ne doit pas écraser le buffer de l'éditeur.
  p.setTabSource(p.activeTabId!, "disque");

  expect(store.get("/a.md")).toBe("buffer live");
  expect(p.activeTab!.source).toBe("disque"); // reflet seulement
  expect(disk.get("/a.md")).toBe("disque");
});

test("repoint politique A avec store : park du buffer avant de partir", async () => {
  const { fs, drafts } = makeFakeFs({ "/a.md": "hello", "/b.md": "world" });
  const store = new ContentStore(fs);
  const p = new PanelState("main", {}, store);
  await p.open("/a.md");

  store.setBuffer("/a.md", "edits non sauvés");
  p.setSource("edits non sauvés");

  const res = await p.repoint(p.activeTabId!, "/b.md");
  expect(res.ok).toBe(true);
  expect(res.parked).toBe(true);

  // Le buffer de A est parké (draft) ; le store de B est chargé.
  expect(drafts.get("/a.md")).toBe("edits non sauvés");
  expect(store.getDraft("/a.md")).toBe("edits non sauvés");
  expect(store.get("/a.md")).toBe("edits non sauvés"); // draft ?? saved
  expect(store.get("/b.md")).toBe("world");
  expect(p.activePath).toBe("/b.md");
});

// ── Invariant `recycleRenderMode` : tout recyclage d'un tab (changement de
// fichier) réarme le viewer sur le mode GÉNÉRAL « preview » ; les modes
// ÉDITEUR (raw/prose — tabs main, repoint aussi utilisé par preview-follow)
// sont préservés ; la dédup (même fichier) n'est PAS un recyclage. ──────────

test("repoint : modes viewer (colle/presentation) réarmés sur preview", async () => {
  const { fs } = makeFakeFs({ "/a.md": "a", "/b.md": "b" });
  const store = new ContentStore(fs);
  const p = new PanelState("side", {}, store);
  await p.open("/a.md");

  p.setRenderMode(p.activeTabId!, "colle");
  await p.repoint(p.activeTabId!, "/b.md");
  expect(p.activeTab!.renderMode).toBe("preview");

  p.setRenderMode(p.activeTabId!, "presentation");
  await p.repoint(p.activeTabId!, "/a.md");
  expect(p.activeTab!.renderMode).toBe("preview");
});

test("repoint sur tab MAIN : modes éditeur raw/prose préservés", async () => {
  const { fs } = makeFakeFs({ "/a.md": "a", "/b.md": "b" });
  const store = new ContentStore(fs);
  const p = new PanelState("main", {}, store);
  await p.open("/a.md");

  p.setRenderMode(p.activeTabId!, "raw");
  await p.repoint(p.activeTabId!, "/b.md");
  expect(p.activeTab!.renderMode).toBe("raw");

  p.setRenderMode(p.activeTabId!, "preview");
  await p.repoint(p.activeTabId!, "/a.md");
  expect(p.activeTab!.renderMode).toBe("preview");
});

test("open ré-affectation d'un onglet éphémère : renderMode viewer réarmé sur preview", async () => {
  const { fs } = makeFakeFs({ "/a.md": "a", "/b.md": "b" });
  const store = new ContentStore(fs);
  const p = new PanelState("side", {}, store);
  await p.open("/a.md", { preview: true });
  p.setRenderMode(p.activeTabId!, "colle");

  await p.open("/b.md", { preview: true });

  expect(p.activePath).toBe("/b.md");
  expect(p.activeTab!.renderMode).toBe("preview");
});

test("open dédup (même fichier) : PAS de recyclage — le mode alternatif survit", async () => {
  const { fs } = makeFakeFs({ "/a.md": "a" });
  const store = new ContentStore(fs);
  const p = new PanelState("side", {}, store);
  await p.open("/a.md");
  p.setRenderMode(p.activeTabId!, "colle");

  await p.open("/a.md", { preview: true, fallbackToActive: true });

  expect(p.activeTab!.renderMode).toBe("colle");
});

test("une session d'avant le retrait du WYSIWYM rouvre ses onglets en mode brut", () => {
  // `"prose"` n'existe plus : sans normalisation, l'application restaurerait un
  // onglet dans un mode qu'aucune branche de rendu ne connaît.
  expect(normaliserRenderMode("prose")).toBe("raw");
  expect(normaliserRenderMode("preview")).toBe("preview");
  expect(normaliserRenderMode(undefined)).toBeUndefined();
});
