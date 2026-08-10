import { describe, expect, test } from "bun:test";
import {
  findFichesSection,
  parseColleYaml,
  parsePlanches,
  splitPlanches,
  stripColleSeparators,
  isHrLine,
  isFenceOpen,
  isFenceClose,
  creneauKey,
  sameCreneau,
} from "../src/colles/parse";
import { writeBackColleKeys } from "../src/colles/write-back";
import { matiereKey, rubriquesFor, sumMaxScore, sumNotes } from "../src/colles/rubrics";
import { normalizeCollesSettings, colloscopeTableName } from "../src/colles/settings-model";
import { DEFAULT_REPORT_LAYOUT } from "../src/printing/colle/layout";
import type { ColleMeta, RubriquesParMatiere } from "../src/colles/types";

const SAMPLE = `---
title: Daily note 2026-08-02
date: 2026-08-02
---

# Journal du jour

Du contenu normal de la daily note, sans colle.

\`\`\`colle
matiere: "Maths"
colleur: "M. El Amrani"
eleve: "Salma"
date: "2026-08-03"
creneau: "09:00-10:00"
salle: "B204"
\`\`\`

## Exercice 1 — Séries numériques

Convergence de la série $\\sum 1/n^2$.

![[fiche-geometrie]]

---

\`\`\`colle
matiere: "Physique"
colleur: "Mme Benali"
eleve: "Mehdi"
date: "2026-08-03"
creneau: "14:00-15:00"
salle: "B205"
\`\`\`

## Questions de cours

La relativité du temps.

---
`;

describe("parseColleYaml", () => {
  test("parse les métadonnées de base", () => {
    const meta = parseColleYaml(`matiere: "Maths"\ncolleur: "M. El Amrani"\neleve: "Salma"\nsalle: "B204"`);
    expect(meta.matiere).toBe("Maths");
    expect(meta.colleur).toBe("M. El Amrani");
    expect(meta.salle).toBe("B204");
  });

  test("parse un créneau simple", () => {
    const meta = parseColleYaml(`creneau: "09:00-10:00"`);
    expect(meta.creneau).toBe("09:00-10:00");
  });

  test("parse le dict notes (rubriques)", () => {
    const meta = parseColleYaml(`notes:\n  rub1: 5\n  rub2: 3`);
    expect(meta.notes).toEqual({ rub1: 5, rub2: 3 });
  });

  test("retourne {} sur contenu vide", () => {
    expect(parseColleYaml("")).toEqual({});
    expect(parseColleYaml("   \n  ")).toEqual({});
  });

  test("retourne {} sur YAML invalide ou non-objet", () => {
    expect(parseColleYaml("::::: pas du yaml :::::")).toEqual({});
    expect(parseColleYaml("- un\n- tableau")).toEqual({});
  });

  test("préserve note numérique", () => {
    const meta = parseColleYaml("matiere: Maths\nnote: 15");
    expect(meta.note).toBe(15);
  });
});

describe("findFichesSection", () => {
  test("s'ancre sur la PREMIÈRE fence, aucune disposition requise avant", () => {
    const lines = ["a", "b", "---", "---", "```colle", "x"];
    expect(findFichesSection(lines)).toBe(4);
  });

  test("ignore un --- simple isolé (pas de fence)", () => {
    const lines = ["a", "---", "b", "---", "c"];
    expect(findFichesSection(lines)).toBe(-1);
  });

  test("-1 sans section", () => {
    expect(findFichesSection(["a", "b"])).toBe(-1);
    expect(findFichesSection([])).toBe(-1);
  });

  test("le front matter n'est pas confondu avec la section", () => {
    const lines = ["---", "title: x", "---", "a", "```colle", "b"];
    // la première fence est après le front matter + le contenu
    expect(findFichesSection(lines)).toBe(4);
  });

  test("la première fence gagne, même après du contenu varié", () => {
    const lines = ["# Journal", "", "> du contenu", "```meta", "type: colle", "```", "```colle", "x"];
    expect(findFichesSection(lines)).toBe(3);
  });

  test("retourne l'index de la première fence ```meta comme ```colle", () => {
    expect(findFichesSection(["a", "```meta", "type: colle", "```"])).toBe(1);
    expect(findFichesSection(["a", "```colle", "matiere: X", "```"])).toBe(1);
  });
});

