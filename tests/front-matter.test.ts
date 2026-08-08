/**
 * Tests PUR du parsing front matter YAML (src/lib/front-matter.ts) —
 * module extrait de render.ts pour être testable sous `bun test`
 * (render.ts importe des stores Svelte 5 → `$state is not defined`).
 */
import { describe, expect, it } from "bun:test";
import { parseFrontMatter } from "@/lib/front-matter";

describe("parseFrontMatter", () => {
  it("absents → meta vide, body intact, fmLineCount 0", () => {
    const fm = parseFrontMatter("# Titre\n\nContenu");
    expect(fm.meta).toEqual({});
    expect(fm.body).toBe("# Titre\n\nContenu");
    expect(fm.fmLineCount).toBe(0);
  });

  it("capture les clés simples, quotes simples et doubles retirées", () => {
    const fm = parseFrontMatter(`---
title: "Algèbre"
subtitle: 'Cours 1'
author: Sadik Boujaida
date: 2026-08-08
---

# Corps`);
    expect(fm.meta.title).toBe("Algèbre");
    expect(fm.meta.subtitle).toBe("Cours 1");
    expect(fm.meta.author).toBe("Sadik Boujaida");
    expect(fm.meta.date).toBe("2026-08-08");
    expect(fm.body).toBe("\n# Corps"); // la ligne vide après --- est conservée (comportement FM_RE d'origine)
  });

  it("logo et altlogo capturés", () => {
    const fm = parseFrontMatter("---\nlogo: assets/logo.png\naltlogo: Logo AMP\n---\ncorps");
    expect(fm.meta.logo).toBe("assets/logo.png");
    expect(fm.meta.altlogo).toBe("Logo AMP");
  });

  it("fmLineCount = nombre de lignes du bloc (pour les data-sline)", () => {
    const fm = parseFrontMatter("---\na: 1\nb: 2\n---\n\ncorps");
    expect(fm.fmLineCount).toBe(4); // 4 fins de ligne dans le bloc `---…---\n`
  });

  it("ligne sans ':' ignorée", () => {
    const fm = parseFrontMatter("---\njuste du texte\nlogo: l.png\n---\nx");
    expect(fm.meta.logo).toBe("l.png");
    expect(fm.meta["juste du texte"]).toBeUndefined();
  });

  it("délimiteur --- avec espaces toléré, sans front matter → body = tout", () => {
    expect(parseFrontMatter("--- \na: 1\n---\nX").meta.a).toBe("1");
    expect(parseFrontMatter("pas de fm").fmLineCount).toBe(0);
  });

  it("première ligne non-frontmatter → pas de parsing (--- non en tête)", () => {
    const fm = parseFrontMatter("# T\n---\na: 1\n---");
    expect(fm.meta).toEqual({});
    expect(fm.fmLineCount).toBe(0);
  });
});
