/**
 * Templating YAML du corps markdown + transclusions (doc-template.ts) —
 * module PUR. Résolution AU RENDU (le front-matter n'est jamais écrit dans
 * la source), moteur de syntaxe = handout-layout (facture Handlebars).
 *
 * Contrat testé :
 *  - resolveDocVar : `type` (et chemins) → null ; absent/null/objet → null ;
 *    true → "true" ; false → null ; scalaire → String ; tableau → « · » ;
 *    chemins `chapitres.0`, `auteur.nom` ;
 *  - resolveDocEach : tableaux YAML, `{{this}}`, chemins dans les objets,
 *    repli parent pour les variables hors item ;
 *  - templateOutsideFences : fences ``` et ~~~ sautés (verbatim), blocs
 *    multi-lignes rendus entiers, fence non fermée → verbatim ;
 *  - renderBodyTemplates : blocs if/unless/each + variables dans le corps ;
 *  - templateDocSource : portée « maître prime, repli transclu », front-matter
 *    du transclu préservé intact ;
 *  - hook transclusion (resolveTransclusions + templateSource) : les
 *    `{{var}}` d'un fichier transclu se résolvent avec les valeurs du maître.
 */
import { describe, expect, it } from "bun:test";
import {
  resolveDocEach,
  resolveDocVar,
  renderBodyTemplates,
  templateDocSource,
  templateOutsideFences,
} from "@/lib/doc-template";
import { resolveTransclusions, type TransclusionFs } from "../src/markdown/transclusion";

// ── resolveDocVar ────────────────────────────────────────────────────────────

describe("resolveDocVar — règles de résolution YAML", () => {
  const values = {
    matiere: "Maths",
    duree: 2,
    publie: true,
    brouillon: false,
    vide: "",
    absent: null,
    chapitres: ["suites", "limites"],
    auteur: { nom: "K. Boujaida", prenom: "Karim" },
    notes: { rub1: 5 },
  };

  it("type (et chemins) → null : commutateur logique, jamais affiché", () => {
    expect(resolveDocVar("type", values)).toBeNull();
    expect(resolveDocVar("type.nom", values)).toBeNull();
  });

  it("scalaire → String ; nombre converti", () => {
    expect(resolveDocVar("matiere", values)?.value).toBe("Maths");
    expect(resolveDocVar("duree", values)?.value).toBe("2");
  });

  it("true → « true » ; false → null ; chaîne vide → « » (invisible) ; absent/null → null", () => {
    expect(resolveDocVar("publie", values)?.value).toBe("true");
    expect(resolveDocVar("brouillon", values)).toBeNull();
    // chaîne vide : valeur « » — invisible à l'affichage, vide pour {{#if}}.
    expect(resolveDocVar("vide", values)).toEqual({ value: "", raw: false });
    expect(resolveDocVar("absent", values)).toBeNull();
    expect(resolveDocVar("inconnu", values)).toBeNull();
  });

  it("tableau → joint « · » ; objet → null", () => {
    expect(resolveDocVar("chapitres", values)?.value).toBe("suites · limites");
    expect(resolveDocVar("notes", values)).toBeNull();
  });

  it("chemins : chapitres.0 par index, auteur.nom par clé propre", () => {
    expect(resolveDocVar("chapitres.0", values)?.value).toBe("suites");
    expect(resolveDocVar("auteur.nom", values)?.value).toBe("K. Boujaida");
    expect(resolveDocVar("auteur.missing", values)).toBeNull();
    expect(resolveDocVar("chapitres.9", values)).toBeNull();
  });
});

// ── resolveDocEach ───────────────────────────────────────────────────────────

describe("resolveDocEach — boucles {{#each}}", () => {
  const values = {
    chapitres: ["suites", "limites"],
    rubriques: [
      { titre: "Suites", valeur: 4 },
      { titre: "Limites", valeur: 5 },
    ],
    salle: "S1",
  };

  it("non-tableau → null (bloc traité comme vide par le moteur)", () => {
    expect(resolveDocEach("matiere", { matiere: "Maths" })).toBeNull();
    expect(resolveDocEach("inconnu", values)).toBeNull();
  });

  it("tableau de scalaires : {{this}} résout chaque item", () => {
    const ctx = resolveDocEach("chapitres", values)!;
    expect(ctx.items.length).toBe(2);
    expect(ctx.items[0].resolve("this")?.value).toBe("suites");
    expect(ctx.items[1].resolve("this")?.value).toBe("limites");
  });

  it("tableau d'objets : chemins résolus sur l'item, repli parent sinon", () => {
    const ctx = resolveDocEach("rubriques", values)!;
    expect(ctx.items[0].resolve("titre")?.value).toBe("Suites");
    expect(ctx.items[1].resolve("valeur")?.value).toBe("5");
    // variable hors item → repli sur le contexte parent (résolue par renderBlocks).
    expect(ctx.items[0].resolve("salle")).toBeNull();
  });

  it("tableau vide → items vides (le moteur rend la branche {{else}})", () => {
    expect(resolveDocEach("vide", { vide: [] })?.items.length).toBe(0);
  });
});

// ── templateOutsideFences ────────────────────────────────────────────────────