describe("isHrLine / isFenceOpen / isFenceClose", () => {
  test("--- exact", () => {
    expect(isHrLine("---")).toBe(true);
    expect(isHrLine("--")).toBe(false);
    expect(isHrLine("-")).toBe(false);
  });
  test("variantes CommonMark tolérées (markdown-it rend <hr> pour toutes)", () => {
    expect(isHrLine("----")).toBe(true);
    expect(isHrLine("--- ")).toBe(true);
    expect(isHrLine(" ---")).toBe(true);
    expect(isHrLine("  ---")).toBe(true);
    expect(isHrLine("   ---")).toBe(true);
    expect(isHrLine("----\t")).toBe(true);
    expect(isHrLine("    ---")).toBe(false); // 4 espaces = pas une ligne horizontale
    expect(isHrLine("---x")).toBe(false);
  });
  test("ouverture/fermeture de fence", () => {
    expect(isFenceOpen("```colle")).toBe(true);
    expect(isFenceOpen("```colle extra")).toBe(true);
    expect(isFenceOpen("```")).toBe(false);
    expect(isFenceClose("```")).toBe(true);
    expect(isFenceClose("```colle")).toBe(false);
  });
});

describe("parsePlanches", () => {
  test("découpe la section fiches en planches", () => {
    const section = parsePlanches(SAMPLE);
    expect(section.startLine).toBeGreaterThan(0);
    expect(section.planches).toHaveLength(2);

    const [p1, p2] = section.planches;
    expect(p1.index).toBe(0);
    expect(p1.meta.matiere).toBe("Maths");
    expect(p1.meta.colleur).toBe("M. El Amrani");
    expect(p1.meta.eleve).toBe("Salma");
    expect(p1.meta.creneau).toBe("09:00-10:00");
    expect(p1.bodySource).toContain("## Exercice 1 — Séries numériques");
    expect(p1.bodySource).toContain("Convergence");
    expect(p1.bodySource).toContain("![[fiche-geometrie]]");
    // le corps s'arrête au --- suivant (pas de contenu de la planche 2 dedans)
    expect(p1.bodySource).not.toContain("Mme Benali");
    expect(p1.bodySource).not.toContain("## Questions de cours");

    expect(p2.index).toBe(1);
    expect(p2.meta.matiere).toBe("Physique");
    expect(p2.bodySource).toContain("## Questions de cours");
    expect(p2.bodySource).toContain("relativité");
  });

  test("pas de section → aucune planche", () => {
    const section = parsePlanches("# Journal\n\nrien du tout\n");
    expect(section.startLine).toBe(-1);
    expect(section.planches).toHaveLength(0);
  });

  test("le contenu avant la première fence est hors section (ignoré)", () => {
    const src = ["a", "---", "---", "texte orphelin", "```colle", "matiere: X", "```", "corps"].join("\n");
    const section = parsePlanches(src);
    expect(section.startLine).toBe(4);
    expect(section.planches).toHaveLength(1);
    expect(section.planches[0].bodySource).toBe("corps");
  });

  test("fence mal fermé → corps vide, pas de crash", () => {
    const src = ["a", "---", "---", "```colle", "matiere: X"].join("\n");
    const section = parsePlanches(src);
    expect(section.planches).toHaveLength(1);
    expect(section.planches[0].bodySource).toBe("");
  });

  test("splitPlanches: une planche vide entre deux ---", () => {
    const lines = ["---", "---", "```colle", "matiere: A", "```", "corpsA", "---", "---", "```colle", "matiere: B", "```", "corpsB"];
    const planches = splitPlanches(lines, 2);
    expect(planches).toHaveLength(2);
    expect(planches[1].meta.matiere).toBe("B");
  });

  test("séparateur avec espaces (--- ) : le corps s'arrête avant, pas de fuite", () => {
    const src = ["a", "---", "---", "```colle", "matiere: A", "```", "corpsA", "--- ", "```colle", "matiere: B", "```", "corpsB"].join("\n");
    const section = parsePlanches(src);
    expect(section.planches).toHaveLength(2);
    expect(section.planches[0].bodySource).toBe("corpsA");
    expect(section.planches[0].bodySource).not.toContain("---");
    expect(section.planches[1].bodySource).toBe("corpsB");
  });
});

