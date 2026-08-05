import { describe, expect, test } from "bun:test";

import {
  filterSelf,
  fromFileUri,
  groupBacklinks,
  normPath,
  parseLocations,
  sortRefs,
  toFileUri,
  type BacklinkRef,
} from "../src/lib/lsp/backlinks";

const NOTE = "/vault/notes/alglin.md";

describe("toFileUri / fromFileUri", () => {
  test("encode les espaces et accents (protocole LSP)", () => {
    const uri = toFileUri("/vault/Sémaine 01/note.md");
    expect(uri.startsWith("file://")).toBe(true);
    expect(uri).toContain("S%C3%A9maine%2001");
    // round-trip
    expect(fromFileUri(uri)).toBe("/vault/Sémaine 01/note.md");
  });

  test("round-trip sans caractères spéciaux", () => {
    const uri = toFileUri(NOTE);
    expect(uri).toBe("file://" + encodeURI(NOTE));
    expect(fromFileUri(uri)).toBe(NOTE);
  });

  test("fromFileUri tolère un chemin non-URI", () => {
    expect(fromFileUri("/vault/note.md")).toBe("/vault/note.md");
  });
});

describe("normPath", () => {
  test("normalise les backslashes windows et les segments '.'", () => {
    expect(normPath("C:\\vault\\notes\\a.md")).toBe("C:/vault/notes/a.md");
    expect(normPath("/vault/./notes/a.md")).toBe("/vault/notes/a.md");
    expect(normPath("/vault/notes/a.md")).toBe("/vault/notes/a.md");
  });
});

describe("parseLocations", () => {
  const LOC = (line: number, char: number) => ({
    uri: "file:///vault/notes/autre.md",
    range: { start: { line, character: char }, end: { line: line + 1, character: 0 } },
  });

  test("tableau → BacklinkRef[] (1-based)", () => {
    const refs = parseLocations([LOC(3, 0), LOC(12, 0)]);
    expect(refs).toEqual([
      { path: "/vault/notes/autre.md", line: 4, endLine: 5 },
      { path: "/vault/notes/autre.md", line: 13, endLine: 14 },
    ]);
  });

  test("objet unique → tableau d'un élément", () => {
    const refs = parseLocations(LOC(0, 0));
    expect(refs).toHaveLength(1);
    expect(refs[0].line).toBe(1);
  });

  test("null → []", () => {
    expect(parseLocations(null)).toEqual([]);
    expect(parseLocations(undefined as unknown as null)).toEqual([]);
  });
});

describe("filterSelf", () => {
  test("retire les références vers le fichier cible", () => {
    const refs: BacklinkRef[] = [
      { path: NOTE, line: 2, endLine: 2 },
      { path: "/vault/notes/autre.md", line: 4, endLine: 4 },
      { path: "/vault/notes/" + "alglin.md", line: 9, endLine: 9 },
    ];
    const filtered = filterSelf(refs, NOTE);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].path).toBe("/vault/notes/autre.md");
  });
});

describe("sortRefs / groupBacklinks", () => {
  test("trie par chemin puis par ligne", () => {
    const refs: BacklinkRef[] = [
      { path: "/vault/b.md", line: 5, endLine: 5 },
      { path: "/vault/a.md", line: 9, endLine: 9 },
      { path: "/vault/a.md", line: 2, endLine: 2 },
    ];
    const sorted = sortRefs(refs);
    expect(sorted.map((r) => `${r.path}:${r.line}`)).toEqual([
      "/vault/a.md:2",
      "/vault/a.md:9",
      "/vault/b.md:5",
    ]);
  });

  test("groupe par fichier dans l'ordre", () => {
    const refs: BacklinkRef[] = [
      { path: "/vault/b.md", line: 5, endLine: 5 },
      { path: "/vault/a.md", line: 9, endLine: 9 },
      { path: "/vault/a.md", line: 2, endLine: 2 },
    ];
    const groups = groupBacklinks(refs);
    expect(groups.map((g) => g.path)).toEqual(["/vault/a.md", "/vault/b.md"]);
    expect(groups[0].refs.map((r) => r.line)).toEqual([2, 9]);
    expect(groups[1].refs.map((r) => r.line)).toEqual([5]);
  });

  test("groupe vide → []", () => {
    expect(groupBacklinks([])).toEqual([]);
  });
});
