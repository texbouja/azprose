import { describe, expect, test } from "bun:test";
import {
  extractWikilinkTargets,
  findLinkedIndexMd,
  isLinkedToFile,
  normIndexPath,
  resolveMdLinkHref,
} from "@/lib/index-home";

/** Fake fs : Map<path, content> — lire un chemin absent rejette (comme plugin-fs). */
function fakeFs(files: Record<string, string>) {
  return async (path: string): Promise<string> => {
    const content = files[path];
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  };
}

const ROOT = "/vault";

describe("extractWikilinkTargets", () => {
  test("target simple, heading et alias", () => {
    const c = "Voir [[suites]] et [[algebre/suites#Partie 2|les suites]] ici.";
    expect(extractWikilinkTargets(c)).toEqual(["suites", "algebre/suites"]);
  });
  test("sans wikilink", () => {
    expect(extractWikilinkTargets("pas de lien")).toEqual([]);
  });
  test("échappé littéral ignoré", () => {
    expect(extractWikilinkTargets("\\[[littéral]]")).toEqual([]);
  });
});

describe("resolveMdLinkHref", () => {
  test("relatif résolu depuis fromDir", () => {
    expect(resolveMdLinkHref("./suites.md", "/vault/cours/algebre", ROOT)).toBe(
      "/vault/cours/algebre/suites.md",
    );
  });
  test("../ remonte", () => {
    expect(resolveMdLinkHref("../suites.md", "/vault/cours/algebre", ROOT)).toBe(
      "/vault/cours/suites.md",
    );
  });
  test("racine du vault avec /", () => {
    expect(resolveMdLinkHref("/index.md", "/vault/cours", ROOT)).toBe("/vault/index.md");
  });
  test("fragment et query retirés", () => {
    expect(resolveMdLinkHref("./suites.md#intro?x=1", "/vault/cours/algebre", ROOT)).toBe(
      "/vault/cours/algebre/suites.md",
    );
  });
  test("file:// décodé", () => {
    expect(
      resolveMdLinkHref("file:///vault/cours/suites%20num%C3%A9riques.md", "/vault", ROOT),
    ).toBe("/vault/cours/suites numériques.md");
  });
  test("protocoles externes et ancres → ''", () => {
    expect(resolveMdLinkHref("https://exemple.fr", "/vault", ROOT)).toBe("");
    expect(resolveMdLinkHref("mailto:a@b.c", "/vault", ROOT)).toBe("");
    expect(resolveMdLinkHref("#heading", "/vault", ROOT)).toBe("");
  });
});

describe("isLinkedToFile", () => {
  const cur = "/vault/cours/algebre/suites.md";
  const dir = "/vault/cours/algebre";
  test("wikilink par basename", () => {
    expect(isLinkedToFile("Lien : [[suites]]", cur, dir, ROOT)).toBe(true);
  });
  test("wikilink par chemin", () => {
    expect(isLinkedToFile("Lien : [[cours/algebre/suites#théorème|T]]", cur, dir, ROOT)).toBe(true);
  });
  test("lien markdown relatif", () => {
    expect(isLinkedToFile("[suites](./suites.md)", cur, dir, ROOT)).toBe(true);
  });
  test("lien markdown absolu vault", () => {
    expect(isLinkedToFile("[suites](/cours/algebre/suites.md)", cur, dir, ROOT)).toBe(true);
  });
  test("lien externe ou autre fichier → false", () => {
    expect(isLinkedToFile("[ext](https://exemple.fr)", cur, dir, ROOT)).toBe(false);
    expect(isLinkedToFile("[autres](autres.md)", cur, dir, ROOT)).toBe(false);
    expect(isLinkedToFile("Aucun lien.", cur, dir, ROOT)).toBe(false);
  });
});

describe("findLinkedIndexMd", () => {
  test("index.md du dossier courant lié → prioritaire", async () => {
    const files = {
      "/vault/cours/algebre/index.md": "# Algèbre\n[[suites]]",
      "/vault/cours/index.md": "# Cours\n[[suites]]",
    };
    const res = await findLinkedIndexMd({
      rootPath: ROOT,
      currentFilePath: "/vault/cours/algebre/suites.md",
      readText: fakeFs(files),
    });
    expect(res).toBe("/vault/cours/algebre/index.md");
  });
  test("remontée : dossier courant sans index, parent lié (niveau 2)", async () => {
    const files = {
      "/vault/cours/index.md": "# Cours\n[suites](algebre/suites.md)",
    };
    const res = await findLinkedIndexMd({
      rootPath: ROOT,
      currentFilePath: "/vault/cours/algebre/suites.md",
      readText: fakeFs(files),
    });
    expect(res).toBe("/vault/cours/index.md");
  });
  test("remontée bornée à maxLevels", async () => {
    const files = {
      "/vault/index.md": "# Vault\n[[suites]]",
    };
    const res = await findLinkedIndexMd({
      rootPath: ROOT,
      currentFilePath: "/vault/a/b/c/suites.md",
      readText: fakeFs(files),
      maxLevels: 2,
    });
    expect(res).toBe("/vault/index.md"); // le repli racine s'applique (lié mais au-delà de 2 niveaux)
  });
  test("aucun index lié → repli rootPath/index.md", async () => {
    const files = {
      "/vault/index.md": "# Bienvenue",
    };
    const res = await findLinkedIndexMd({
      rootPath: ROOT,
      currentFilePath: "/vault/cours/algebre/suites.md",
      readText: fakeFs(files),
    });
    expect(res).toBe("/vault/index.md");
  });
  test("pas d'index du tout → null (no-op)", async () => {
    const res = await findLinkedIndexMd({
      rootPath: ROOT,
      currentFilePath: "/vault/cours/algebre/suites.md",
      readText: fakeFs({}),
    });
    expect(res).toBeNull();
  });
  test("hors vault → repli immédiat racine", async () => {
    const files = { "/vault/index.md": "# Vault" };
    const res = await findLinkedIndexMd({
      rootPath: ROOT,
      currentFilePath: "/tmp/autre.md",
      readText: fakeFs(files),
    });
    expect(res).toBe("/vault/index.md");
  });
  test("index racine absent ET fichier hors vault → null", async () => {
    const res = await findLinkedIndexMd({
      rootPath: ROOT,
      currentFilePath: "/tmp/autre.md",
      readText: fakeFs({}),
    });
    expect(res).toBeNull();
  });
});

describe("normIndexPath", () => {
  test("antislash et . normalisés", () => {
    expect(normIndexPath("c:\\vault\\.\\cours\\suites.md")).toBe("c:/vault/cours/suites.md");
  });
});