describe("stripColleSeparators", () => {
  test("vide les --- legacy d'annonce et les --- séparateurs, pas les autres", () => {
    const src = [
      "# Journal",
      "",
      "---", // légitime (hors section, séparé de la fence par du contenu) → conservé
      "",
      "contenu du journal",
      "",
      "---",
      "---",
      "```colle",
      "matiere: Maths",
      "```",
      "corps 1",
      "---",
      "```colle",
      "matiere: Physique",
      "```",
      "corps 2",
      "---",
    ].join("\n");
    const out = stripColleSeparators(src);
    const lines = out.split("\n");
    expect(lines[2]).toBe("---"); // conservé (hors section)
    expect(lines[6]).toBe(""); // repli legacy : --- avant la première fence vidé
    expect(lines[7]).toBe(""); // repli legacy : 2e --- vidé
    expect(lines[12]).toBe(""); // séparateur de planches vidé
    expect(lines[17]).toBe(""); // --- final de la dernière planche vidé
    // le contenu est intact
    expect(out).toContain("# Journal");
    expect(out).toContain("contenu du journal");
    expect(out).toContain("corps 1");
    expect(out).toContain("corps 2");
    expect(out).toContain("matiere: Maths");
  });

  test("préserve l'alignement des lignes (data-sline)", () => {
    const src = ["a", "b", "---", "---", "```colle", "matiere: X", "```", "corps"].join("\n");
    const out = stripColleSeparators(src);
    expect(out.split("\n")).toHaveLength(src.split("\n").length);
    // les lignes vides restent à la même position
    const lines = out.split("\n");
    expect(lines[0]).toBe("a");
    expect(lines[1]).toBe("b");
    expect(lines[2]).toBe("");
    expect(lines[3]).toBe("");
    expect(lines[7]).toBe("corps");
  });

  test("no-op sans fence colle", () => {
    const src = ["a", "---", "---", "b"].join("\n");
    expect(stripColleSeparators(src)).toBe(src);
  });

  test("repli legacy : le --- juste avant la première fence est vidé, le contenu plus haut est conservé", () => {
    const src = ["a", "---", "```colle", "x", "```", "corps"].join("\n");
    const out = stripColleSeparators(src);
    const lines = out.split("\n");
    expect(lines[0]).toBe("a"); // contenu au-dessus → conservé
    expect(lines[1]).toBe(""); // --- legacy vidé
    expect(lines[5]).toBe("corps");
  });

  test("préserve les --- à l'intérieur d'un fence de code", () => {
    const src = [
      "---",
      "---",
      "```colle",
      "matiere: Maths",
      "```",
      "```python",
      "---",
      "print('---')",
      "```",
      "---",
    ].join("\n");
    const out = stripColleSeparators(src);
    const lines = out.split("\n");
    expect(lines[5]).toBe("```python");
    expect(lines[6]).toBe("---"); // dans le fence → conservé
    expect(lines[7]).toBe("print('---')");
    expect(lines[9]).toBe(""); // séparateur final vidé
  });

  test("conserve les fins de ligne CRLF (--- vidé sans \\r résiduel)", () => {
    const src = ["a\r", "---\r", "---\r", "```colle\r", "matiere: X\r", "```\r", "corps\r"].join("\n");
    const out = stripColleSeparators(src);
    const lines = out.split("\n");
    expect(lines[0]).toBe("a\r");
    expect(lines[1]).toBe(""); // ---\r → vidé (pas de \r résiduel)
    expect(lines[2]).toBe("");
    expect(lines[6]).toBe("corps\r");
  });

  test("vide aussi les séparateurs avec espaces (--- ,  ---)", () => {
    const src = ["contenu", "---", "---", "```colle", "matiere: X", "```", "corps", "--- ", "```colle", "matiere: Y", "```", "corps2"].join("\n");
    const out = stripColleSeparators(src);
    const lines = out.split("\n");
    expect(lines[1]).toBe(""); // repli legacy : 1er --- d'annonce
    expect(lines[2]).toBe(""); // repli legacy : 2e --- d'annonce
    expect(lines[7]).toBe(""); // séparateur "--- " vidé
    expect(out).toContain("corps");
    expect(out).toContain("corps2");
  });
});

