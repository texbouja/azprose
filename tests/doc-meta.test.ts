/**
 * Métadonnées de document (doc-meta.ts) — module PUR.
 *
 * Contrat testé :
 *  - ```` ```meta ```` est le fence officiel ; ```` ```colle ```` = SPÉCIALISATION
 *    (type forcé "colle" — le nom du fence est autoritaire, il prime sur le YAML) ;
 *  - type : enum restreint à DOC_TYPES, valeur hors liste repliée sur "misc" ;
 *  - parseMetaYaml : valeurs plates (scalaires → String), tableaux joints par
 *    « · », objets ignorés, {} si vide/invalide/non-objet ; clés libres préservées ;
 *  - catalogue DOC_META_FIELDS : 18 champs documentés pour l'UI (non prioritaire),
 *    le parser n'est PAS restreint par le catalogue.
 */
import {
  DOC_META_FIELDS,
  DOC_TYPES,
  humanizeDocType,
  isColleMetaFence,
  isDocType,
  normalizeDocType,
  parseMetaFence,
  parseMetaYaml,
  type DocType,
  type ParsedMetaFence,
} from "@/lib/doc-meta";

describe("DOC_TYPES / normalizeDocType", () => {
  it("enum des 8 types : cours, exercices, devoir, note, colle, concours, rapport, misc", () => {
    expect(DOC_TYPES).toEqual([
      "cours", "exercices", "devoir", "note", "colle", "concours", "rapport", "misc",
    ]);
  });

  it("isDocType accepte l'enum, rejette le reste", () => {
    expect(isDocType("colle")).toBe(true);
    expect(isDocType("cours")).toBe(true);
    expect(isDocType("polycopie")).toBe(false);
    expect(isDocType(3)).toBe(false);
  });

  it("normalizeDocType replie toute valeur hors enum sur misc", () => {
    expect(normalizeDocType("exercices")).toBe("exercices");
    expect(normalizeDocType("polycopie")).toBe("misc");
    expect(normalizeDocType(undefined)).toBe("misc");
    expect(normalizeDocType("")).toBe("misc");
  });

  it("humanizeDocType donne un libellé lisible (misc → Document)", () => {
    expect(humanizeDocType("colle")).toBe("Colle");
    expect(humanizeDocType("cours")).toBe("Cours");
    expect(humanizeDocType("concours")).toBe("Concours");
    expect(humanizeDocType("misc")).toBe("Document");
  });
});

describe("DOC_META_FIELDS — catalogue des 18 champs", () => {
  it("contient exactement les 18 champs de la spec, dans l'ordre", () => {
    expect(DOC_META_FIELDS.map((f) => f.key)).toEqual([
      "type", "centre", "ville", "filiere", "classe", "date", "creneau",
      "session", "duree", "matiere", "document", "theme", "origine",
      "auteur", "colleur", "email", "website", "preauteur",
    ]);
  });

  it("chaque champ a un libellé fr/en, type est enum avec DOC_TYPES", () => {
    for (const f of DOC_META_FIELDS) {
      expect(f.labelFr.length).toBeGreaterThan(0);
      expect(f.labelEn.length).toBeGreaterThan(0);
    }
    const type = DOC_META_FIELDS.find((f) => f.key === "type")!;
    expect(type.kind).toBe("enum");
    expect(type.values).toEqual(DOC_TYPES);
    expect(DOC_META_FIELDS.find((f) => f.key === "date")?.kind).toBe("date");
    expect(DOC_META_FIELDS.filter((f) => f.kind === "text").length).toBe(16);
  });
});

describe("parseMetaYaml", () => {
  it("scalaires → String (nombre, booléen, chaîne)", () => {
    expect(parseMetaYaml("matiere: Maths\nduree: 2\nnote: 15.5\npublie: true"))
      .toEqual({ matiere: "Maths", duree: "2", note: "15.5", publie: "true" });
  });

  it("tableaux → joint par « · » ; objets ignorés ; null ignorés", () => {
    expect(parseMetaYaml("chapitres:\n  - suites\n  - limites\nnotes:\n  rub1: 5\nvide: ~"))
      .toEqual({ chapitres: "suites · limites" });
  });

  it("{} si vide, invalide ou non-objet", () => {
    expect(parseMetaYaml("")).toEqual({});
    expect(parseMetaYaml("   \n  ")).toEqual({});
    expect(parseMetaYaml("::::: pas du yaml :::::")).toEqual({});
    expect(parseMetaYaml("- un\n- tableau")).toEqual({});
    expect(parseMetaYaml("une simple chaîne")).toEqual({});
  });

  it("clés libres hors catalogue préservées (le catalogue n'est pas une restriction)", () => {
    expect(parseMetaYaml("couleur tableau: rouge\nbarème spécial: 42"))
      .toEqual({ "couleur tableau": "rouge", "barème spécial": "42" });
  });
});

describe("parseMetaFence", () => {
  const yaml = "type: cours\nmatiere: Maths\ncentre: Al Khawarizmi";

  it("```meta parse le YAML et normalise le type", () => {
    const f: ParsedMetaFence = parseMetaFence("meta", yaml);
    expect(f.lang).toBe("meta");
    expect(f.meta).toEqual({ type: "cours", matiere: "Maths", centre: "Al Khawarizmi" });
    expect(f.type).toBe("cours");
    expect(f.content).toBe(yaml);
  });

  it("```colle = spécialisation : type FORCÉ à colle même si le YAML dit cours", () => {
    const f: ParsedMetaFence = parseMetaFence("colle", yaml);
    expect(f.lang).toBe("colle");
    expect(f.meta).toEqual({ type: "colle", matiere: "Maths", centre: "Al Khawarizmi" });
    expect(f.type).toBe("colle");
  });

  it("```colle sans type YAML → type colle", () => {
    expect(parseMetaFence("colle", "matiere: Maths").type).toBe("colle");
  });

  it("```meta sans type YAML → type misc (repli)", () => {
    expect(parseMetaFence("meta", "matiere: Maths").type).toBe("misc");
  });

  it("type hors enum replié sur misc pour ```meta, colle pour ```colle", () => {
    expect(parseMetaFence("meta", "type: polycopie").type).toBe("misc");
    expect(parseMetaFence("colle", "type: polycopie").type).toBe("colle");
  });

  it("isColleMetaFence : true pour colle explicite, false pour cours/misc", () => {
    expect(isColleMetaFence(parseMetaFence("colle", "matiere: Maths"))).toBe(true);
    expect(isColleMetaFence(parseMetaFence("meta", "type: colle"))).toBe(true);
    expect(isColleMetaFence(parseMetaFence("meta", "type: cours"))).toBe(false);
    expect(isColleMetaFence(parseMetaFence("meta", "matiere: Maths"))).toBe(false);
  });
});
