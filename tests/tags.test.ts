import { describe, expect, test } from "bun:test";
import {
  aggregateTags,
  fetchVaultTags,
  normalizeTag,
  parseTagSymbols,
  sortTagsByFrequency,
  SYMBOL_KIND_CONSTANT,
  type TagEntry,
} from "@/lib/lsp/tags";
import type { LspRequest } from "@/lib/lsp/backlinks";

// Helpers de construction d'un symbole LSP réaliste (kind = Constant par défaut).
function sym(
  name: string,
  uri: string,
  line: number,
  kind = SYMBOL_KIND_CONSTANT,
) {
  return {
    name,
    kind,
    location: {
      uri,
      range: { start: { line: line - 1, character: 0 }, end: { line: line - 1, character: 3 } },
    },
  };
}

describe("normalizeTag", () => {
  test("retire le # du préfixe", () => {
    expect(normalizeTag("#projet")).toBe("projet");
    expect(normalizeTag("#")).toBe("");
  });
  test("laisse un nom sans # inchangé", () => {
    expect(normalizeTag("projet")).toBe("projet");
  });
});

describe("parseTagSymbols", () => {
  test("ne garde que les symboles Constant (Variable 13 et autres exclus)", () => {
    const result = [
      sym("#projet", "file:///v/a.md", 3), // Constant → gardé
      sym("#projet", "file:///v/b.md", 1, 13), // Variable → exclu
      sym("a.md", "file:///v/a.md", 1, 1), // File → exclu
      sym("#cours", "file:///v/c.md", 7, 20), // Key → exclu
    ];
    expect(parseTagSymbols(result)).toEqual([
      { tag: "projet", path: "/v/a.md", line: 3 },
    ]);
  });

  test("normalise le nom et décale la ligne en 1-based", () => {
    expect(parseTagSymbols(sym("#algebre", "file:///v/alglin.md", 1))).toEqual([
      { tag: "algebre", path: "/v/alglin.md", line: 1 },
    ]);
  });

  test("gère null, un seul symbole et un tableau vide", () => {
    expect(parseTagSymbols(null)).toEqual([]);
    expect(parseTagSymbols(sym("#x", "file:///v/x.md", 2))).toHaveLength(1);
    expect(parseTagSymbols([])).toEqual([]);
  });

  test("ignore un nom normalisé vide (seul un #)", () => {
    expect(parseTagSymbols(sym("#", "file:///v/x.md", 1))).toEqual([]);
  });
});

describe("aggregateTags", () => {
  test("déduplique par fichier : même tag 2× dans le même fichier → une seule note", () => {
    const out = aggregateTags([
      { tag: "cours", path: "/v/a.md", line: 2 },
      { tag: "cours", path: "/v/a.md", line: 9 }, // doublon dans le même fichier
      { tag: "cours", path: "/v/b.md", line: 5 },
    ]);
    expect(out).toEqual([
      { tag: "cours", notes: [{ path: "/v/a.md", line: 2 }, { path: "/v/b.md", line: 5 }] },
    ]);
  });

  test("garde la ligne de la PREMIÈRE occurrence", () => {
    const out = aggregateTags([
      { tag: "cours", path: "/v/a.md", line: 12 },
      { tag: "cours", path: "/v/a.md", line: 3 },
    ]);
    expect(out[0].notes[0].line).toBe(12);
  });

  test("tri par nom de tag insensible à la casse, puis par chemin", () => {
    const out = aggregateTags([
      { tag: "Zebre", path: "/v/b.md", line: 1 },
      { tag: "algebre", path: "/v/b.md", line: 1 },
      { tag: "algebre", path: "/v/a.md", line: 1 },
      { tag: "Algebre", path: "/v/c.md", line: 1 },
    ]);
    // À sensibilité "base", "algebre" et "Algebre" sont égaux → départagés par
    // la comparaison case-sensitive (l'ordre minuscule/majuscule dépend de la
    // locale) ; ce qui est déterministe : les deux précédent "Zebre" (Z > A).
    const names = out.map((e) => e.tag);
    expect(names.slice(0, 2).sort()).toEqual(["Algebre", "algebre"]);
    expect(names[2]).toBe("Zebre");
    const alg = out.find((e) => e.tag === "algebre")!;
    expect(alg.notes.map((n) => n.path)).toEqual(["/v/a.md", "/v/b.md"]);
  });

  test("entrée vide → liste vide", () => {
    expect(aggregateTags([])).toEqual([]);
  });
});

describe("sortTagsByFrequency", () => {
  const entry = (tag: string, n: number): TagEntry => ({
    tag,
    notes: Array.from({ length: n }, (_, i) => ({
      path: `/v/${tag}-${i}.md`,
      line: 1,
    })),
  });

  test("tri par nombre d'occurrences DÉCROISSANT", () => {
    const out = sortTagsByFrequency([entry("rare", 1), entry("frequent", 42), entry("mid", 7)]);
    expect(out.map((e) => e.tag)).toEqual(["frequent", "mid", "rare"]);
  });

  test("départage les ex æquo par nom de tag (insensible à la casse)", () => {
    const out = sortTagsByFrequency([entry("Zebre", 3), entry("algebre", 3), entry("Algebre", 3)]);
    const names = out.map((e) => e.tag);
    expect(names.slice(0, 2).sort()).toEqual(["Algebre", "algebre"]);
    expect(names[2]).toBe("Zebre");
  });

  test("ne mute pas l'entrée", () => {
    const input = [entry("a", 2), entry("b", 5)];
    const before = JSON.stringify(input);
    sortTagsByFrequency(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  test("entrée vide → liste vide", () => {
    expect(sortTagsByFrequency([])).toEqual([]);
  });
});

describe("fetchVaultTags", () => {
  test("requête workspace/symbol avec query '#' et agrège le résultat", async () => {
    let method = "";
    let params: unknown = null;
    const request: LspRequest = async (m, p) => {
      method = m;
      params = p;
      return [
        sym("#projet", "file:///v/a.md", 3),
        sym("#projet", "file:///v/a.md", 8), // doublon même fichier
        sym("#projet", "file:///v/b.md", 1),
        sym("#cours", "file:///v/a.md", 6),
        sym("autre.md", "file:///v/autre.md", 1, 1), // fichier, exclu
      ];
    };
    const out = await fetchVaultTags(request);
    expect(method).toBe("workspace/symbol");
    expect(params).toEqual({ query: "#" });
    expect(out).toEqual<TagEntry[]>([
      { tag: "cours", notes: [{ path: "/v/a.md", line: 6 }] },
      { tag: "projet", notes: [{ path: "/v/a.md", line: 3 }, { path: "/v/b.md", line: 1 }] },
    ]);
  });

  test("timeout/échec du serveur → rejet propagé", async () => {
    const request: LspRequest = async () => {
      throw new Error("server not running");
    };
    expect(fetchVaultTags(request)).rejects.toThrow("server not running");
  });
});