describe("writeBackColleKeys", () => {
  test("ajoute note + observations en préservant le reste", () => {
    const out = writeBackColleKeys(SAMPLE, 0, { note: 15, observations: "Bien préparée." });
    expect(out).not.toBe(SAMPLE);
    const re = parsePlanches(out);
    expect(re.planches).toHaveLength(2);
    expect(re.planches[0].meta.note).toBe(15);
    expect(re.planches[0].meta.observations).toBe("Bien préparée.");
    expect(re.planches[0].meta.matiere).toBe("Maths");
    expect(re.planches[0].meta.eleve).toBe("Salma");
    // la planche 2 est intacte
    expect(re.planches[1].meta.note).toBeUndefined();
    expect(re.planches[1].meta.matiere).toBe("Physique");
    // le corps de la planche 1 est intact
    expect(re.planches[0].bodySource).toContain("## Exercice 1");
    // le reste du document est intact
    expect(out).toContain("# Journal du jour");
    expect(out).toContain("Du contenu normal");
  });

  test("met à jour une clé existante", () => {
    const withNote = writeBackColleKeys(SAMPLE, 0, { note: 14 });
    const out = writeBackColleKeys(withNote, 0, { note: 16 });
    const re = parsePlanches(out);
    expect(re.planches[0].meta.note).toBe(16);
  });

  test("idempotent si même valeur", () => {
    const out = writeBackColleKeys(SAMPLE, 0, { note: 15 });
    const out2 = writeBackColleKeys(out, 0, { note: 15 });
    expect(out2).toBe(out);
  });

  test("index hors limites → source inchangé", () => {
    expect(writeBackColleKeys(SAMPLE, 42, { note: 1 })).toBe(SAMPLE);
  });

  test("sans section → source inchangé", () => {
    expect(writeBackColleKeys("# rien\n", 0, { note: 1 })).toBe("# rien\n");
  });

  test("le source reparsé reste un YAML valide (round-trip)", () => {
    const out = writeBackColleKeys(SAMPLE, 0, { note: 17.5, observations: "Très bon travail." });
    const meta: ColleMeta = parseColleYaml(
      out
        .split("\n")
        .slice(parsePlanches(out).planches[0].blockStart + 1, parsePlanches(out).planches[0].blockEnd)
        .join("\n"),
    );
    expect(meta.note).toBe(17.5);
    expect(meta.observations).toBe("Très bon travail.");
  });

  test("valeur vide retire la clé (sémantique suppression)", () => {
    const withNote = writeBackColleKeys(SAMPLE, 0, { note: 15, observations: "Bien préparée." });
    const out = writeBackColleKeys(withNote, 0, { note: "", observations: null });
    expect(out).not.toBe(withNote);
    const re = parsePlanches(out);
    expect(re.planches[0].meta.note).toBeUndefined();
    expect(re.planches[0].meta.observations).toBeUndefined();
    // le reste du bloc est intact
    expect(re.planches[0].meta.matiere).toBe("Maths");
  });

  test("suppression idempotente (clé déjà absente → source inchangé)", () => {
    const out = writeBackColleKeys(SAMPLE, 0, { note: "", observations: null });
    expect(out).toBe(SAMPLE);
  });

  test("programme : écriture dans la fiche ciblée, préservation du reste, idempotence", () => {
    const out = writeBackColleKeys(SAMPLE, 0, { programme: "Intégrales impropres" });
    expect(out).not.toBe(SAMPLE);
    const re = parsePlanches(out);
    expect(re.planches[0].meta.programme).toBe("Intégrales impropres");
    // le reste du bloc et la planche 2 sont intacts
    expect(re.planches[0].meta.matiere).toBe("Maths");
    expect(re.planches[1].meta.programme).toBeUndefined();
    // idempotent : même valeur → source inchangé
    expect(writeBackColleKeys(out, 0, { programme: "Intégrales impropres" })).toBe(out);
    // effacement : null retire la clé
    const cleared = writeBackColleKeys(out, 0, { programme: null });
    const re2 = parsePlanches(cleared);
    expect(re2.planches[0].meta.programme).toBeUndefined();
  });
});

