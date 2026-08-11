/**
 * Métadonnées de document (doc-meta.ts) — module PUR.
 *
 * Contrat testé :
 *  - ```` ```meta ```` est le fence officiel ; ```` ```colle ```` = SPÉCIALISATION
 *    (type forcé "colle" — le nom du fence est autoritaire, il prime sur le YAML) ;
 *  - type : enum restreint à DOC_TYPES (9 valeurs dont banque), valeur hors
 *    liste repliée sur "misc" ; `type` est un commutateur LOGIQUE : jamais
 *    affichable (displayYamlValue ne le concerne pas, les gabarits l'excluent) ;
 *    AUCUN type n'a de privilège : docTypeSwitches expose un commutateur
 *    is<Type> PAR TYPE (tous false, celui chargé à true — la vue colles lit
 *    .isColle, une future vue banque lira .isBanque) ;
 *  - parseYamlMap : parser YAML UNIFIÉ (vue structurée : booléens, tableaux,
 *    objets, dates ISO → chaîne) ; repli tolérant ligne à ligne si invalide ;
 *  - displayYamlValue : règle d'affichage UNIQUE (scalaire → String, \n →
 *    espaces ; tableau → « · » ; objet → null ; true → "true" ; false/null → null) ;
 *  - parseMetaYaml : vue plate (compat) = flattenYamlMap(parseYamlMap(src)) ;
 *  - catalogue DOC_META_FIELDS : 21 champs documentés pour l'UI (non
 *    prioritaire), le parser n'est PAS restreint par le catalogue ;
 *  - DOC_FIELD_LABELS : registre unique des libellés d'en-tête (19 entrées,
 *    matiere en tête) ; DOC_TYPE_LABELS/DOC_TYPE_HINTS : registres d'AFFICHAGE
 *    (badge, conseil d'en-tête) — mécanisme uniforme, jamais un privilège.
 */
import {
  DOC_FIELD_LABELS,
  DOC_META_FIELDS,
  DOC_TYPES,
  DOC_TYPE_HINTS,
  DOC_TYPE_LABELS,
  displayYamlValue,
  docTypeSwitches,
  flattenYamlMap,
  humanizeDocType,
  isDocType,
  normalizeDocType,
  parseMetaFence,
  parseMetaYaml,
  parseYamlMap,
  type DocType,
  type DocTypeSwitch,
  type DocTypeSwitches,
  type ParsedMetaFence,
} from "@/lib/doc-meta";

describe("DOC_TYPES / normalizeDocType", () => {
  it("enum des 9 types : cours, exercices, banque, devoir, note, colle, concours, rapport, misc", () => {
    expect(DOC_TYPES).toEqual([
      "cours", "exercices", "banque", "devoir", "note", "colle", "concours", "rapport", "misc",
    ]);
  });

  it("isDocType accepte l'enum (dont banque), rejette le reste", () => {
    expect(isDocType("colle")).toBe(true);
    expect(isDocType("cours")).toBe(true);
    expect(isDocType("banque")).toBe(true);
    expect(isDocType("rapport")).toBe(true);
    expect(isDocType("polycopie")).toBe(false);
    expect(isDocType(3)).toBe(false);
  });

  it("normalizeDocType replie toute valeur hors enum sur misc", () => {
    expect(normalizeDocType("exercices")).toBe("exercices");
    expect(normalizeDocType("banque")).toBe("banque");
    expect(normalizeDocType("polycopie")).toBe("misc");
    expect(normalizeDocType(undefined)).toBe("misc");
    expect(normalizeDocType("")).toBe("misc");
  });

  it("humanizeDocType donne un libellé lisible (misc → Document)", () => {
    expect(humanizeDocType("colle")).toBe("Colle");
    expect(humanizeDocType("cours")).toBe("Cours");
    expect(humanizeDocType("concours")).toBe("Concours");
    expect(humanizeDocType("banque")).toBe("Banque");
    expect(humanizeDocType("exercices")).toBe("Exercices");
    expect(humanizeDocType("misc")).toBe("Document");
  });
});

describe("docTypeSwitches — un commutateur par type, un seul actif", () => {
  it("couvre exactement les 9 types, tous false sauf le chargé à true", () => {
    const s: DocTypeSwitches = docTypeSwitches("banque");
    expect(Object.keys(s).sort()).toEqual(
      DOC_TYPES.map((t) => `is${t[0].toUpperCase()}${t.slice(1)}` as DocTypeSwitch).sort(),
    );
    for (const t of DOC_TYPES) {
      const loaded = docTypeSwitches(t);
      const on = Object.entries(loaded).filter(([, v]) => v);
      expect(on).toHaveLength(1);
      expect(on[0][0]).toBe(`is${t[0].toUpperCase()}${t.slice(1)}`);
    }
  });

  it("isColle n'a AUCUN privilège : seule la charge colle l'active", () => {
    expect(docTypeSwitches("colle").isColle).toBe(true);
    expect(docTypeSwitches("banque").isColle).toBe(false);
    expect(docTypeSwitches("cours").isColle).toBe(false);
    expect(docTypeSwitches("misc").isColle).toBe(false);
  });

  it("isBanque est le commutateur de la banque d'exercices", () => {
    expect(docTypeSwitches("banque").isBanque).toBe(true);
    expect(docTypeSwitches("exercices").isBanque).toBe(false);
    expect(docTypeSwitches("colle").isBanque).toBe(false);
  });
});

