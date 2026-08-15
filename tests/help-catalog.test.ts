import { describe, expect, it } from "bun:test";
import {
  catalog,
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

  // Noms SANS préfixe numérique (2026-08-14) : l'ordre de lecture est déclaré
  // dans le `sommaire:` d'index.md, plus dans les noms de fichiers — un
  // chapitre inséré ne renomme plus rien. Ce catalogue-ci reste un index de
  // RECHERCHE (complétion `aide:`), d'où le tri alphabétique du test voisin.
  it("le guide complet est au catalogue (11 chapitres), les exemples exclus du footer", () => {
    const paths = catalog.map((a) => a.path);
    expect(paths).toHaveLength(12); // index.md + 11 chapitres
    for (const p of [
      "index.md",
      "assistant.md",
      "prise-en-main.md",
      "raccourcis.md",
      "wikilinks.md",
      "transclusions.md",
      "callouts.md",
      "vue-liens.md",
      "front-matter.md",
      "journal.md",
      "impression.md",
      "colles.md",
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

  it("helpRelativePath : chemin relatif normalisé", () => {
    expect(helpRelativePath("/vault/.azprose/help/wikilinks.md", "/vault/.azprose/help")).toBe("wikilinks.md");
    // anti-slash toléré (Windows)
    expect(helpRelativePath("C:\\vault\\.azprose\\help\\index.md", "C:/vault/.azprose/help")).toBe("index.md");
  });

  it("helpRelativePath : hors du dossier help → null", () => {
    expect(helpRelativePath("/vault/notes/prise-en-main.md", "/vault/.azprose/help")).toBeNull();
    // préfixe trompeur (dossier voisin partageant le préfixe)
    expect(helpRelativePath("/vault/.azprose/help-backup/index.md", "/vault/.azprose/help")).toBeNull();
  });
});