describe("writeBackColleKeys — dict notes (rubriques)", () => {
  test("écrit le dict notes et préserve le reste du bloc", () => {
    const out = writeBackColleKeys(SAMPLE, 0, { notes: { rub1: 5, rub2: 3 }, observations: "Bien." });
    expect(out).not.toBe(SAMPLE);
    const re = parsePlanches(out);
    expect(re.planches[0].meta.notes).toEqual({ rub1: 5, rub2: 3 });
    expect(re.planches[0].meta.observations).toBe("Bien.");
    expect(re.planches[0].meta.matiere).toBe("Maths");
    expect(re.planches[0].meta.creneau).toBe("09:00-10:00");
    // la planche 2 est intacte
    expect(re.planches[1].meta.notes).toBeUndefined();
  });

  test("idempotent pour un dict identique (égalité profonde)", () => {
    const out = writeBackColleKeys(SAMPLE, 0, { notes: { rub1: 5, rub2: 3 } });
    const out2 = writeBackColleKeys(out, 0, { notes: { rub1: 5, rub2: 3 } });
    expect(out2).toBe(out);
  });

  test("met à jour une rubrique existante", () => {
    const withNotes = writeBackColleKeys(SAMPLE, 0, { notes: { rub1: 5, rub2: 3 } });
    const out = writeBackColleKeys(withNotes, 0, { notes: { rub1: 4, rub2: 3 } });
    const re = parsePlanches(out);
    expect(re.planches[0].meta.notes).toEqual({ rub1: 4, rub2: 3 });
  });

  test("null retire le dict notes (sémantique suppression)", () => {
    const withNotes = writeBackColleKeys(SAMPLE, 0, { notes: { rub1: 5 } });
    const out = writeBackColleKeys(withNotes, 0, { notes: null });
    expect(out).not.toBe(withNotes);
    const re = parsePlanches(out);
    expect(re.planches[0].meta.notes).toBeUndefined();
    expect(re.planches[0].meta.matiere).toBe("Maths");
  });

  test("round-trip YAML : le dict notes reparsé reste exact", () => {
    const out = writeBackColleKeys(SAMPLE, 0, { notes: { rub1: 5, rub2: 3, rub6: 2.5 } });
    const meta: ColleMeta = parseColleYaml(
      out
        .split("\n")
        .slice(parsePlanches(out).planches[0].blockStart + 1, parsePlanches(out).planches[0].blockEnd)
        .join("\n"),
    );
    expect(meta.notes).toEqual({ rub1: 5, rub2: 3, rub6: 2.5 });
  });
});