describe("DOC_TYPE_LABELS / DOC_TYPE_HINTS — registres d'affichage (sans privilège)", () => {
  it("labels : un libellé non vide par type, misc → Document, banque → Banque", () => {
    expect(Object.keys(DOC_TYPE_LABELS).sort()).toEqual([...DOC_TYPES].sort());
    for (const t of DOC_TYPES) {
      expect(DOC_TYPE_LABELS[t].length).toBeGreaterThan(0);
    }
    expect(DOC_TYPE_LABELS.banque).toBe("Banque");
    expect(DOC_TYPE_LABELS.misc).toBe("Document");
  });

  it("hints : colle porte un conseil d'en-tête, les autres types aucun", () => {
    expect(Object.keys(DOC_TYPE_HINTS).sort()).toEqual([...DOC_TYPES].sort());
    expect(DOC_TYPE_HINTS.colle).toContain("Colles");
    for (const t of DOC_TYPES) {
      if (t !== "colle") expect(DOC_TYPE_HINTS[t]).toBe("");
    }
  });
});

describe("DOC_META_FIELDS — catalogue des 21 champs", () => {
  it("contient exactement les 21 champs de la spec, dans l'ordre", () => {
    expect(DOC_META_FIELDS.map((f) => f.key)).toEqual([
      "type", "centre", "ville", "filiere", "classe", "date", "creneau",
      "session", "duree", "matiere", "document", "theme", "origine",
      "auteur", "colleur", "email", "website", "preauteur",
      "eleve", "salle", "groupe",
    ]);
  });

  it("chaque champ a un libellé fr/en, type est enum avec DOC_TYPES, date est date", () => {
    for (const f of DOC_META_FIELDS) {
      expect(f.labelFr.length).toBeGreaterThan(0);
      expect(f.labelEn.length).toBeGreaterThan(0);
    }
    const type = DOC_META_FIELDS.find((f) => f.key === "type")!;
    expect(type.kind).toBe("enum");
    expect(type.values).toEqual(DOC_TYPES);
    expect(DOC_META_FIELDS.find((f) => f.key === "date")?.kind).toBe("date");
    expect(DOC_META_FIELDS.filter((f) => f.kind === "text").length).toBe(19);
  });
});

describe("DOC_FIELD_LABELS — registre unique des libellés d'en-tête", () => {
  it("19 entrées, matiere en tête, colleur/eleve avant la date", () => {
    expect(DOC_FIELD_LABELS.length).toBe(19);
    expect(DOC_FIELD_LABELS[0]).toEqual(["matiere", "Matière"]);
    expect(DOC_FIELD_LABELS.map(([k]) => k)).toContain("colleur");
    expect(DOC_FIELD_LABELS.map(([k]) => k)).toContain("eleve");
    expect(DOC_FIELD_LABELS.map(([k]) => k)).toContain("groupe");
    expect(DOC_FIELD_LABELS.map(([k]) => k)).toContain("salle");
    // chaque clé du catalogue (hors type et hors preauteur) a un libellé
    // d'en-tête : preauteur est un champ de gabarit d'impression (« Pr. »),
    // jamais affiché dans la carte d'en-tête.
    for (const f of DOC_META_FIELDS) {
      if (f.key === "type" || f.key === "preauteur") continue;
      expect(DOC_FIELD_LABELS.some(([k]) => k === f.key)).toBe(true);
    }
  });
});

