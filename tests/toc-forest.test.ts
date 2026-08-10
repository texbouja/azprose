import { describe, expect, test } from "bun:test";
import { buildTocForest, type TocFileNode, type TocForest, type TocNode } from "@/lib/toc-forest";
import { makeTocMemo } from "@/lib/toc-cache";

/**
 * Tests du harnais de sécurité TOC : arbre des titres du fichier « home »
 * (index.md lié via findLinkedIndexMd, sinon fichier de référence), étendu
 * des branches transcluses des wikilinks block-level CONFORMES (même
 * convention que l'export PDF — findBlockWikilinks).
 */

function fakeFs(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    const content = files[path];
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  };
}

/** Index vault par basename (sans extension) — repli de getFileIndex. */
function fakeIndex(entries: Record<string, string>) {
  return async (): Promise<Map<string, string>> => new Map(Object.entries(entries));
}

const ROOT = "/vault";

const INDEX_MD = `# Manuel

Bienvenue.

[[chapitre-1]]

[[chapitre-2]]
`;

const CHAP1 = `# Chapitre 1

## Section 1.1

Texte avec [[lien-inline]] qui ne doit PAS être une branche.

## Section 1.2

[[fiche-1]]
`;

const CHAP2 = `# Chapitre 2

## Section 2.1
`;

const FICHE1 = `# Fiche 1

### Détail A
`;

const FILES: Record<string, string> = {
  "/vault/index.md": INDEX_MD,
  "/vault/chapitre-1.md": CHAP1,
  "/vault/chapitre-2.md": CHAP2,
  "/vault/fiche-1.md": FICHE1,
};

const INDEX = fakeIndex({
  "chapitre-1": "/vault/chapitre-1.md",
  "chapitre-2": "/vault/chapitre-2.md",
  "fiche-1": "/vault/fiche-1.md",
});

/** Raccourci : construit la forêt depuis le fichier de référence donné. */
function build(
  referencePath: string,
  opts: Partial<Parameters<typeof buildTocForest>[0]> = {},
): Promise<TocForest> {
  return buildTocForest({
    rootPath: ROOT,
    referencePath,
    readText: fakeFs(FILES),
    getIndex: INDEX,
    ...opts,
  });
}

/** Raccourci : enfants headings du nœud fichier (les branches sont filtrables
 *  par `kind === "file"`). */
function headingsOf(node: TocFileNode): string[] {
  return node.children.filter((c) => c.kind === "heading").map((c) => (c.kind === "heading" ? c.entry.text : ""));
}

function branchesOf(node: TocFileNode): TocFileNode[] {
  return node.children.filter((c) => c.kind === "file") as TocFileNode[];
}

/** Tous les titres de l'arbre, en profondeur (ordre du document). */
function collectHeadings(node: TocNode): string[] {
  const out: string[] = [];
  for (const c of node.children) {
    if (c.kind === "heading") {
      out.push(c.entry.text, ...collectHeadings(c));
    } else {
      out.push(...collectHeadings(c));
    }
  }
  return out;
}

/** Toutes les branches transcluses de l'arbre, en profondeur (ordre). */
function collectBranches(node: TocNode): TocFileNode[] {
  const out: TocFileNode[] = [];
  for (const c of node.children) {
    if (c.kind === "file") {
      out.push(c, ...collectBranches(c));
    } else {
      out.push(...collectBranches(c));
    }
  }
  return out;
}

