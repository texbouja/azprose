/**
 * Tests des mentions @fichier — détection au curseur, extraction pour
 * l'envoi, filtrage de complétion. Module pur : aucun montage nécessaire.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  extraireMentions,
  filtrerFichiers,
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

describe("filtrerFichiers", () => {
  test("sous-chaîne insensible à la casse sur le chemin relatif", () => {
    // « docs/a » matche a.md ET ab.tex : sous-chaîne, pas de fuzzy.
    expect(filtrerFichiers(FICHIERS, "DOCS/A").map((f) => f.rel)).toEqual([
      "docs/a.md",
      "docs/ab.tex",
    ]);
  });

  test("requête vide = premiers fichiers (tri amont conservé)", () => {
    expect(filtrerFichiers(FICHIERS, "").map((f) => f.rel)).toEqual([
      "zeta.md",
      "docs/a.md",
      "docs/ab.tex",
    ]);
  });

  test("plafond du popup", () => {
    expect(filtrerFichiers(FICHIERS, "", 2)).toHaveLength(2);
  });
});

describe("uriFichier", () => {
  test("chemin absolu POSIX direct, chemin Windows slashé", () => {
    expect(uriFichier("/vault/note.md")).toBe("file:///vault/note.md");
    expect(uriFichier("C:\\vault\\note.md")).toBe("file:///C:/vault/note.md");
  });
});