describe("templateOutsideFences — fences sautés", () => {
  it("les blocs multi-lignes HORS fences sont rendus entiers", () => {
    const out = templateOutsideFences(
      "avant\n{{#if publie}}OUI{{else}}NON{{/if}}\naprès",
      (seg) => seg.replace("{{#if publie}}OUI{{else}}NON{{/if}}", "RENDU"),
    );
    expect(out).toBe("avant\nRENDU\naprès");
  });

  it("le code dans ``` est verbatim (jamais templaté)", () => {
    const src = "corps\n```ts\nconst x = \"{{var}}\";\n```\nfin";
    // le render remplace chaque segment hors fence en préservant les \n.
    const out = templateOutsideFences(src, (seg) => seg.replace(/corps|fin/g, "RENDU"));
    expect(out).toBe("RENDU\n```ts\nconst x = \"{{var}}\";\n```\nRENDU");
  });

  it("fence ~~~ aussi ; fermeture = même marque seule en fin de ligne", () => {
    const src = "intro\n~~~md\n{{#if a}}\n~~~\nfin";
    const out = templateOutsideFences(src, (seg) => seg.replace(/intro|fin/g, "T"));
    expect(out).toBe("T\n~~~md\n{{#if a}}\n~~~\nT");
  });

  it("fence non fermée → tout le reste verbatim", () => {
    const src = "début\n```\n{{x}}\n{{#if y}}z{{/if}}";
    const out = templateOutsideFences(src, (seg) => seg.replace(/début/, "T"));
    expect(out).toBe("T\n```\n{{x}}\n{{#if y}}z{{/if}}");
  });
});

// ── renderBodyTemplates ──────────────────────────────────────────────────────

describe("renderBodyTemplates — corps du document", () => {
  it("variables, if/unless/each avec les valeurs du front-matter", () => {
    const body =
      "Matière : {{matiere}}\n" +
      "{{#if publie}}publié{{else}}brouillon{{/if}}\n" +
      "{{#unless brouillon}}confirmé{{/unless}}\n" +
      "{{#each chapitres}}- {{this}}\n{{/each}}";
    const out = renderBodyTemplates(body, {
      matiere: "Maths",
      publie: true,
      brouillon: false,
      chapitres: ["suites", "limites"],
    });
    expect(out).toBe(
      "Matière : Maths\npublié\nconfirmé\n- suites\n- limites\n",
    );
  });

  it("variable inconnue → invisible ; type → invisible ; fence préservé", () => {
    const body = "a{{inconnu}}b{{type}}c\n```\n{{type}}\n```";
    expect(renderBodyTemplates(body, { type: "cours" })).toBe("abc\n```\n{{type}}\n```");
  });

  it("code dans une fence contenant des {{#if}} reste verbatim", () => {
    const body = "```\n{{#if x}}y{{/if}}\n```\n{{#if x}}z{{/if}}";
    expect(renderBodyTemplates(body, { x: true })).toBe("```\n{{#if x}}y{{/if}}\n```\nz");
  });
});

// ── templateDocSource (transclusions : maître puis transclu) ────────────────

describe("templateDocSource — portée maître prime, repli transclu", () => {
  const master = { matiere: "Maths", salle: "S1" };
  const source = "---\nmatiere: Physique\ncolleur: K. Boujaida\n---\n{{matiere}} / {{colleur}} / {{salle}}";

  it("la variable du maître prime ; le repli prend la valeur du transclu", () => {
    const out = templateDocSource(source, master);
    // matiere → maître (Maths) ; colleur → repli (transclu) ; salle → maître.
    expect(out).toContain("Maths / K. Boujaida / S1");
  });

  it("le front-matter du transclu est préservé intact, jamais rendu", () => {
    const out = templateDocSource(source, master);
    expect(out.startsWith("---\nmatiere: Physique\ncolleur: K. Boujaida\n---\n")).toBe(true);
  });

  it("le corps re-templaté remplace l'ancien, la longueur du préfixe est stable", () => {
    const out = templateDocSource(source, {});
    expect(out).toBe("---\nmatiere: Physique\ncolleur: K. Boujaida\n---\nPhysique / K. Boujaida / ");
  });
});

// ── Hook transclusion (résolution maître dans les fichiers inclus) ──────────

describe("resolveTransclusions + templateSource — hook du fichier maître", () => {
  const fs: TransclusionFs = {
    async readText(path) {
      const store: Record<string, string> = {
        "/vault/planche.md": "---\nmatiere: Physique\n---\n{{matiere}} — {{colleur}}",
        "/vault/maitre.md": "---\nmatiere: Maths\ncolleur: K. Boujaida\n---\n![[planche.md]]",
      };
      if (!(path in store)) throw new Error("not found");
      return store[path];
    },
    async exists(path) {
      return ["/vault/planche.md", "/vault/maitre.md"].includes(path);
    },
  };

  it("les {{var}} du transclu se résolvent avec le front-matter du MAÎTRE", async () => {
    const out = await resolveTransclusions(
      "![[planche.md]]",
      "/vault/maitre.md",
      0,
      new Set(),
      undefined,
      undefined,
      fs,
      undefined,
      (s) => templateDocSource(s, { matiere: "Maths", colleur: "K. Boujaida" }),
    );
    // matiere → maître (Maths, pas Physique) ; colleur → maître.
    expect(out).toContain("Maths — K. Boujaida");
    expect(out).not.toContain("{{");
    // le front-matter du transclu est conservé (comportement historique de
    // l'inclusion complète) — le CORPS est résolu, pas le préfixe.
    expect(out).toContain("matiere: Physique");
  });

  it("sans hook → le corps du transclu reste verbatim (comportement historique)", async () => {
    const out = await resolveTransclusions(
      "![[planche.md]]",
      "/vault/maitre.md",
      0,
      new Set(),
      undefined,
      undefined,
      fs,
    );
    expect(out).toContain("{{matiere}}");
  });
});
