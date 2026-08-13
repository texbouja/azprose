import { describe, expect, test } from "bun:test";
import { buildDeclaredToc, type DeclaredToc } from "@/lib/toc-declared";
import type { TocFileNode, TocNode } from "@/lib/toc-forest";

/**
 * Tests du noyau TOC déclaratif (chantier fenêtre NAV, phase 3 — R8) : AUCUNE
 * analyse de liens, la structure vient du front-matter (`sommaire:`/`toc:`
 * descendant, `parent:` montant), résolution déterministe, dégradation
 * toujours propre (jamais d'exception).
 */

const ROOT = "/vault";

function fakeFs(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    const content = files[path];
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  };
}

function fakeIndex(entries: Record<string, string>) {
  return async (): Promise<Map<string, string>> => new Map(Object.entries(entries));
}

function build(
  documentPath: string,
  files: Record<string, string>,
  index: Record<string, string> = {},
  opts: Partial<Parameters<typeof buildDeclaredToc>[0]> = {},
): Promise<DeclaredToc> {
  return buildDeclaredToc({
    documentPath,
    rootPath: ROOT,
    readText: fakeFs(files),
    getIndex: fakeIndex(index),
    ...opts,
  });
}

function fileChildren(node: TocFileNode): TocFileNode[] {
  return node.children.filter((c): c is TocFileNode => c.kind === "file");
}

function collectPaths(node: TocNode): string[] {
  const out: string[] = [];
  if (node.kind === "file") out.push(node.path);
  for (const c of node.children) out.push(...collectPaths(c));
  return out;
}

describe("buildDeclaredToc — sommaire: (descendant)", () => {
  test("liste plate → arbre plat ordonné", async () => {
    const files = {
      "/vault/index.md": "---\nsommaire:\n  - un\n  - deux\n---\n# Racine\n",
      "/vault/un.md": "# Un\n",
      "/vault/deux.md": "# Deux\n",
    };
    const idx = { un: "/vault/un.md", deux: "/vault/deux.md" };
    const toc = await build("/vault/index.md", files, idx);
    expect(toc.origin).toBe("declared");
    expect(toc.rootPath).toBe("/vault/index.md");
    const kids = fileChildren(toc.root!);
    expect(kids.map((k) => k.path)).toEqual(["/vault/un.md", "/vault/deux.md"]);
  });

  test("sommaire imbriqué (un fichier listé déclare son propre sommaire) → sous-arbre", async () => {
    const files = {
      "/vault/index.md": "---\nsommaire:\n  - chapitre-1\n---\n# Racine\n",
      "/vault/chapitre-1.md": "---\nsommaire:\n  - section-1\n---\n# Chapitre 1\n",
      "/vault/section-1.md": "# Section 1\n",
    };
    const idx = { "chapitre-1": "/vault/chapitre-1.md", "section-1": "/vault/section-1.md" };
    const toc = await build("/vault/index.md", files, idx);
    const chap1 = fileChildren(toc.root!)[0];
    expect(chap1.path).toBe("/vault/chapitre-1.md");
    const sub = fileChildren(chap1);
    expect(sub.map((s) => s.path)).toEqual(["/vault/section-1.md"]);
  });

  test("forme objet { fichier, titre } → libellé EXPLICITE", async () => {
    const files = {
      "/vault/index.md": '---\nsommaire:\n  - { fichier: exos, titre: "Exercices corrigés" }\n---\n# Racine\n',
      "/vault/exos.md": "# Ce titre est ignoré au profit de l'explicite\n",
    };
    const idx = { exos: "/vault/exos.md" };
    const toc = await build("/vault/index.md", files, idx);
    const child = fileChildren(toc.root!)[0];
    expect(child.label).toBe("Exercices corrigés");
  });

  test("chaîne (string) sans titre → libellé = premier H1 du fichier cible", async () => {
    const files = {
      "/vault/index.md": "---\nsommaire:\n  - notes\n---\n# Racine\n",
      "/vault/notes.md": "Texte avant.\n\n# Le vrai titre\n\nSuite.\n",
    };
    const idx = { notes: "/vault/notes.md" };
    const toc = await build("/vault/index.md", files, idx);
    expect(fileChildren(toc.root!)[0].label).toBe("Le vrai titre");
  });

  test("aucun H1 dans la cible → repli sur le basename", async () => {
    const files = {
      "/vault/index.md": "---\nsommaire:\n  - vide\n---\n# Racine\n",
      "/vault/vide.md": "## Seulement un H2\n",
    };
    const idx = { vide: "/vault/vide.md" };
    const toc = await build("/vault/index.md", files, idx);
    expect(fileChildren(toc.root!)[0].label).toBe("vide");
  });

  test("entrée illisible → ignorée, le reste de l'arbre est construit", async () => {
    const files = {
      "/vault/index.md": "---\nsommaire:\n  - absent\n  - un\n---\n# Racine\n",
      "/vault/un.md": "# Un\n",
    };
    const idx = { un: "/vault/un.md" }; // "absent" n'est nulle part
    const toc = await build("/vault/index.md", files, idx);
    const kids = fileChildren(toc.root!);
    expect(kids).toHaveLength(1);
    expect(kids[0].path).toBe("/vault/un.md");
  });

  test("synonyme toc: accepté quand sommaire: est absent", async () => {
    const files = {
      "/vault/index.md": "---\ntoc:\n  - un\n---\n# Racine\n",
      "/vault/un.md": "# Un\n",
    };
    const idx = { un: "/vault/un.md" };
    const toc = await build("/vault/index.md", files, idx);
    expect(toc.origin).toBe("declared");
    expect(fileChildren(toc.root!).map((k) => k.path)).toEqual(["/vault/un.md"]);
  });

  test("sommaire: ET toc: présents → sommaire: gagne", async () => {
    const files = {
      "/vault/index.md": "---\nsommaire:\n  - un\ntoc:\n  - deux\n---\n# Racine\n",
      "/vault/un.md": "# Un\n",
      "/vault/deux.md": "# Deux\n",
    };
    const idx = { un: "/vault/un.md", deux: "/vault/deux.md" };
    const toc = await build("/vault/index.md", files, idx);
    expect(fileChildren(toc.root!).map((k) => k.path)).toEqual(["/vault/un.md"]);
  });

  test("cycle dans le sommaire (a inclut b, b inclut a) → repli, pas de boucle", async () => {
    const files = {
      "/vault/a.md": "---\nsommaire:\n  - b\n---\n# A\n",
      "/vault/b.md": "---\nsommaire:\n  - a\n---\n# B\n",
    };
    const idx = { a: "/vault/a.md", b: "/vault/b.md" };
    const toc = await build("/vault/a.md", files, idx);
    const b = fileChildren(toc.root!)[0];
    expect(b.path).toBe("/vault/b.md");
    // B ne re-liste pas A (cycle) → aucun enfant sous B.
    expect(fileChildren(b)).toHaveLength(0);
  });
});