describe("parseYamlMap — parser unifié structuré", () => {
  it("préserve les types : booléens, nombres, dates ISO en chaîne, null", () => {
    const m = parseYamlMap("publie: true\nabsent: false\nnote: 15.5\ndate: 2025-09-01\nvide: ~");
    expect(m).toEqual({
      publie: true,
      absent: false,
      note: 15.5,
      date: "2025-09-01",
      vide: null,
    });
  });

  it("tableaux et objets STRUCTURÉS (non aplatis)", () => {
    const m = parseYamlMap("chapitres:\n  - suites\n  - limites\nnotes:\n  rub1: 5");
    expect(m.chapitres).toEqual(["suites", "limites"]);
    expect(m.notes).toEqual({ rub1: 5 });
  });

  it("{} si vide, invalide, non-objet ou tableau racine", () => {
    expect(parseYamlMap("")).toEqual({});
    expect(parseYamlMap("   \n  ")).toEqual({});
    expect(parseYamlMap("::::: pas du yaml :::::")).toEqual({});
    expect(parseYamlMap("- un\n- tableau")).toEqual({});
  });

  it("repli tolérant ligne à ligne quand le YAML est invalide (historique)", () => {
    expect(parseYamlMap("matiere: Maths\ncentre: \"Al K\"\nnote: 12\n  indented: x"))
      .toEqual({ matiere: "Maths", centre: "Al K", note: "12", indented: "x" });
  });
});

describe("displayYamlValue — règle d'affichage unique", () => {
  it("scalaire → String, sauts de ligne → espaces", () => {
    expect(displayYamlValue("Maths")?.value).toBe("Maths");
    expect(displayYamlValue(15.5)?.value).toBe("15.5");
    expect(displayYamlValue("a\nb")?.value).toBe("a b");
  });

  it("true → « true » ; false → null (invisible)", () => {
    expect(displayYamlValue(true)?.value).toBe("true");
    expect(displayYamlValue(false)).toBeNull();
  });

  it("tableau → joint « · » ; objet → null ; absent/null → null", () => {
    expect(displayYamlValue(["suites", "limites"])?.value).toBe("suites · limites");
    expect(displayYamlValue(["a", null, "b"])?.value).toBe("a · b");
    expect(displayYamlValue({ rub1: 5 })).toBeNull();
    expect(displayYamlValue(null)).toBeNull();
    expect(displayYamlValue(undefined)).toBeNull();
  });
});

describe("flattenYamlMap / parseMetaYaml (vue plate, compat)", () => {
  it("scalaires → String (nombre, booléen, chaîne)", () => {
    expect(parseMetaYaml("matiere: Maths\nduree: 2\nnote: 15.5\npublie: true"))
      .toEqual({ matiere: "Maths", duree: "2", note: "15.5", publie: "true" });
  });

  it("tableaux → joint par « · » ; objets ignorés ; false/null ignorés", () => {
    expect(parseMetaYaml("chapitres:\n  - suites\n  - limites\nnotes:\n  rub1: 5\nabsent: false\nvide: ~"))
      .toEqual({ chapitres: "suites · limites" });
  });

  it("{} si vide, invalide ou non-objet", () => {
    expect(parseMetaYaml("")).toEqual({});
    expect(parseMetaYaml("::::: pas du yaml :::::")).toEqual({});
    expect(parseMetaYaml("- un\n- tableau")).toEqual({});
  });

  it("clés libres hors catalogue préservées (le catalogue n'est pas une restriction)", () => {
    expect(parseMetaYaml("couleur tableau: rouge\nbarème spécial: 42"))
      .toEqual({ "couleur tableau": "rouge", "barème spécial": "42" });
  });

  it("flattenYamlMap == parseMetaYaml (même règle d'affichage)", () => {
    const src = "matiere: Maths\npublie: true\nchapitres:\n  - suites\n  - limites";
    expect(flattenYamlMap(parseYamlMap(src))).toEqual(parseMetaYaml(src));
  });
});

describe("parseMetaFence", () => {
  const yaml = "type: cours\nmatiere: Maths\ncentre: Al Khawarizmi";

  it("```meta parse le YAML (vues plate + structurée) et normalise le type", () => {
    const f: ParsedMetaFence = parseMetaFence("meta", yaml);
    expect(f.meta).toEqual({ type: "cours", matiere: "Maths", centre: "Al Khawarizmi" });
    expect(f.values).toEqual({ type: "cours", matiere: "Maths", centre: "Al Khawarizmi" });
    expect(f.type).toBe("cours");
    expect(f.content).toBe(yaml);
  });

  it("```colle = spécialisation : type FORCÉ à colle même si le YAML dit cours", () => {
    const f: ParsedMetaFence = parseMetaFence("colle", yaml);
    expect(f.meta).toEqual({ type: "colle", matiere: "Maths", centre: "Al Khawarizmi" });
    expect(f.values).toEqual({ type: "colle", matiere: "Maths", centre: "Al Khawarizmi" });
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

  it("la spécialisation colle se lit via .type === \"colle\" (isColleMetaFence supprimé)", () => {
    expect(parseMetaFence("colle", "matiere: Maths").type === "colle").toBe(true);
    expect(parseMetaFence("meta", "type: colle").type === "colle").toBe(true);
    expect(parseMetaFence("meta", "type: cours").type === "colle").toBe(false);
    expect(parseMetaFence("meta", "matiere: Maths").type === "colle").toBe(false);
  });
});
