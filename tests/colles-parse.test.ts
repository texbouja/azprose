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
} from "../src/colles/parse";
import { writeBackColleKeys } from "../src/colles/write-back";
import type { ColleMeta } from "../src/colles/types";

const SAMPLE = `---
title: Daily note 2026-08-02
date: 2026-08-02
---

# Journal du jour

Du contenu normal de la daily note, sans colle.

---

---

\`\`\`colle
matiere: "Maths"
colleur: "M. Dupont"
eleve: "Alice"
date: "2026-08-03"
creneaux:
  - "09:00-10:00"
  - "10:00-11:00"
salle: "B204"
\`\`\`

## Exercice 1 — Séries numériques

Convergence de la série $\\sum 1/n^2$.

![[fiche-geometrie]]

---

\`\`\`colle
matiere: "Physique"
colleur: "Mme Martin"
eleve: "Bob"
date: "2026-08-03"
creneaux:
  - "14:00-15:00"
salle: "B205"
\`\`\`

## Questions de cours

La relativité du temps.
`;

describe("parseColleYaml", () => {
  test("parse les métadonnées de base", () => {
    const meta = parseColleYaml(`matiere: "Maths"\ncolleur: "M. Dupont"\neleve: "Alice"\nsalle: "B204"`);
    expect(meta.matiere).toBe("Maths");
    expect(meta.colleur).toBe("M. Dupont");
    expect(meta.salle).toBe("B204");
  });

  test("parse une liste de créneaux", () => {
    const meta = parseColleYaml(`creneaux:\n  - "09:00-10:00"\n  - "10:00-11:00"`);
    expect(meta.creneaux).toEqual(["09:00-10:00", "10:00-11:00"]);
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
  test("trouve le double ---", () => {
    const lines = ["a", "b", "---", "---", "```colle", "x"];
    expect(findFichesSection(lines)).toBe(4);
  });

  test("ignore un --- simple isolé", () => {
    const lines = ["a", "---", "b", "---", "c"];
    expect(findFichesSection(lines)).toBe(-1);
  });

  test("-1 sans section", () => {
    expect(findFichesSection(["a", "b"])).toBe(-1);
    expect(findFichesSection([])).toBe(-1);
  });

  test("le front matter n'est pas confondu avec le marqueur", () => {
    const lines = ["---", "title: x", "---", "a", "---", "---", "b"];
    // le front matter a des lignes YAML entre les deux ---
    expect(findFichesSection(lines)).toBe(6);
  });

  test("tolère une ligne vide entre les deux ---", () => {
    const lines = ["a", "---", "", "---", "```colle"];
    expect(findFichesSection(lines)).toBe(4);
  });
  test("tolère les espaces autour du --- (CommonMark)", () => {
    expect(findFichesSection(["a", "--- ", "---", "```colle"])).toBe(3);
    expect(findFichesSection(["a", "---", " ---", "```colle"])).toBe(3);
    expect(findFichesSection(["a", "--- ", "", " ---", "```colle"])).toBe(4);
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
    expect(p1.meta.colleur).toBe("M. Dupont");
    expect(p1.meta.eleve).toBe("Alice");
    expect(p1.meta.creneaux).toEqual(["09:00-10:00", "10:00-11:00"]);
    expect(p1.bodySource).toContain("## Exercice 1 — Séries numériques");
    expect(p1.bodySource).toContain("Convergence");
    expect(p1.bodySource).toContain("![[fiche-geometrie]]");
    // le corps s'arrête au --- suivant (pas de contenu de la planche 2 dedans)
    expect(p1.bodySource).not.toContain("Mme Martin");
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

  test("planche sans fence dans la section est ignorée", () => {
    const src = ["a", "---", "---", "texte orphelin", "```colle", "matiere: X", "```", "corps"].join("\n");
    const section = parsePlanches(src);
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
  test("vide le double --- d'annonce et les --- séparateurs, pas les autres", () => {
    const src = [
      "# Journal",
      "",
      "---", // légitime (hors section, séparé du marqueur par du contenu) → conservé
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
    ].join("\n");
    const out = stripColleSeparators(src);
    const lines = out.split("\n");
    expect(lines[2]).toBe("---"); // conservé (hors section)
    expect(lines[6]).toBe(""); // 1er --- d'annonce vidé
    expect(lines[7]).toBe(""); // 2e --- d'annonce vidé
    expect(lines[12]).toBe(""); // séparateur de planches vidé
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

  test("no-op sans section (--- simple uniquement)", () => {
    const src = ["a", "---", "```colle", "x", "```"].join("\n");
    expect(stripColleSeparators(src)).toBe(src);
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
    const src = ["---", "---", "```colle", "matiere: X", "```", "corps", "--- ", "```colle", "matiere: Y", "```", "corps2"].join("\n");
    const out = stripColleSeparators(src);
    const lines = out.split("\n");
    expect(lines[0]).toBe(""); // 1er --- d'annonce
    expect(lines[1]).toBe(""); // 2e --- d'annonce
    expect(lines[6]).toBe(""); // séparateur "--- " vidé
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
    expect(re.planches[0].meta.eleve).toBe("Alice");
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
});