describe("buildDeclaredToc — parent: (montant)", () => {
  test("chaîne sur 3 niveaux → la racine est le DERNIER fichier atteint", async () => {
    const files = {
      "/vault/c.md": "---\nsommaire:\n  - d\n---\n# C (racine)\n",
      "/vault/b.md": "---\nparent: c\n---\n# B\n",
      "/vault/a.md": "---\nparent: b\n---\n# A (document monté)\n",
      "/vault/d.md": "# D\n",
    };
    const idx = { a: "/vault/a.md", b: "/vault/b.md", c: "/vault/c.md", d: "/vault/d.md" };
    const toc = await build("/vault/a.md", files, idx);
    expect(toc.origin).toBe("declared");
    expect(toc.rootPath).toBe("/vault/c.md");
    // Le document AFFICHÉ reste celui monté, même si la racine de l'arbre change.
    expect(toc.displayPath).toBe("/vault/a.md");
    expect(fileChildren(toc.root!).map((k) => k.path)).toEqual(["/vault/d.md"]);
  });

  test("parent: non résolvable → on s'arrête là, le dernier fichier résolu fait racine", async () => {
    const files = {
      "/vault/a.md": "---\nparent: introuvable\nsommaire:\n  - b\n---\n# A\n",
      "/vault/b.md": "# B\n",
    };
    const idx = { b: "/vault/b.md" }; // "introuvable" n'existe nulle part
    const toc = await build("/vault/a.md", files, idx);
    expect(toc.origin).toBe("declared");
    expect(toc.rootPath).toBe("/vault/a.md");
    expect(fileChildren(toc.root!).map((k) => k.path)).toEqual(["/vault/b.md"]);
  });

  test("cycle parent: (a → b → a) → arrêt, pas de boucle infinie", async () => {
    const files = {
      "/vault/a.md": "---\nparent: b\nsommaire:\n  - c\n---\n# A\n",
      "/vault/b.md": "---\nparent: a\n---\n# B\n",
      "/vault/c.md": "# C\n",
    };
    const idx = { a: "/vault/a.md", b: "/vault/b.md", c: "/vault/c.md" };
    // Ne doit ni boucler ni lever — la remontée s'arrête au cycle détecté.
    const toc = await build("/vault/a.md", files, idx);
    expect(toc.root).not.toBeNull();
  });

  test("profondeur de remontée > 8 → bornée, dégrade proprement", async () => {
    // Chaîne a0 → a1 → … → a10 (11 fichiers), aucun sommaire déclaré nulle
    // part : la remontée s'arrête après 8 sauts (jamais d'exception), et le
    // fichier atteint à cette profondeur n'a pas de sommaire → repli sur le
    // document MONTÉ (a0).
    const files: Record<string, string> = {};
    const idx: Record<string, string> = {};
    for (let i = 0; i <= 10; i++) {
      const parent = i < 10 ? `\nparent: a${i + 1}` : "";
      files[`/vault/a${i}.md`] = `---${parent}\n---\n# A${i}\n`;
      idx[`a${i}`] = `/vault/a${i}.md`;
    }
    const toc = await build("/vault/a0.md", files, idx);
    expect(toc.origin).toBe("single");
    expect(toc.displayPath).toBe("/vault/a0.md");
    // Repli = TOC du document monté, jamais un autre fichier de la chaîne.
    expect(toc.root?.path).toBe("/vault/a0.md");
  });

  test("aucun parent: déclaré → origin single, TOC du document seul (cas nominal)", async () => {
    const files = {
      "/vault/isole.md": "# Isolé\n\n## Une section\n",
    };
    const toc = await build("/vault/isole.md", files);
    expect(toc.origin).toBe("single");
    expect(toc.displayPath).toBe("/vault/isole.md");
    expect(toc.rootPath).toBe("/vault/isole.md");
    expect(collectPaths(toc.root!)).toEqual(["/vault/isole.md"]);
    const h1 = toc.root!.children[0];
    expect(h1.kind === "heading" && h1.entry.text).toBe("Isolé");
    expect(h1.kind === "heading" && h1.children[0]?.kind === "heading" && h1.children[0].entry.text).toBe("Une section");
  });

  test("racine remontée sans sommaire: → repli sur le document MONTÉ (pas la racine)", async () => {
    const files = {
      "/vault/parent-sans-sommaire.md": "# Parent (aucun sommaire)\n",
      "/vault/enfant.md": "---\nparent: parent-sans-sommaire\n---\n# Enfant monté\n",
    };
    const idx = { "parent-sans-sommaire": "/vault/parent-sans-sommaire.md" };
    const toc = await build("/vault/enfant.md", files, idx);
    expect(toc.origin).toBe("single");
    expect(toc.displayPath).toBe("/vault/enfant.md");
    expect(toc.root?.path).toBe("/vault/enfant.md");
  });
});