describe("buildTocForest — choix du fichier affiché", () => {
  test("aucun index lié → TOC du fichier de référence (source live)", async () => {
    const fs = fakeFs({
      "/vault/notes/note.md": "# Note\n\n## Partie A\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs, referenceSource: "# Note\n\n## Partie A\n" });
    expect(forest.displayPath).toBe("/vault/notes/note.md");
    expect(forest.root?.path).toBe("/vault/notes/note.md");
    expect(collectHeadings(forest.root!)).toEqual(["Note", "Partie A"]);
  });

  test("index.md racine présent → repli (TOC de l'index)", async () => {
    const forest = await build("/vault/notes/note.md");
    expect(forest.displayPath).toBe("/vault/index.md");
    expect(forest.root?.path).toBe("/vault/index.md");
    expect(headingsOf(forest.root!)).toEqual(["Manuel"]);
  });

  test("référence liant index.md conformément → TOC de l'index lié", async () => {
    const fs = fakeFs({
      "/vault/notes/index.md": "# Notes\n\n[[note]]\n",
      "/vault/notes/note.md": "# Journal\n\n[[../index]]\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs });
    expect(forest.displayPath).toBe("/vault/notes/index.md");
    expect(headingsOf(forest.root!)).toEqual(["Notes"]);
  });

  test("linkedIndex: false → TOC STRICTE de la référence (ni index lié, ni branche)", async () => {
    // Le vault contient un index.md racine ET un index lié : mode édition, la
    // TOC ne doit refléter QUE le .md affiché — aucune remontée Home.
    const fs = fakeFs({
      "/vault/index.md": "# R\n\n[[chapitre-1]]\n",
      "/vault/notes/index.md": "# Notes\n\n[[note]]\n",
      "/vault/notes/note.md": "# Journal\n\n## Partie A\n\n[[../index]]\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs, linkedIndex: false, maxDepth: 0 });
    expect(forest.displayPath).toBe("/vault/notes/note.md");
    expect(forest.root?.path).toBe("/vault/notes/note.md");
    expect(collectHeadings(forest.root!)).toEqual(["Journal", "Partie A"]);
    // Aucune branche transcluse (le lien [[../index]] reste un titre de note,
    // jamais une branche de navigation).
    expect(collectBranches(forest.root!)).toHaveLength(0);
  });
});

describe("buildTocForest — branches transcluses (wikilinks conformes)", () => {
  test("lien conforme → branche fichier sous le heading précédent", async () => {
    const forest = await build("/vault/notes/note.md");
    const root = forest.root!;
    // "Manuel" (h1) porte les deux branches chapitre-1 et chapitre-2.
    const manuel = root.children.find((c) => c.kind === "heading" && (c as any).entry.text === "Manuel") as any;
    const branches = manuel.children.filter((c) => c.kind === "file");
    expect(branches).toHaveLength(2);
    expect(branches[0].path).toBe("/vault/chapitre-1.md");
    expect(branches[0].label).toBe("chapitre-1");
    expect(branches[1].path).toBe("/vault/chapitre-2.md");
    // La branche porte les titres de SON fichier (sections nichées incluses) —
    // et la branche fiche-1 (transcluse sous Section 1.2) fait partie de
    // l'arbre affiché.
    expect(collectHeadings(branches[0])).toEqual([
      "Chapitre 1", "Section 1.1", "Section 1.2", "Fiche 1", "Détail A",
    ]);
  });

  test("wikilink inline (non conforme) → aucune branche", async () => {
    const fs = fakeFs({
      "/vault/index.md": "# R\n\nUn texte avec [[chapitre-1]] au milieu.\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs });
    expect(collectBranches(forest.root!)).toHaveLength(0);
  });

  test("cible PDF → jamais transclue", async () => {
    const fs = fakeFs({
      "/vault/index.md": "# R\n\n[[annexe.pdf]]\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs });
    expect(collectBranches(forest.root!)).toHaveLength(0);
  });

  test("cible absente → branche ignorée", async () => {
    const fs = fakeFs({
      "/vault/index.md": "# R\n\n[[absent]]\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs });
    expect(collectBranches(forest.root!)).toHaveLength(0);
  });

  test("transclusion récursive (niveau 2) — fiche-1 sous chapitre-1", async () => {
    const forest = await build("/vault/notes/note.md");
    const root = forest.root!;
    const ch1 = collectBranches(root).find((b) => b.label === "chapitre-1")!;
    // fiche-1 est liée dans la section 1.2 → branche sous Chapitre 1 → Section 1.2.
    const chap1 = ch1.children.find((c) => c.kind === "heading" && (c as any).entry.text === "Chapitre 1") as any;
    const s12 = chap1.children.find((c) => c.kind === "heading" && (c as any).entry.text === "Section 1.2") as any;
    const fiches = s12.children.filter((c: any) => c.kind === "file");
    expect(fiches).toHaveLength(1);
    expect(fiches[0].path).toBe("/vault/fiche-1.md");
    expect(collectHeadings(fiches[0])).toEqual(["Fiche 1", "Détail A"]);
  });

  test("cycle a→b→a → seconde occurrence ignorée, pas de boucle", async () => {
    const fs = fakeFs({
      "/vault/index.md": "# A\n\n[[b]]\n",
      "/vault/b.md": "# B\n\n[[a]]\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs });
    const root = forest.root!;
    const b = collectBranches(root)[0];
    expect(b.path).toBe("/vault/b.md");
    // B ne re-transclut pas A (cycle) → aucune branche sous B.
    expect(branchesOf(b)).toHaveLength(0);
  });

  test("maxDepth: 0 → aucune branche transcluse", async () => {
    const forest = await build("/vault/notes/note.md", { maxDepth: 0 });
    expect(collectBranches(forest.root!)).toHaveLength(0);
  });

  test("maxDepth: 1 → branche de niveau 1 seule (pas de niveau 2)", async () => {
    const forest = await build("/vault/notes/note.md", { maxDepth: 1 });
    expect(collectBranches(forest.root!)).toHaveLength(2); // chapitre-1, chapitre-2
    const ch1 = collectBranches(forest.root!).find((b) => b.label === "chapitre-1")!;
    expect(branchesOf(ch1)).toHaveLength(0); // fiche-1 non chargée
  });

  test("lien avec ancre [[page#section]] → résolu sur le fichier entier", async () => {
    const fs = fakeFs({
      "/vault/index.md": "# R\n\n[[chapitre-1#section-1-1]]\n",
      "/vault/chapitre-1.md": "# Chapitre 1\n\n## Section 1.1\n\n## Section 1.2\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs });
    const b = collectBranches(forest.root!).find((x) => x.label === "chapitre-1")!;
    expect(b.path).toBe("/vault/chapitre-1.md");
    expect(collectHeadings(b)).toEqual(["Chapitre 1", "Section 1.1", "Section 1.2"]);
  });

  test("résolution relative au fichier hôte", async () => {
    const fs = fakeFs({
      "/vault/notes/index.md": "# N\n\n[[note]]\n\n[[./chapitre-1]]\n",
      "/vault/notes/chapitre-1.md": "# Chapitre 1\n",
      "/vault/notes/note.md": "# Note\n\n[[../index]]\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs });
    expect(forest.displayPath).toBe("/vault/notes/index.md");
    expect(collectBranches(forest.root!).find((b) => b.label === "chapitre-1")!.path).toBe("/vault/notes/chapitre-1.md");
  });

  test("repli vault par basename (cible non résolue relativement)", async () => {
    const fs = fakeFs({
      "/vault/notes/index.md": "# N\n\n[[note]]\n\n[[fiche-1]]\n", // pas de notes/fiche-1.md
      "/vault/notes/note.md": "# Note\n\n[[../index]]\n",
      "/vault/fiche-1.md": "# Fiche 1\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs });
    expect(forest.displayPath).toBe("/vault/notes/index.md");
    expect(collectBranches(forest.root!).find((b) => b.label === "fiche-1")!.path).toBe("/vault/fiche-1.md");
  });

  test("arbre foldable : chaque nœud porte path + entry.line (saut)", async () => {
    const forest = await build("/vault/notes/note.md");
    const root = forest.root!;
    const ch1 = collectBranches(root).find((b) => b.label === "chapitre-1")!;
    const first = ch1.children.find((c) => c.kind === "heading") as any;
    expect(first.path).toBe("/vault/chapitre-1.md");
    expect(first.entry.line).toBeGreaterThan(0);
    expect(forest.root?.root).toBe(true);
  });

  test("alias `[[fichier|titre]]` → label de branche = alias, repli basename", async () => {
    const fs = fakeFs({
      "/vault/index.md": "# R\n\n[[chapitre-1|Le Chapitre Un]]\n\n[[chapitre-2]]\n",
      "/vault/chapitre-1.md": "# Chapitre 1\n",
      "/vault/chapitre-2.md": "# Chapitre 2\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs });
    const branches = collectBranches(forest.root!);
    // Alias présent → label = alias ; alias absent → repli basename.
    expect(branches.find((b) => b.path === "/vault/chapitre-1.md")?.label).toBe("Le Chapitre Un");
    expect(branches.find((b) => b.path === "/vault/chapitre-2.md")?.label).toBe("chapitre-2");
  });
});

describe("buildTocForest — mémoïsation par hash structural (phases 6/6bis)", () => {
  /** Fake fs qui COMPTE les lectures — un hit memo ne doit lire AUCUN fichier
   *  LIÉ (seule la lecture du fichier affiché reste, pour calculer le hash). */
  function countingFs(files: Record<string, string>) {
    const reads: string[] = [];
    const readText = async (path: string): Promise<string> => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      reads.push(path);
      return content;
    };
    return { reads, readText };
  }

  const INDEX = fakeIndex({
    "chapitre-1": "/vault/chapitre-1.md",
    "chapitre-2": "/vault/chapitre-2.md",
  });

  test("hit memo (même clé + même hash structural) → aucun fichier lié relu, même objet", async () => {
    const fs = countingFs({
      "/vault/index.md": "# R\n\n[[chapitre-1]]\n\n[[chapitre-2]]\n",
      "/vault/chapitre-1.md": "# Chapitre 1\n",
      "/vault/chapitre-2.md": "# Chapitre 2\n",
    });
    const memo = makeTocMemo();
    const opts = {
      rootPath: ROOT,
      referencePath: "/vault/notes/note.md",
      readText: fs.readText,
      getIndex: INDEX,
    };
    const first = await buildTocForest(opts, memo);
    expect(fs.reads).toContain("/vault/chapitre-1.md");

    const linkedBefore = fs.reads.filter((p) => p.includes("chapitre")).length;
    const second = await buildTocForest(opts, memo);
    // Le hit ne relit AUCUN fichier lié (les chapitres ne sont pas re-transclus).
    expect(fs.reads.filter((p) => p.includes("chapitre"))).toHaveLength(linkedBefore);
    // MÊME objet : les nœuds mémoïsés sont retournés tels quels.
    expect(second).toBe(first);
    expect(second.structuralHash).toBe(first.structuralHash);
  });

  test("frappe dans le CORPS (hash structural identique) → hit memo", async () => {
    // Pas d'index.md dans le vault : displayPath = référence, le buffer live
    // (referenceSource) fait foi — on simule une frappe dans un paragraphe.
    const readText = countingFs({
      "/vault/notes/note.md": "# Note\n\n[[chapitre-1]]\n",
      "/vault/chapitre-1.md": "# Chapitre 1\n",
    }).readText;
    const memo = makeTocMemo();
    const opts = {
      rootPath: ROOT,
      referencePath: "/vault/notes/note.md",
      readText,
      getIndex: INDEX,
    };
    const first = await buildTocForest(
      { ...opts, referenceSource: "# Note\n\nTexte de corps modifié pendant la frappe.\n\n[[chapitre-1]]\n" },
      memo,
    );
    const second = await buildTocForest(
      { ...opts, referenceSource: "# Note\n\nTexte de corps ENCORE modifié.\n\n[[chapitre-1]]\n" },
      memo,
    );
    // Frappe dans le corps → même hash structural → la forêt est réutilisée.
    expect(second).toBe(first);
    expect(collectHeadings(second.root!)).toEqual(["Note", "Chapitre 1"]);
  });

  test("titre modifié (hash structural différent) → rebuild", async () => {
    const readText = countingFs({
      "/vault/notes/note.md": "# Note\n\n[[chapitre-1]]\n",
      "/vault/chapitre-1.md": "# Chapitre 1\n",
    }).readText;
    const memo = makeTocMemo();
    const opts = {
      rootPath: ROOT,
      referencePath: "/vault/notes/note.md",
      readText,
      getIndex: INDEX,
    };
    const first = await buildTocForest({ ...opts, referenceSource: "# Note\n\n[[chapitre-1]]\n" }, memo);
    const rebuilt = await buildTocForest(
      { ...opts, referenceSource: "# Note\n\n## Nouveau titre\n\n[[chapitre-1]]\n" },
      memo,
    );
    expect(rebuilt).not.toBe(first);
    expect(collectHeadings(rebuilt.root!)).toContain("Nouveau titre");
  });

  test("changement de fichier de référence (clé) → rebuild", async () => {
    const files: Record<string, string> = {
      "/vault/index.md": "# R\n\n[[chapitre-1]]\n",
      "/vault/chapitre-1.md": "# Chapitre 1\n",
      "/vault/autre.md": "# Autre\n",
    };
    const readText = countingFs(files).readText;
    const memo = makeTocMemo();
    const opts = {
      rootPath: ROOT,
      readText,
      getIndex: INDEX,
    };
    const first = await buildTocForest({ ...opts, referencePath: "/vault/notes/note.md" }, memo);
    const rebuilt = await buildTocForest({ ...opts, referencePath: "/vault/autre.md" }, memo);
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.displayPath).toBe("/vault/index.md");
  });

  test("index.md lié créé entre deux builds (displayPath change) → rebuild", async () => {
    const files: Record<string, string> = {
      "/vault/chapitre-1.md": "# Chapitre 1\n",
    };
    const reads: string[] = [];
    const readText = async (path: string): Promise<string> => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      reads.push(path);
      return content;
    };
    const memo = makeTocMemo();
    const opts = {
      rootPath: ROOT,
      referencePath: "/vault/notes/note.md",
      readText,
      getIndex: INDEX,
    };
    // Pas d'index.md lié → displayPath = référence (source live).
    const first = await buildTocForest({ ...opts, referenceSource: "# Note\n" }, memo);
    expect(first.displayPath).toBe("/vault/notes/note.md");

    // L'index.md est créé dans le vault → même clé, displayPath différent.
    files["/vault/index.md"] = "# R\n\n[[chapitre-1]]\n";
    const rebuilt = await buildTocForest({ ...opts, referenceSource: "# Note\n" }, memo);
    expect(rebuilt).not.toBe(first);
    expect(rebuilt.displayPath).toBe("/vault/index.md");
    expect(collectBranches(rebuilt.root!)).toHaveLength(1);
  });

  test("changement de maxDepth (bascule mode navigation ↔ édition) → rebuild, jamais de forêt obsolète", async () => {
    // Même fichier, même contenu : seul maxDepth change (3 → 0). La clé du
    // memo inclut maxDepth — sinon la bascule servirait la forêt de l'autre
    // mode (branches fantômes en édition, ou forêt appauvrie en navigation).
    const files: Record<string, string> = {
      "/vault/chapitre-1.md": "# Chapitre 1\n",
    };
    const readText = countingFs(files).readText;
    const memo = makeTocMemo();
    const base = {
      rootPath: ROOT,
      referencePath: "/vault/notes/note.md",
      readText,
      getIndex: INDEX,
      referenceSource: "# Note\n\n[[chapitre-1]]\n",
    };
    const nav = await buildTocForest({ ...base, maxDepth: 3 }, memo);
    expect(collectBranches(nav.root!)).toHaveLength(1);

    const edit = await buildTocForest({ ...base, maxDepth: 0 }, memo);
    expect(edit).not.toBe(nav);
    expect(collectBranches(edit.root!)).toHaveLength(0);

    // Retour en navigation : forêt complète reconstruite (pas l'édition).
    const navAgain = await buildTocForest({ ...base, maxDepth: 3 }, memo);
    expect(navAgain).not.toBe(edit);
    expect(collectBranches(navAgain.root!)).toHaveLength(1);
  });

  test("structuralHash exposé sur la forêt (hash du contenu affiché)", async () => {
    const fs = fakeFs({
      "/vault/index.md": "# R\n\n[[chapitre-1]]\n",
      "/vault/chapitre-1.md": "# Chapitre 1\n",
    });
    const forest = await build("/vault/notes/note.md", { readText: fs });
    expect(forest.structuralHash).toMatch(/^[0-9a-f]{1,8}$/);
    expect(forest.structuralHash).not.toBe("");
  });
});
