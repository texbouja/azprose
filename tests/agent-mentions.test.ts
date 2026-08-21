/**
 * Tests des mentions @fichier — détection au curseur, extraction pour
 * l'envoi, filtrage de complétion. Module pur : aucun montage nécessaire.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  candidatsDe,
  extraireMentions,
  filtrerParRel,
  mentionAuCurseur,
  uriFichier,
} from "../src/lib/agent/mentions";

describe("mentionAuCurseur", () => {
  test("token en cours : début de texte, après espace, requête partielle", () => {
    expect(mentionAuCurseur("@not", 4)).toEqual({ debut: 0, query: "not" });
    expect(mentionAuCurseur("bonjour @note", 13)).toEqual({ debut: 8, query: "note" });
    // Curseur AU MILIEU du token : la partie avant le caret compte seule.
    expect(mentionAuCurseur("bonjour @note x", 11)).toEqual({ debut: 8, query: "no" });
  });

  test("@ fraîchement tapé → requête vide (popup ouvert sur les premiers fichiers)", () => {
    expect(mentionAuCurseur("regarde @", 9)).toEqual({ debut: 8, query: "" });
    expect(mentionAuCurseur("@", 1)).toEqual({ debut: 0, query: "" });
  });

  test("un a@b est une adresse, pas une mention ; texte sans @ → null", () => {
    expect(mentionAuCurseur("écris à a@b.c", 13)).toBe(null);
    expect(mentionAuCurseur("aucune mention ici", 18)).toBe(null);
  });

  test("caret hors du token (après un blanc suivant) → null", () => {
    expect(mentionAuCurseur("@note ", 6)).toBe(null);
  });

  test("caret borné : hors chaîne ou négatif ne plantent pas", () => {
    expect(mentionAuCurseur("@a", 50)).toEqual({ debut: 0, query: "a" });
    expect(mentionAuCurseur("@a", -3)).toBe(null);
  });
});

describe("extraireMentions", () => {
  test("plusieurs mentions, positions exactes (@ inclus)", () => {
    const texte = "compare @notes/a.md et @docs/b.md";
    expect(extraireMentions(texte)).toEqual([
      { chemin: "notes/a.md", debut: 8, fin: 19 },
      { chemin: "docs/b.md", debut: 23, fin: 33 },
    ]);
  });

  test("adresses électroniques ignorées", () => {
    expect(extraireMentions("écris à a@b.c")).toEqual([]);
  });

  test("mentions collées en début + séparées d'un seul blanc", () => {
    expect(extraireMentions("@a.md @b.md")).toEqual([
      { chemin: "a.md", debut: 0, fin: 5 },
      { chemin: "b.md", debut: 6, fin: 11 },
    ]);
  });
});

const FICHIERS = [
  { name: "zeta.md", path: "/v/zeta.md", rel: "zeta.md" },
  { name: "a.md", path: "/v/docs/a.md", rel: "docs/a.md" },
  { name: "ab.tex", path: "/v/docs/ab.tex", rel: "docs/ab.tex" },
];

describe("filtrerParRel", () => {
  test("sous-chaîne insensible à la casse sur le chemin relatif", () => {
    // « docs/a » matche a.md ET ab.tex : sous-chaîne, pas de fuzzy.
    expect(filtrerParRel(FICHIERS, "DOCS/A").map((f) => f.rel)).toEqual([
      "docs/a.md",
      "docs/ab.tex",
    ]);
  });

  test("requête vide = premiers éléments (tri amont conservé)", () => {
    expect(filtrerParRel(FICHIERS, "").map((f) => f.rel)).toEqual([
      "zeta.md",
      "docs/a.md",
      "docs/ab.tex",
    ]);
  });

  test("plafond du popup", () => {
    expect(filtrerParRel(FICHIERS, "", 2)).toHaveLength(2);
  });
});

describe("candidatsDe — dossiers dérivés des fichiers", () => {
  test("dossiers imbriqués uniques avec « / » final, triés avant leurs enfants", () => {
    const cands = candidatsDe([
      { name: "a.md", path: "/v/docs/cours/a.md", rel: "docs/cours/a.md" },
      { name: "b.md", path: "/v/docs/b.md", rel: "docs/b.md" },
      { name: "z.md", path: "/v/z.md", rel: "z.md" },
    ]);
    // Tri par insertion : chaque dossier précède ses DESCENDANTS
    // (« / » final < tout caractère), mais un frère plus court dans
    // l'ordre alphabétique peut s'intercaler (« b » < « c »).
    expect(cands.map((c) => c.insertion)).toEqual([
      "docs/",
      "docs/b.md",
      "docs/cours/",
      "docs/cours/a.md",
      "z.md",
    ]);
    const dossiers = cands.filter((c) => c.dossier);
    expect(dossiers.map((d) => [d.nom, d.rel])).toEqual([
      ["docs", "docs/"],
      ["cours", "docs/cours/"],
    ]);
  });

  test("aucun doublon quand plusieurs fichiers partagent un dossier ; coffre plat = aucun dossier", () => {
    const plat = candidatsDe([
      { name: "a.md", path: "/v/a.md", rel: "a.md" },
      { name: "b.md", path: "/v/b.md", rel: "b.md" },
    ]);
    expect(plat.every((c) => !c.dossier)).toBe(true);
    const deux = candidatsDe([
      { name: "a.md", path: "/v/d/a.md", rel: "d/a.md" },
      { name: "b.md", path: "/v/d/b.md", rel: "d/b.md" },
    ]);
    expect(deux.filter((c) => c.dossier)).toHaveLength(1);
  });

  test("coffre vide → liste vide", () => {
    expect(candidatsDe([])).toEqual([]);
  });
});

describe("uriFichier", () => {
  test("chemin absolu POSIX direct, chemin Windows slashé", () => {
    expect(uriFichier("/vault/note.md")).toBe("file:///vault/note.md");
    expect(uriFichier("C:\\vault\\note.md")).toBe("file:///C:/vault/note.md");
  });
});
