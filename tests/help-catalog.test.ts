import { describe, expect, it } from "bun:test";
import {
  catalog,
  articleIndex,
  neighbors,
  helpRelativePath,
  HELP_ROOT,
  HELP_VERSION,
} from "../src/help/catalog";

describe("catalog (doc intégrée, générée par scripts/sync-help.mjs)", () => {
  it("racine + version générées (hash du contenu, string)", () => {
    expect(HELP_ROOT).toBe("index.md");
    expect(typeof HELP_VERSION).toBe("string");
    expect(HELP_VERSION).toMatch(/^[0-9a-f]{8,16}$/);
    expect(catalog[0].path).toBe(HELP_ROOT);
    expect(catalog[0].title.length).toBeGreaterThan(0);
  });

  it("catalogue trié : index.md en tête, puis ordre alphabétique du relatif", () => {
    const paths = catalog.map((a) => a.path);
    expect(paths[0]).toBe("index.md");
    const rest = paths.slice(1);
    expect([...rest].sort()).toEqual(rest);
  });

  it("le guide complet est au catalogue (10 chapitres), les exemples exclus du footer", () => {
    const paths = catalog.map((a) => a.path);
    expect(paths).toHaveLength(11); // index.md + 10 chapitres
    for (const p of [
      "index.md",
      "01-prise-en-main.md",
      "02-raccourcis.md",
      "03-wikilinks.md",
      "04-transclusions.md",
      "05-callouts.md",
      "06-vue-liens.md",
      "07-front-matter.md",
      "08-journal.md",
      "09-impression.md",
      "10-colles.md",
    ]) {
      expect(paths).toContain(p);
    }
    // Les exemples sont EMBARQUÉS (les wikilinks du guide y résolvent) mais
    // sans footer précédent/suivant.
    expect(paths.some((p) => p.startsWith("exemples/"))).toBe(false);
  });

  it("chaque titre est non vide", () => {
    for (const a of catalog) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.path.endsWith(".md")).toBe(true);
    }
  });

  it("articleIndex retrouve un article du catalogue", () => {
    expect(articleIndex("index.md")).toBe(0);
    expect(articleIndex(catalog[1].path)).toBe(1);
    expect(articleIndex("absent.md")).toBe(-1);
  });

  it("neighbors : racine sans précédent, suivant = 2e article", () => {
    const { prev, next } = neighbors("index.md");
    expect(prev).toBeUndefined();
    expect(next).toEqual(catalog[1]);
  });

  it("neighbors : dernier article sans suivant, précédent = avant-dernier", () => {
    const last = catalog[catalog.length - 1];
    const { prev, next } = neighbors(last.path);
    expect(next).toBeUndefined();
    expect(prev).toEqual(catalog[catalog.length - 2]);
  });

  it("neighbors : article inconnu → aucun voisin", () => {
    expect(neighbors("introuvable.md")).toEqual({});
  });

  it("helpRelativePath : chemin relatif normalisé", () => {
    expect(helpRelativePath("/vault/.azprose/help/03-wikilinks.md", "/vault/.azprose/help")).toBe("03-wikilinks.md");
    // anti-slash toléré (Windows)
    expect(helpRelativePath("C:\\vault\\.azprose\\help\\index.md", "C:/vault/.azprose/help")).toBe("index.md");
  });

  it("helpRelativePath : hors du dossier help → null", () => {
    expect(helpRelativePath("/vault/notes/01-prise-en-main.md", "/vault/.azprose/help")).toBeNull();
    // préfixe trompeur (dossier voisin partageant le préfixe)
    expect(helpRelativePath("/vault/.azprose/help-backup/index.md", "/vault/.azprose/help")).toBeNull();
  });
});
