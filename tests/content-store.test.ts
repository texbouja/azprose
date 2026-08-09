import { expect, test } from "bun:test";
import { ContentStore, type ContentFs } from "../src/lib/content-store";

/** Fake fs : Map chemin → contenu (disque), plus les drafts (session). */
function makeFs(initial: Record<string, string> = {}) {
  const disk = new Map<string, string>(Object.entries(initial));
  const drafts = new Map<string, string>();
  const calls: string[] = [];
  const fs: ContentFs = {
    readText: async (p) => {
      calls.push(`read:${p}`);
      const v = disk.get(p);
      if (v === undefined) throw new Error(`read ${p}: not found`);
      return v;
    },
    writeText: async (p, t) => {
      calls.push(`write:${p}`);
      disk.set(p, t);
    },
    saveDraft: (p, t) => drafts.set(p, t),
    loadDraft: (p) => drafts.get(p) ?? null,
    clearDraft: (p) => drafts.delete(p),
  };
  return { fs, disk, drafts, calls };
}

test("get() empty for unknown path; versionOf 0", () => {
  const { fs } = makeFs();
  const store = new ContentStore(fs);
  expect(store.get("/a.md")).toBe("");
  expect(store.getSaved("/a.md")).toBe("");
  expect(store.getDraft("/a.md")).toBeNull();
  expect(store.versionOf("/a.md")).toBe(0);
  expect(store.has("/a.md")).toBe(false);
});

test("load reads disk; saved = disk, get = disk; bump fires once", async () => {
  const { fs } = makeFs({ "/a.md": "hello" });
  const versions: string[] = [];
  const store = new ContentStore(fs, { onVersion: (p, v) => versions.push(`${p}:${v}`) });
  const result = await store.load("/a.md");
  expect(result).toBe("hello");
  expect(store.get("/a.md")).toBe("hello");
  expect(store.getSaved("/a.md")).toBe("hello");
  expect(store.has("/a.md")).toBe(true);
  expect(store.versionOf("/a.md")).toBe(1);
  expect(versions).toEqual(["/a.md:1"]);
});

test("load preserves an existing buffer (editor open)", async () => {
  const { fs, disk } = makeFs({ "/a.md": "disk" });
  const store = new ContentStore(fs);
  store.setBuffer("/a.md", "editing");
  disk.set("/a.md", "disk-v2"); // changement externe
  const result = await store.load("/a.md");
  expect(result).toBe("editing"); // le buffer survit
  expect(store.getSaved("/a.md")).toBe("disk-v2");
});

test("load with forceBuffer replaces the buffer with disk", async () => {
  const { fs, disk } = makeFs({ "/a.md": "disk" });
  const store = new ContentStore(fs);
  store.setBuffer("/a.md", "editing");
  disk.set("/a.md", "disk-v2");
  const result = await store.load("/a.md", { forceBuffer: true });
  expect(result).toBe("disk-v2");
  expect(store.get("/a.md")).toBe("disk-v2");
});

test("load without buffer honors preferDraft (draft wins over disk)", async () => {
  const { fs, drafts } = makeFs({ "/a.md": "disk" });
  drafts.set("/a.md", "draft-v1");
  const store = new ContentStore(fs);
  const result = await store.load("/a.md", { preferDraft: true });
  expect(result).toBe("draft-v1");
  expect(store.getSaved("/a.md")).toBe("disk");
});

test("load ignores the draft when preferDraft is false", async () => {
  const { fs, drafts } = makeFs({ "/a.md": "disk" });
  drafts.set("/a.md", "draft-v1");
  const store = new ContentStore(fs);
  const result = await store.load("/a.md");
  expect(result).toBe("disk");
});

test("load with preferDraft ignores a draft identical to disk", async () => {
  const { fs, drafts } = makeFs({ "/a.md": "same" });
  drafts.set("/a.md", "same");
  const store = new ContentStore(fs);
  const result = await store.load("/a.md", { preferDraft: true });
  expect(result).toBe("same");
  expect(store.getDraft("/a.md")).toBeNull(); // pas de draft overlayé
});

test("load with preferDraft ignores an EMPTY draft over a non-empty disk", async () => {
  // Artefact du bug « fichier affiché vide » : un draft "" parké par le sync
  // value de l'éditeur pendant la fenêtre source:"" d'open(). Ne doit JAMAIS
  // gagner sur un disque non vide (sinon fichier vidé + dirty à chaque retour).
  const { fs, drafts } = makeFs({ "/a.md": "11632 bytes de contenu" });
  drafts.set("/a.md", "");
  const store = new ContentStore(fs);
  const result = await store.load("/a.md", { preferDraft: true });
  expect(result).toBe("11632 bytes de contenu");
  expect(store.getSaved("/a.md")).toBe("11632 bytes de contenu");
  expect(store.has("/a.md")).toBe(true);
});

