import { describe, expect, test } from "bun:test";

import {
  shiftRangesToSource,
  unshiftTransclusionLine,
} from "../src/markdown/transclusion-lines";

describe("unshiftTransclusionLine", () => {
  test("aucun range → ligne inchangée", () => {
    expect(unshiftTransclusionLine(7, [])).toBe(7);
  });

  test("ligne au-dessus du premier range → inchangée", () => {
    const ranges = [{ startLine: 10, endLine: 30 }];
    expect(unshiftTransclusionLine(3, ranges)).toBe(3);
  });

  test("ligne à l'intérieur d'un range → inchangée (contenu transclus, géré séparément)", () => {
    const ranges = [{ startLine: 10, endLine: 30 }];
    expect(unshiftTransclusionLine(15, ranges)).toBe(15);
  });

  test("bloc hôte juste après une expansion de 20 lignes → décalé de 19", () => {
    // Le marqueur ![[…]] occupe 1 ligne (10), l'expansion 20 lignes → [10, 30).
    const ranges = [{ startLine: 10, endLine: 30 }];
    expect(unshiftTransclusionLine(30, ranges)).toBe(11);
    expect(unshiftTransclusionLine(31, ranges)).toBe(12);
  });

  test("bloc hôte à la limite : range qui se TERMINE exactement à la ligne → compté", () => {
    const ranges = [{ startLine: 10, endLine: 30 }];
    // endLine = 30 <= 30 → l'expansion est complète avant ce bloc.
    expect(unshiftTransclusionLine(30, ranges)).toBe(11);
  });

  test("deux expansions séquentielles → décalage cumulé", () => {
    const ranges = [
      { startLine: 10, endLine: 30 },  // +19
      { startLine: 35, endLine: 40 },  // +4
    ];
    // Bloc entre les deux : seule la première expansion compte.
    expect(unshiftTransclusionLine(32, ranges)).toBe(13);
    // Bloc après la deuxième : les deux comptent.
    expect(unshiftTransclusionLine(40, ranges)).toBe(17);
    expect(unshiftTransclusionLine(41, ranges)).toBe(18);
  });

  test("expansion d'une seule ligne (contenu sans newline) → pas de décalage", () => {
    const ranges = [{ startLine: 5, endLine: 6 }];
    expect(unshiftTransclusionLine(6, ranges)).toBe(6);
  });

  test("ligne négative impossible mais sûr", () => {
    expect(unshiftTransclusionLine(-1, [{ startLine: 0, endLine: 5 }])).toBe(-1);
  });
});

describe("shiftRangesToSource", () => {
  test("fmOffset nul → identité", () => {
    const ranges = [{ startLine: 2, endLine: 8 }];
    expect(shiftRangesToSource(ranges, 0)).toBe(ranges);
    expect(ranges).toEqual([{ startLine: 2, endLine: 8 }]);
  });

  test("fmOffset non nul → ranges décalés dans les deux bornes (mutation)", () => {
    const ranges = [
      { startLine: 2, endLine: 8 },
      { startLine: 10, endLine: 12 },
    ];
    shiftRangesToSource(ranges, 3);
    expect(ranges).toEqual([
      { startLine: 5, endLine: 11 },
      { startLine: 13, endLine: 15 },
    ]);
  });
});