describe("writeBackColleKeys — observations : protection YAML", () => {
  test("caractères spéciaux : round-trip fidèle (colonne, dièse, listes, quotes, LaTeX, numériques, espaces)", () => {
    const cases = [
      "colonne : deux points suivis d'espace",
      "dièse # et liste - item",
      "guillemets \"double\" et 'simple'",
      "LaTeX $\\frac{1}{2}$ et \\alpha",
      "15.5",
      "true",
      " espaces de bord ",
      "fin avec :",
      "`code` et *italique*",
    ];
    for (const obs of cases) {
      const re = parsePlanches(writeBackColleKeys(SAMPLE, 0, { observations: obs }));
      expect(re.planches[0].meta.observations).toBe(obs);
    }
  });

  test("multi-ligne : bloc scalaire verbatim (\\n, colonne, LaTeX, indentation)", () => {
    const obs = "Première ligne\nDeuxième avec : colon et $\\frac{1}{2}$\n\n  indentation conservée";
    const out = writeBackColleKeys(SAMPLE, 0, { observations: obs });
    expect(out).toContain("observations: |-");
    const re = parsePlanches(out);
    expect(re.planches[0].meta.observations).toBe(obs);
  });

  test("le contenu hostile reste une VALEUR (pas d'injection de clé YAML)", () => {
    const obs = "notes: { rub9: 20 }\nmatiere: hack\n---";
    const out = writeBackColleKeys(SAMPLE, 0, { observations: obs });
    const re = parsePlanches(out);
    expect(re.planches[0].meta.observations).toBe(obs);
    // Ni le dict notes ni la matière réels ne sont pollués par le texte.
    expect(re.planches[0].meta.notes).toBeUndefined();
    expect(re.planches[0].meta.matiere).toBe("Maths");
  });

  test("bloc YAML reparsé complet : observations multi-ligne LaTeX exactes", () => {
    const obs = "Démonstration :\n$\\frac{a}{b} = c$\nThéorème de Thalès.";
    const out = writeBackColleKeys(SAMPLE, 0, { observations: obs });
    const block = out
      .split("\n")
      .slice(parsePlanches(out).planches[0].blockStart + 1, parsePlanches(out).planches[0].blockEnd)
      .join("\n");
    const meta = parseColleYaml(block);
    expect(meta.observations).toBe(obs);
  });
});

