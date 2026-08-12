/**
 * Phase F — fenêtre fille « browser » : conventions de LABEL (cascade de
 * fermeture) et de TAILLE (R5 : jamais maximisée, dépendante de l'écran).
 * Les fonctions testées sont pures ; l'ouverture elle-même est du ressort de
 * Tauri (WebviewWindow).
 */
import { expect, test } from "bun:test";
import { browseWindowLabel, browseWindowSize, isBrowseChildOf } from "../src/lib/browse-window";

test("label : une fenêtre fille porte le label de SA fenêtre de projet", () => {
  const label = browseWindowLabel("azprose-project-42", 1);

  expect(isBrowseChildOf(label, "azprose-project-42")).toBe(true);
  // Descendance stricte : la fille d'une AUTRE fenêtre n'est jamais fermée par
  // celle-ci (deux projets ouverts côte à côte).
  expect(isBrowseChildOf(label, "azprose-project-7")).toBe(false);
  expect(isBrowseChildOf(label, "main")).toBe(false);
  // Une fenêtre de projet n'est jamais prise pour une fenêtre fille.
  expect(isBrowseChildOf("azprose-project-42", "azprose-project-42")).toBe(false);
});

test("label : deux ouvertures successives ne collisionnent pas", () => {
  expect(browseWindowLabel("main", 1)).not.toBe(browseWindowLabel("main", 2));
});

test("taille : bornée par la taille de lancement de l'app, jamais maximisée", () => {
  // Grand écran (4K logique) : on plafonne à la convention de l'app.
  const big = browseWindowSize({ size: { width: 3840, height: 2160 }, scaleFactor: 1 });
  expect(big).toEqual({ width: 1240, height: 820 });

  // Écran modeste : proportionnel — la fenêtre reste plus petite que l'écran.
  const small = browseWindowSize({ size: { width: 1366, height: 768 }, scaleFactor: 1 });
  expect(small.width).toBe(Math.round(1366 * 0.8));
  expect(small.height).toBe(Math.round(768 * 0.85));
  expect(small.width).toBeLessThan(1366);
  expect(small.height).toBeLessThan(768);
});

test("taille : le facteur d'échelle (HiDPI) est pris en compte", () => {
  // 2560×1440 physiques à 2× = 1280×720 logiques.
  const hidpi = browseWindowSize({ size: { width: 2560, height: 1440 }, scaleFactor: 2 });
  expect(hidpi.width).toBe(Math.round(1280 * 0.8));
  expect(hidpi.height).toBe(Math.round(720 * 0.85));
});

test("taille : moniteur inconnu → convention de lancement de l'app", () => {
  expect(browseWindowSize(null)).toEqual({ width: 1240, height: 820 });
  expect(browseWindowSize({ size: { width: 1920, height: 1080 }, scaleFactor: 0 })).toEqual({
    width: 1240,
    height: 820,
  });
});

test("taille : minimums garantis sur un très petit écran", () => {
  const tiny = browseWindowSize({ size: { width: 320, height: 240 }, scaleFactor: 1 });
  expect(tiny.width).toBeGreaterThanOrEqual(640);
  expect(tiny.height).toBeGreaterThanOrEqual(480);
});
