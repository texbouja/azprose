/**
 * Tests de l'enveloppe du catalogue persisté — module PUR (aucune E/S : la
 * liaison Tauri vit dans `catalogue-store.ts`, comme pour `programmes/`).
 *
 * L'enjeu de ces tests : un catalogue parsé conservé indéfiniment est un
 * piège si la forme de `/provider` change à une mise à jour d'OpenCode.
 * L'enveloppe doit se JETER au moindre doute — un rechargement coûte une
 * seconde, des données mal interprétées coûtent une enquête.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import { SCHEMA_CATALOGUE, envelopper, relire } from "../src/lib/agent/catalogue-cache";

const DONNEES = [
  { id: "opencode", nom: "OpenCode", modeles: [{ id: "opencode/big-pickle", slug: "big-pickle" }] },
];

describe("envelopper", () => {
  test("pose schéma, version du binaire et date", () => {
    const c = envelopper(DONNEES, "1.18.11", new Date("2026-08-22T10:00:00Z"));
    expect(c).toEqual({
      schema: SCHEMA_CATALOGUE,
      versionBinaire: "1.18.11",
      date: "2026-08-22T10:00:00.000Z",
      donnees: DONNEES,
    });
  });
});

describe("relire", () => {
  const bon = JSON.stringify(envelopper(DONNEES, "1.18.11"));

  test("rend les données quand tout concorde", () => {
    expect(relire(bon, "1.18.11")).toEqual(DONNEES);
  });

  test("version du binaire différente → jeté", () => {
    expect(relire(bon, "1.19.0")).toBeNull();
  });

  test("version INCONNUE → jeté aussi", () => {
    // Sans version courante, on ne peut pas affirmer que le cache est juste.
    // Le prix est un rechargement, jamais une donnée mal interprétée.
    expect(relire(bon, null)).toBeNull();
  });

  test("schéma différent → jeté (notre forme a changé)", () => {
    const vieux = JSON.stringify({ ...JSON.parse(bon), schema: SCHEMA_CATALOGUE - 1 });
    expect(relire(vieux, "1.18.11")).toBeNull();
  });

  test("entrée mal formée → jeté, même si le schéma dit le contraire", () => {
    // Filet contre un cache écrit par une version qui aurait oublié de
    // monter le numéro de schéma.
    const abime = JSON.stringify({
      schema: SCHEMA_CATALOGUE,
      versionBinaire: "1.18.11",
      date: "2026-08-22T10:00:00.000Z",
      donnees: [{ id: "opencode" }], // ni nom ni modeles
    });
    expect(relire(abime, "1.18.11")).toBeNull();
  });

  test("absent, illisible, ou enveloppe absente → jeté sans lever", () => {
    expect(relire(null, "1.18.11")).toBeNull();
    expect(relire("", "1.18.11")).toBeNull();
    expect(relire("{pas du json", "1.18.11")).toBeNull();
    expect(relire("null", "1.18.11")).toBeNull();
    expect(relire(JSON.stringify({ donnees: DONNEES }), "1.18.11")).toBeNull();
  });

  test("catalogue vide légitime : rendu tel quel, pas confondu avec « absent »", () => {
    expect(relire(JSON.stringify(envelopper([], "1.18.11")), "1.18.11")).toEqual([]);
  });
});