test("load with preferDraft empty draft + empty disk: stays empty", async () => {
  // Fichier neuf : draft vide et disque vide — aucun effet observable.
  const { fs, drafts } = makeFs({ "/new.md": "" });
  drafts.set("/new.md", "");
  const store = new ContentStore(fs);
  const result = await store.load("/new.md", { preferDraft: true });
  expect(result).toBe("");
  expect(store.getSaved("/new.md")).toBe("");
});

test("setBuffer is idempotent (same text, no bump)", async () => {
  const { fs } = makeFs();
  const versions: number[] = [];
  const store = new ContentStore(fs, { onVersion: (p, v) => versions.push(v) });
  store.setBuffer("/a.md", "one");
  store.setBuffer("/a.md", "one"); // identique → skip
  expect(versions.length).toBe(1);
  store.setBuffer("/a.md", "two");
  expect(versions.length).toBe(2);
});

test("persist writes buffer to disk, clears draft, saved = written", async () => {
  const { fs, disk, drafts, calls } = makeFs({ "/a.md": "disk" });
  const store = new ContentStore(fs);
  await store.load("/a.md");
  drafts.set("/a.md", "stale");
  store.setBuffer("/a.md", "new");
  await store.persist("/a.md");
  expect(disk.get("/a.md")).toBe("new");
  expect(drafts.has("/a.md")).toBe(false);
  expect(store.getSaved("/a.md")).toBe("new");
  expect(calls.some((c) => c === "write:/a.md")).toBe(true);
});

test("persist falls back to draft then saved when no buffer", async () => {
  const { fs, disk } = makeFs({ "/a.md": "disk" });
  const store = new ContentStore(fs);
  await store.load("/a.md");
  // pas de buffer — persist écrit saved (inchangé) et ne casse rien
  await store.persist("/a.md");
  expect(disk.get("/a.md")).toBe("disk");
  // avec un draft parké : le draft est persisté
  store.park("/a.md");
  store.setBuffer("/a.md", "draft-content");
  store.park("/a.md"); // buffer → draft
  expect(store.getDraft("/a.md")).toBe("draft-content");
  await store.persist("/a.md");
  expect(disk.get("/a.md")).toBe("draft-content");
  expect(store.getSaved("/a.md")).toBe("draft-content");
});

test("persist without entry is a no-op", async () => {
  const { fs, calls } = makeFs();
  const store = new ContentStore(fs);
  await store.persist("/never-opened.md");
  expect(calls.length).toBe(0);
});

test("park saves the draft and frees the buffer when dirty", async () => {
  const { fs, drafts } = makeFs({ "/a.md": "disk" });
  const store = new ContentStore(fs);
  await store.load("/a.md");
  store.setBuffer("/a.md", "editing");
  store.park("/a.md");
  expect(drafts.get("/a.md")).toBe("editing");
  expect(store.getDraft("/a.md")).toBe("editing");
  expect(store.get("/a.md")).toBe("editing"); // draft = contenu courant
  expect(store.has("/a.md")).toBe(true);
});

test("park frees the buffer without saving when clean", async () => {
  const { fs, drafts } = makeFs({ "/a.md": "disk" });
  const store = new ContentStore(fs);
  await store.load("/a.md");
  store.park("/a.md"); // buffer === saved (le load a posé le buffer = disque)
  expect(drafts.has("/a.md")).toBe(false);
  expect(store.get("/a.md")).toBe("disk");
});

test("park without buffer is a no-op (side preview / kind data)", async () => {
  const { fs, drafts } = makeFs({ "/a.md": "disk" });
  const store = new ContentStore(fs);
  await store.load("/a.md");
  // le load a posé un buffer — on le libère proprement puis on re-park : no-op
  store.park("/a.md");
  const before = store.versionOf("/a.md");
  store.park("/a.md");
  expect(store.versionOf("/a.md")).toBe(before);
  expect(drafts.has("/a.md")).toBe(false);
});

test("norm: ./.. segments are filtered, keys align between methods", async () => {
  const { fs } = makeFs();
  const store = new ContentStore(fs);
  store.setBuffer("/vault/./a.md", "x");
  expect(store.get("/vault/a.md")).toBe("x");
  expect(store.versionOf("/vault/./a.md")).toBe(store.versionOf("/vault/a.md"));
});

test("bumps are monotonic and per-path", async () => {
  const { fs } = makeFs();
  const versions = new Map<string, number>();
  const store = new ContentStore(fs, { onVersion: (p, v) => versions.set(p, v) });
  store.setBuffer("/a.md", "1");
  store.setBuffer("/b.md", "1");
  store.setBuffer("/a.md", "2");
  expect(versions.get("/a.md")).toBe(3);
  expect(versions.get("/b.md")).toBe(2);
  expect(store.versionOf("/a.md") > store.versionOf("/b.md")).toBe(true);
});
