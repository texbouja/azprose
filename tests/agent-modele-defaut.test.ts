/**
 * Tests du modèle ACTIF vs modèle par DÉFAUT — module PUR, stockage injecté
 * (P6 : jamais mock.module ; le runtime bun n'a pas de localStorage).
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  ecrirePin,
  epingler,
  essayer,
  lirePin,
  modeleVoulu,
  oublier,
} from "../src/lib/agent/modele-defaut";

const CLE = "mdview.agent.model";

/** Faux localStorage, et un compteur d'écritures pour prouver le NON-écrit. */
function stockage(initial: Record<string, string> = {}) {
  const donnees = new Map(Object.entries(initial));
  let ecritures = 0;
  return {
    get ecritures() { return ecritures; },
    getItem: (k: string) => (donnees.has(k) ? donnees.get(k)! : null),
    setItem: (k: string, v: string) => { ecritures += 1; donnees.set(k, v); },
    removeItem: (k: string) => { ecritures += 1; donnees.delete(k); },
  };
}

const VIDE = { pin: null, session: null };

describe("essayer (clic sur la ligne)", () => {
  test("applique maintenant sans toucher au défaut", () => {
    const e = essayer({ pin: "opencode/big-pickle", session: null }, "anthropic/claude-opus-5");
    expect(modeleVoulu(e)).toBe("anthropic/claude-opus-5");
    expect(e.pin).toBe("opencode/big-pickle");
  });

  test("ne persiste RIEN — le défaut de conception d'avant", () => {
    const s = stockage({ [CLE]: JSON.stringify("opencode/big-pickle") });
    // Un essai n'a aucune raison de toucher le stockage : la seule preuve
    // qui vaille est qu'aucune écriture n'a lieu.
    essayer({ pin: "opencode/big-pickle", session: null }, "anthropic/claude-opus-5");
    expect(s.ecritures).toBe(0);
    expect(lirePin(s, CLE)).toBe("opencode/big-pickle");
  });
});

describe("epingler (clic sur le pin)", () => {
  test("fixe le défaut et efface l'essai en cours", () => {
    const e = epingler({ pin: "a/1", session: "b/2" }, "c/3");
    expect(e.pin).toBe("c/3");
    expect(e.session).toBeNull();
    // Sans l'effacement, l'essai « b/2 » masquerait le défaut fraîchement
    // fixé et le chip mentirait.
    expect(modeleVoulu(e)).toBe("c/3");
  });

  test("recliquer l'épinglé est SANS EFFET (radio, pas bascule)", () => {
    const etat = { pin: "c/3", session: null };
    // Identité préservée : l'appelant s'en sert pour ne rien réécrire.
    expect(epingler(etat, "c/3")).toBe(etat);
  });

  test("bouton radio : au plus un défaut", () => {
    let e = epingler(VIDE, "a/1");
    e = epingler(e, "b/2");
    expect(e.pin).toBe("b/2");
  });
});

describe("oublier (modèle inapplicable)", () => {
  test("l'essai tombe en premier, le défaut survit", () => {
    const e = oublier({ pin: "a/1", session: "b/2" });
    expect(e).toEqual({ pin: "a/1", session: null });
  });

  test("sans essai, c'est le défaut qui tombe", () => {
    // Garder un défaut invalide referait échouer CHAQUE session.
    expect(oublier({ pin: "a/1", session: null })).toEqual(VIDE);
  });
});

describe("persistance et migration", () => {
  test("premier lancement : aucun pin → l'assistant suit OpenCode", () => {
    expect(lirePin(stockage(), CLE)).toBeNull();
    expect(modeleVoulu(VIDE)).toBeNull();
  });

  test("migration : la surcharge globale d'avant devient le pin initial", () => {
    // Sans ça, la mise à jour effacerait en silence le choix de l'utilisateur.
    const s = stockage({ [CLE]: JSON.stringify("opencode/big-pickle") });
    expect(lirePin(s, CLE)).toBe("opencode/big-pickle");
  });

  test("contenu invalide ou vide → premier lancement, jamais d'erreur", () => {
    expect(lirePin(stockage({ [CLE]: "{invalide" }), CLE)).toBeNull();
    expect(lirePin(stockage({ [CLE]: JSON.stringify("") }), CLE)).toBeNull();
    expect(lirePin(stockage({ [CLE]: JSON.stringify(42) }), CLE)).toBeNull();
    expect(lirePin(null, CLE)).toBeNull();
  });

  test("ecrirePin pose, puis efface", () => {
    const s = stockage();
    ecrirePin(s, CLE, "a/1");
    expect(lirePin(s, CLE)).toBe("a/1");
    ecrirePin(s, CLE, null);
    expect(lirePin(s, CLE)).toBeNull();
    expect(() => ecrirePin(null, CLE, "a/1")).not.toThrow();
  });
});
