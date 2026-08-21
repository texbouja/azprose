/**
 * Tests de la retranscription de session (export Markdown du fil assistant).
 * Module pur : aucun montage nécessaire.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  nomTranscription,
  transcriptionMarkdown,
} from "../src/lib/agent/transcription";

describe("transcriptionMarkdown", () => {
  const DATE = new Date(2026, 7, 21, 14, 32, 5);

  test("en-tête daté + sections dans l'ordre du fil", () => {
    const md = transcriptionMarkdown(
      [
        { kind: "user", text: "Bonjour" },
        { kind: "agent", text: "Salut !" },
      ],
      { date: DATE, modele: "openai/gpt-5" },
    );
    expect(md).toContain("# Transcription de l'assistant");
    expect(md).toContain("Date : 2026-08-21-143205");
    expect(md).toContain("Modèle : openai/gpt-5");
    expect(md.indexOf("## Vous")).toBeLessThan(md.indexOf("## Assistant"));
    expect(md).toContain("Bonjour");
    expect(md).toContain("Salut !");
    expect(md.endsWith("\n")).toBe(true);
  });

  test("messages consécutifs du même rôle fusionnent sous une section", () => {
    const md = transcriptionMarkdown(
      [
        { kind: "user", text: "va-y" },
        { kind: "agent", text: "première partie" },
        { kind: "agent", text: "suite" },
        { kind: "user", text: "merci" },
      ],
      { date: DATE },
    );
    expect(md.match(/## Assistant/g)).toHaveLength(1);
    expect(md.match(/## Vous/g)).toHaveLength(2);
    // Séparateur vide entre les deux réponses fondues.
    expect(md).toContain("première partie\n\nsuite");
  });

  test("textes vides ou blancs sautés sans créer de section", () => {
    const md = transcriptionMarkdown(
      [
        { kind: "user", text: "" },
        { kind: "agent", text: "   " },
        { kind: "user", text: "vraie demande" },
      ],
      { date: DATE },
    );
    expect(md.match(/## /g)).toHaveLength(1);
    expect(md).not.toContain("## Assistant");
  });

  test("fil vide → en-tête seul", () => {
    const md = transcriptionMarkdown([], { date: DATE });
    expect(md).toContain("# Transcription de l'assistant");
    expect(md).not.toContain("## ");
  });
});

describe("nomTranscription", () => {
  test("horodaté, triable, extension .md", () => {
    expect(nomTranscription(new Date(2026, 7, 21, 9, 5, 3))).toBe(
      "transcription-2026-08-21-090503.md",
    );
  });
});
