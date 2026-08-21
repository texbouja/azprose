/**
 * Tests de la navigation dans l'historique des demandes (↑/↓ façon TUI) :
 * bornes de position, lecture d'entrée, détection des lignes logiques.
 * Module pur : aucun montage nécessaire.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  caretSurDerniereLigne,
  caretSurPremiereLigne,
  cibleHistorique,
  entreeHistorique,
} from "../src/lib/agent/historique";

describe("cibleHistorique", () => {
  test("remonte du brouillon vivant vers le dernier envoi (↑ = delta positif)", () => {
    expect(cibleHistorique(-1, 1, 3)).toBe(0);
  });

  test("redescend vers le brouillon vivant puis s'y arrête", () => {
    expect(cibleHistorique(0, -1, 3)).toBe(-1);
    expect(cibleHistorique(-1, -1, 3)).toBe(-1);
  });

  test("bornes : plus ancien atteint, position inchangée au-delà", () => {
    expect(cibleHistorique(2, 1, 3)).toBe(2);
    // Position périmée (session changée) : ne peut que redescendre.
    expect(cibleHistorique(5, 1, 3)).toBe(5);
  });

  test("historique vide : aucune navigation", () => {
    expect(cibleHistorique(-1, 1, 0)).toBe(-1);
  });
});

describe("entreeHistorique", () => {
  const HIST = ["premier", "deuxième", "troisième"];

  test("position 0 = envoi le plus récent ; n-1 = plus ancien", () => {
    expect(entreeHistorique(HIST, 0, "")).toBe("troisième");
    expect(entreeHistorique(HIST, 2, "")).toBe("premier");
  });

  test("position -1 = brouillon mis de côté", () => {
    expect(entreeHistorique(HIST, -1, "en cours")).toBe("en cours");
  });
});

describe("bornes verticales logiques du champ", () => {
  test("caretSurPremiereLigne : début et milieu de première ligne seulement", () => {
    expect(caretSurPremiereLigne("salut", 0)).toBe(true);
    expect(caretSurPremiereLigne("salut", 5)).toBe(true);
    expect(caretSurPremiereLigne("salut\nsuite", 8)).toBe(false);
  });

  test("caretSurDerniereLigne : fin et milieu de dernière ligne seulement", () => {
    expect(caretSurDerniereLigne("salut\nsuite", 11)).toBe(true);
    expect(caretSurDerniereLigne("salut\nsuite", 6)).toBe(true);
    expect(caretSurDerniereLigne("salut\nsuite", 3)).toBe(false);
  });

  test("texte vide : les deux bornes vraies (↑ rappelle tout de suite)", () => {
    expect(caretSurPremiereLigne("", 0)).toBe(true);
    expect(caretSurDerniereLigne("", 0)).toBe(true);
  });

  test("caret borné hors chaîne : borné à 0 = première ligne", () => {
    expect(caretSurPremiereLigne("a\nb", 99)).toBe(false);
    expect(caretSurDerniereLigne("a\nb", 99)).toBe(true);
    expect(caretSurDerniereLigne("a\nb", -4)).toBe(false);
    expect(caretSurPremiereLigne("a\nb", -4)).toBe(true);
  });
});
