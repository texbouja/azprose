/**
 * Tests du chien de garde d'inactivité des prompts (module pur, horloge
 * injectable — jamais de vrai timer dans les tests).
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import { surveillerSilence, type HorlogeSilence } from "../src/lib/agent/silence";

/** Horloge manuelle : les timers ne partent que quand on avance le temps. */
function horlogeFausse() {
  let maintenant = 0;
  const vivants = new Map<object, { echeance: number; cb: () => void }>();
  const h: HorlogeSilence = {
    programmer: (ms, cb) => {
      const handle = {};
      vivants.set(handle, { echeance: maintenant + ms, cb });
      return handle;
    },
    annuler: (handle) => void vivants.delete(handle),
  };
  return {
    h,
    avancer(ms: number) {
      maintenant += ms;
      const dues = [...vivants.entries()].filter(([, t]) => t.echeance <= maintenant);
      for (const [handle, t] of dues) {
        vivants.delete(handle);
        t.cb();
      }
    },
    taille: () => vivants.size,
  };
}

describe("surveillerSilence", () => {
  test("rejette après inactiviteMs sans battement", async () => {
    const h = horlogeFausse();
    const jamais = new Promise(() => {});
    const w = surveillerSilence(jamais, 5000, h.h);
    // Le temps s'écoule AVANT de créer l'attente : chez ce bun canary, un
    // matcher créé avant le rejet ne se résout jamais (et un matcher qui
    // n'aboutit pas bloque le runner).
    h.avancer(4999);
    h.avancer(1);
    await expect(w.resultat).rejects.toThrow("depuis 5 s");
  });

  test("chaque battement réarme le compteur", async () => {
    const h = horlogeFausse();
    const w = surveillerSilence(new Promise(() => {}), 5000, h.h);
    h.avancer(4000);
    w.battre(); // un signe de vie : le compteur repart de zéro
    h.avancer(4000);
    // 12 s écoulées au total, jamais 5 s de silence : rien ne doit rejeter.
    // Il reste exactement UN timer vivant — celui du dernier réarmement.
    expect(h.taille()).toBe(1);
    w.arreter();
  });

  test("la résolution amont désactive le chien (pas de rejet tardif)", async () => {
    const h = horlogeFausse();
    let resoudre!: (v: string) => void;
    const amont = new Promise<string>((r) => (resoudre = r));
    const w = surveillerSilence(amont, 1000, h.h);
    resoudre("ok");
    await expect(w.resultat).resolves.toBe("ok");
    h.avancer(9999); // aucun timer restant : pas de rejet fantôme
    w.battre(); // après fin : sans effet
  });

  test("le rejet amont est propagé et fige le chien", async () => {
    const h = horlogeFausse();
    const amont = Promise.reject(new Error("quota"));
    const w = surveillerSilence(amont, 1000, h.h);
    await expect(w.resultat).rejects.toThrow("quota");
    h.avancer(9999);
  });

  test("arreter() fige définitivement même si l'amont reste suspendu", async () => {
    const h = horlogeFausse();
    const w = surveillerSilence(new Promise(() => {}), 1000, h.h);
    w.arreter();
    h.avancer(99999);
    w.battre();
    expect(h.taille()).toBe(0);
  });
});
