import { describe, expect, test } from "bun:test";
import { buildHelpForest } from "@/help/help-toc";
import { catalog } from "@/help/catalog";
import type { TocFileNode, TocHeadingNode, TocNode } from "@/lib/toc-forest";
import { joinPath } from "@/lib/paths-utils";

/**
 * Tests de la forêt de TOC de l'AIDE INTÉGRÉE — la TOC sidebar doit se
 * comporter comme un MANUEL : la racine index.md (page de garde + sommaire)
 * porte les CHAPITRES du catalogue, chaque chapitre porte ses sections H2+.
 * Le module est PUR (DI readText) — les tests passent le VRAI catalogue avec
 * un faux système de fichiers.
 */

const HELP = "/vault/.azprose/help";

function fakeFs(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    const content = files[path];
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  };
}

/** Fake fs contenant TOUS les articles du catalogue (avec des titres). */
function fullHelpFs(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const a of catalog) files[joinPath(HELP, a.path)] = `# ${a.title}\n\nContenu de test.\n`;
  return files;
}

const ARTICLES = fullHelpFs();

/** Branches fichier directes (niveau 1) de la racine. */
function fileChildren(node: TocFileNode): TocFileNode[] {
  return node.children.filter((c) => c.kind === "file") as TocFileNode[];
}

/** Labels des branches fichier de niveau 1. */
function fileLabels(node: TocFileNode): string[] {
  return fileChildren(node).map((b) => b.label);
}

/** Toutes les branches fichier de l'arbre, en profondeur. */
function collectBranches(node: TocNode): TocFileNode[] {
  const out: TocFileNode[] = [];
  for (const c of node.children) {
    if (c.kind === "file") out.push(c, ...collectBranches(c));
    else out.push(...collectBranches(c));
  }
  return out;
}

/** Libellés des headings directs d'un nœud. */
function headingLabels(children: TocNode[]): string[] {
  return children.filter((c) => c.kind === "heading").map((c) => (c.kind === "heading" ? c.entry.text : ""));
}

describe("buildHelpForest — un sommaire de manuel", () => {
  test("la racine EST index.md (page de garde + sommaire)", async () => {
    const f = await buildHelpForest({ helpDir: HELP, readText: fakeFs(ARTICLES) });
    expect(f.root!.root).toBe(true);
    expect(f.root!.path).toBe(joinPath(HELP, "index.md"));
    expect(f.root!.label).toBe(catalog[0].title);
  });

  test("TOUS les chapitres du catalogue sont présents, index.md PAS une branche", async () => {
    const f = await buildHelpForest({ helpDir: HELP, readText: fakeFs(ARTICLES) });
    // 10 chapitres = catalogue - index.md (qui est la RACINE, pas une branche).
    expect(fileChildren(f.root!)).toHaveLength(catalog.length - 1);
    const paths = fileChildren(f.root!).map((b) => b.path);
    for (const a of catalog) {
      if (a.path === "index.md") continue;
      expect(paths).toContain(joinPath(HELP, a.path));
    }
  });

  test("les chapitres sont dans l'ordre du catalogue (01 → 10)", async () => {
    const f = await buildHelpForest({ helpDir: HELP, readText: fakeFs(ARTICLES) });
    expect(fileLabels(f.root!)).toEqual(catalog.slice(1).map((a) => a.title));
  });

  test("chaque branche est identifiée par son titre de catalogue, pas son basename", async () => {
    const f = await buildHelpForest({ helpDir: HELP, readText: fakeFs(ARTICLES) });
    for (const b of collectBranches(f.root!)) {
      const art = catalog.find((a) => joinPath(HELP, a.path) === b.path);
      expect(art).toBeDefined();
      expect(b.label).toBe(art!.title);
    }
  });

  test("le H1 d'un chapitre est EXCLU, ses H2+ deviennent ses enfants (hiérarchie)", async () => {
    const fs = fakeFs({
      [joinPath(HELP, "index.md")]: "# AZprose — Guide utilisateur\n",
      [joinPath(HELP, "03-wikilinks.md")]: [
        "# 3. Les liens entre notes — wikilinks",
        "",
        "## Un lien simple",
        "",
        "### Les ancres",
        "",
        "## Les liens PDF",
        "",
      ].join("\n"),
    });
    const f = await buildHelpForest({ helpDir: HELP, readText: fs });
    const ch = fileChildren(f.root!).find((b) => b.path === joinPath(HELP, "03-wikilinks.md"))!;
    // Enfants directs = H2 uniquement (le H1 de la page est exclu).
    expect(headingLabels(ch.children)).toEqual(["Un lien simple", "Les liens PDF"]);
    // L'H3 « Les ancres » est niché sous son H2 parent, pas au niveau 1.
    const first = ch.children[0] as TocHeadingNode;
    expect(first.kind).toBe("heading");
    expect(headingLabels(first.children)).toEqual(["Les ancres"]);
  });

  test("article illisible → écarté, le reste du guide reste navigable", async () => {
    const fs = fakeFs({
      [joinPath(HELP, "index.md")]: "# Index\n",
      [joinPath(HELP, "03-wikilinks.md")]: "# Wikilinks\n",
    });
    const f = await buildHelpForest({ helpDir: HELP, readText: fs });
    expect(fileLabels(f.root!)).toEqual(["3. Les liens entre notes — wikilinks"]);
  });

  test("aucun article lisible → root null (état vide, jamais de crash)", async () => {
    const f = await buildHelpForest({ helpDir: HELP, readText: fakeFs({}) });
    expect(f.root).toBeNull();
  });
});

describe("buildHelpForest — plus de sections : tout est un article navigable", () => {
  test("chaque branche fichier pointe un ARTICLE .md, jamais un dossier", async () => {
    const f = await buildHelpForest({ helpDir: HELP, readText: fakeFs(ARTICLES) });
    for (const b of collectBranches(f.root!)) {
      expect(b.path.endsWith(".md")).toBe(true);
    }
  });
});

describe("buildHelpForest — stabilité et forme", () => {
  test("la forêt est IDENTIQUE quel que soit l'article demandé (pas de paramètre article)", async () => {
    const f1 = await buildHelpForest({ helpDir: HELP, readText: fakeFs(ARTICLES) });
    const f2 = await buildHelpForest({ helpDir: HELP, readText: fakeFs(ARTICLES) });
    expect(fileLabels(f1.root!)).toEqual(fileLabels(f2.root!));
    expect(f1.displayPath).toBe(f2.displayPath);
  });

  test("displayPath pointe la racine index.md", async () => {
    const f = await buildHelpForest({ helpDir: HELP, readText: fakeFs(ARTICLES) });
    expect(f.displayPath).toBe(joinPath(HELP, "index.md"));
  });
});