describe("buildDeclaredToc — robustesse", () => {
  test("document monté illisible → root null", async () => {
    const toc = await build("/vault/absent.md", {});
    expect(toc.root).toBeNull();
    expect(toc.displayPath).toBe("/vault/absent.md");
  });

  test("documentSource (buffer live) évite la lecture disque du document monté", async () => {
    const toc = await build("/vault/x.md", {}, {}, { documentSource: "# Live\n" });
    expect(toc.origin).toBe("single");
    expect(toc.root?.children[0]).toMatchObject({ kind: "heading", entry: { text: "Live" } });
  });

  test("structuralHash stable pour un même arbre, différent si la forme change", async () => {
    const files = {
      "/vault/index.md": "---\nsommaire:\n  - un\n---\n# Racine\n",
      "/vault/un.md": "# Un\n",
    };
    const idx = { un: "/vault/un.md" };
    const first = await build("/vault/index.md", files, idx);
    const second = await build("/vault/index.md", files, idx);
    expect(first.structuralHash).toBe(second.structuralHash);
    expect(first.structuralHash).not.toBe("");

    const filesChanged = { ...files, "/vault/index.md": "---\nsommaire:\n  - un\n  - deux\n---\n# Racine\n", "/vault/deux.md": "# Deux\n" };
    const idxChanged = { ...idx, deux: "/vault/deux.md" };
    const third = await build("/vault/index.md", filesChanged, idxChanged);
    expect(third.structuralHash).not.toBe(first.structuralHash);
  });
});