describe("rubrics — note globale calculée (jamais stockée)", () => {
  const RUBRIQUES: RubriquesParMatiere = {
    maths: [
      { id: "rub1", label: "Maîtrise du cours", maxScore: 5 },
      { id: "rub2", label: "Chercher", maxScore: 3 },
    ],
  };

  test("sumNotes additionne les valeurs numériques", () => {
    expect(sumNotes({ rub1: 5, rub2: 3 })).toBe(8);
    expect(sumNotes({ rub1: 4.5, rub2: 0 })).toBe(4.5);
  });

  test("sumNotes ignore les valeurs non numériques et le vide", () => {
    expect(sumNotes({ rub1: 5, rub2: "—" })).toBe(5);
    expect(sumNotes({ rub1: "non" })).toBeNull();
    expect(sumNotes(undefined)).toBeNull();
    expect(sumNotes(null)).toBeNull();
    expect(sumNotes({})).toBeNull();
  });

  test("sumMaxScore somme les maxScore", () => {
    expect(sumMaxScore(RUBRIQUES.maths)).toBe(8);
    expect(sumMaxScore([])).toBe(0);
  });

  test("matiereKey normalise les valeurs YAML", () => {
    expect(matiereKey("Maths")).toBe("maths");
    expect(matiereKey("mathématiques")).toBe("maths");
    expect(matiereKey("Physique")).toBe("physique");
    expect(matiereKey("Français")).toBe("francais");
    expect(matiereKey("Anglais")).toBe("anglais");
    expect(matiereKey("Culture arabe et traduction")).toBe("cat");
    expect(matiereKey(undefined)).toBe("maths");
    expect(matiereKey("")).toBe("maths");
    expect(matiereKey("SVT")).toBe("svt");
  });

  test("rubriquesFor résout la config de la matière, défaut maths sinon", () => {
    expect(rubriquesFor("Maths", RUBRIQUES)).toHaveLength(2);
    expect(rubriquesFor("inconnu", RUBRIQUES)).toEqual(RUBRIQUES.maths);
    expect(rubriquesFor("Physique", RUBRIQUES)).toEqual(RUBRIQUES.maths); // pas configuré → défaut
  });

  test("normalizeCollesSettings comble les champs manquants (migration legacy)", () => {
    // Ancienne forme persistée (avant l'ajout de `vacances` puis de `layout`)
    // → pas de crash `undefined.vacances` et champs initialisés ([] et layout
    // par défaut complété en profondeur).
    const legacy = { dateDebut: "2026-09-01", dateFin: "", rubriques: RUBRIQUES } as any;
    expect(normalizeCollesSettings(legacy)).toEqual({
      dateDebut: "2026-09-01",
      dateFin: "",
      vacances: [],
      rubriques: RUBRIQUES,
      colloscope: null,
      layout: DEFAULT_REPORT_LAYOUT,
    });
  });

  test("normalizeCollesSettings valide le mapping colloscope importé (un tableau par classe)", () => {
    const legacy = {
      dateDebut: "2026-09-01",
      dateFin: "",
      rubriques: RUBRIQUES,
      colloscope: {
        source: "Colloscope.xlsx",
        importedAt: "2026-01-01T00:00:00Z",
        elevesSpreadsheetId: "e1",
        colloscopeSpreadsheetIds: { "MPs-1": "s1", "MP-2": "s2" },
      },
    } as any;
    const v = normalizeCollesSettings(legacy);
    expect(v.colloscope).toEqual({
      source: "Colloscope.xlsx",
      importedAt: "2026-01-01T00:00:00Z",
      elevesSpreadsheetId: "e1",
      colloscopeSpreadsheetIds: { "MPs-1": "s1", "MP-2": "s2" },
    });
    // Mapping malformé → null (pas de crash, pas de tableaux orphelins en mémoire)
    const bad = { ...legacy, colloscope: { source: 42 } } as any;
    expect(normalizeCollesSettings(bad).colloscope).toBeNull();
    // Ancien format round 7 (un seul tableau fusionné `colloscopeSpreadsheetId`)
    // → null : l'utilisateur ré-importe (mapping incompatible, tableaux legacy
    // restent en db, supprimables manuellement).
    const mergedFormat = {
      ...legacy,
      colloscope: { source: "Colloscope.xlsx", importedAt: "2026-01-01T00:00:00Z", elevesSpreadsheetId: "e1", colloscopeSpreadsheetId: "c1" },
    } as any;
    expect(normalizeCollesSettings(mergedFormat).colloscope).toBeNull();
    // Ancien format pré-round-7 (`seancesByClass`) → null aussi.
    const oldFormat = {
      ...legacy,
      colloscope: { source: "Colloscope.xlsx", importedAt: "2026-01-01T00:00:00Z", elevesSpreadsheetId: "e1", seancesByClass: { "MPs-1": "s1" } },
    } as any;
    expect(normalizeCollesSettings(oldFormat).colloscope).toBeNull();
    // Tableaux par classe invalides : array, valeurs non-string, vide → null.
    const arrayFormat = {
      ...legacy,
      colloscope: { source: "C.xlsx", importedAt: "2026-01-01T00:00:00Z", elevesSpreadsheetId: "e1", colloscopeSpreadsheetIds: ["s1", "s2"] },
    } as any;
    expect(normalizeCollesSettings(arrayFormat).colloscope).toBeNull();
    const nonStringIds = {
      ...legacy,
      colloscope: { source: "C.xlsx", importedAt: "2026-01-01T00:00:00Z", elevesSpreadsheetId: "e1", colloscopeSpreadsheetIds: { "MPs-1": 42 } },
    } as any;
    expect(normalizeCollesSettings(nonStringIds).colloscope).toBeNull();
    const emptyIds = {
      ...legacy,
      colloscope: { source: "C.xlsx", importedAt: "2026-01-01T00:00:00Z", elevesSpreadsheetId: "e1", colloscopeSpreadsheetIds: { "MPs-1": "" } },
    } as any;
    expect(normalizeCollesSettings(emptyIds).colloscope).toBeNull();
    // Les entrées invalides sont filtrées, les valides conservées.
    const partial = {
      ...legacy,
      colloscope: { source: "C.xlsx", importedAt: "2026-01-01T00:00:00Z", elevesSpreadsheetId: "e1", colloscopeSpreadsheetIds: { "MPs-1": "s1", "MP-1": 7 } },
    } as any;
    expect(normalizeCollesSettings(partial).colloscope?.colloscopeSpreadsheetIds).toEqual({ "MPs-1": "s1" });
  });

  test("colloscopeTableName construit le nom du tableau par classe", () => {
    expect(colloscopeTableName("MPs-1")).toBe("Colloscope — MPs-1");
    expect(colloscopeTableName("MP-2")).toBe("Colloscope — MP-2");
  });

  test("normalizeCollesSettings préserve les vacances existantes", () => {
    const v = normalizeCollesSettings({
      dateDebut: "2026-09-01",
      dateFin: "",
      vacances: [{ start: "2026-10-19", end: "2026-10-25" }],
      rubriques: RUBRIQUES,
    } as any);
    expect(v.vacances).toEqual([{ start: "2026-10-19", end: "2026-10-25" }]);
  });

  test("normalizeCollesSettings est idempotent", () => {
    const once = normalizeCollesSettings({
      dateDebut: "2026-09-01",
      dateFin: "2027-06-30",
      vacances: [],
      rubriques: RUBRIQUES,
    } as any);
    expect(normalizeCollesSettings(once)).toEqual(once);
  });
});

