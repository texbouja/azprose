import { describe, expect, test } from "bun:test";
import { filterHelpArticles, filterIndexEntries, parseAddress } from "@/nav/address";

describe("parseAddress (barre d'adresse NAV, pure)", () => {
  test("sans préfixe → vault", () => {
    expect(parseAddress("suites-convergence")).toEqual({ kind: "vault", query: "suites-convergence" });
  });

  test("préfixe aide: (casse et espaces tolérés)", () => {
    expect(parseAddress("aide:installation")).toEqual({ kind: "help", query: "installation" });
    expect(parseAddress("AIDE : installation")).toEqual({ kind: "help", query: "installation" });
    expect(parseAddress("  Aide:   installation  ")).toEqual({ kind: "help", query: "installation" });
  });

  test("préfixe help: (synonyme anglais)", () => {
    expect(parseAddress("help:shortcuts")).toEqual({ kind: "help", query: "shortcuts" });
    expect(parseAddress("HELP:shortcuts")).toEqual({ kind: "help", query: "shortcuts" });
  });

  test("requête vide après préfixe → query vide, kind help", () => {
    expect(parseAddress("aide:")).toEqual({ kind: "help", query: "" });
    expect(parseAddress("aide:   ")).toEqual({ kind: "help", query: "" });
  });

  test("entrée vide/blanche → vault, query vide", () => {
    expect(parseAddress("")).toEqual({ kind: "vault", query: "" });
    expect(parseAddress("   ")).toEqual({ kind: "vault", query: "" });
  });

  test("espaces de bord retirés côté vault", () => {
    expect(parseAddress("  suites  ")).toEqual({ kind: "vault", query: "suites" });
  });

  test("un ':' au milieu d'un nom de fichier n'est pas un préfixe reconnu", () => {
    expect(parseAddress("chapitre:1-intro")).toEqual({ kind: "vault", query: "chapitre:1-intro" });
  });
});

describe("filterIndexEntries (complétion vault, pure)", () => {
  const index = new Map([
    ["suites-definitions", "/root/suites-definitions.md"],
    ["suites-convergence", "/root/suites-convergence.md"],
    ["derivees", "/root/derivees.md"],
  ]);

  test("requête vide → aucune suggestion", () => {
    expect(filterIndexEntries(index, "")).toEqual([]);
    expect(filterIndexEntries(index, "   ")).toEqual([]);
  });

  test("filtre insensible à la casse, tri alphabétique", () => {
    expect(filterIndexEntries(index, "SUITES")).toEqual(["suites-convergence", "suites-definitions"]);
  });

  test("sous-chaîne, pas seulement préfixe", () => {
    expect(filterIndexEntries(index, "conv")).toEqual(["suites-convergence"]);
  });

  test("aucune correspondance → tableau vide", () => {
    expect(filterIndexEntries(index, "zzz")).toEqual([]);
  });

  test("limit borne le nombre de résultats", () => {
    expect(filterIndexEntries(index, "e", 1).length).toBe(1);
  });
});

describe("filterHelpArticles (complétion aide, pure)", () => {
  const articles = [
    { path: "installation.md", title: "Installation" },
    { path: "raccourcis.md", title: "Raccourcis clavier" },
    { path: "export.md", title: "Export PDF" },
  ];

  test("requête vide → aucune suggestion", () => {
    expect(filterHelpArticles(articles, "")).toEqual([]);
  });

  test("filtre sur le TITRE, insensible à la casse", () => {
    expect(filterHelpArticles(articles, "clavier")).toEqual([articles[1]]);
  });

  test("aucune correspondance → tableau vide", () => {
    expect(filterHelpArticles(articles, "zzz")).toEqual([]);
  });
});