describe("creneauKey / sameCreneau — regroupement des planches d'un même créneau", () => {
  test("creneauKey = date :: creneau", () => {
    expect(creneauKey({ date: "2026-05-04", creneau: "09:00-10:00" })).toBe(
      "2026-05-04 :: 09:00-10:00",
    );
  });

  test("creneauKey replie le legacy creneaux (tableau)", () => {
    expect(
      creneauKey({ date: "2026-05-04", creneaux: ["09:00-10:00", "10:00-11:00"] } as ColleMeta),
    ).toBe("2026-05-04 :: 09:00-10:00, 10:00-11:00");
  });

  test("creneauKey retourne null si la date OU le créneau manque", () => {
    expect(creneauKey({ date: "2026-05-04" })).toBeNull();
    expect(creneauKey({ creneau: "09:00-10:00" })).toBeNull();
    expect(creneauKey({})).toBeNull();
  });

  test("sameCreneau : même date + même créneau", () => {
    const a: ColleMeta = { date: "2026-05-04", creneau: "09:00-10:00" };
    const b: ColleMeta = { date: "2026-05-04", creneau: "09:00-10:00" };
    const c: ColleMeta = { date: "2026-05-04", creneau: "10:00-11:00" };
    const d: ColleMeta = { date: "2026-05-05", creneau: "09:00-10:00" };
    expect(sameCreneau(a, b)).toBe(true);
    expect(sameCreneau(a, c)).toBe(false);
    expect(sameCreneau(a, d)).toBe(false);
  });

  test("sameCreneau : jamais de regroupement sans date ou créneau (fiable)", () => {
    const a: ColleMeta = { date: "2026-05-04" };
    const b: ColleMeta = { date: "2026-05-04" };
    const c: ColleMeta = {};
    const d: ColleMeta = {};
    expect(sameCreneau(a, b)).toBe(false);
    expect(sameCreneau(c, d)).toBe(false);
  });
});
