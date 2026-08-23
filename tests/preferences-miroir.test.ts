/**
 * Miroir des préférences globales — module PUR, stockage injecté.
 *
 * Ce que ces tests protègent : que le miroir reste un FILET et jamais une
 * source. Le stockage local fait foi ; une clé présente n'est jamais écrasée.
 * Sans cette règle, une valeur modifiée dans une fenêtre pourrait être
 * remplacée par un miroir plus ancien écrit par l'autre.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  PREFIXE_PREFERENCES,
  SCHEMA_MIROIR,
  expurger,
  instantaner,
  restaurer,
} from "../src/lib/preferences-miroir";

/** Faux localStorage : indexable par position, comme le vrai. */
function stockage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    /** Confort de test. */
    tout: () => Object.fromEntries(m),
  };
}

describe("instantané", () => {
  test("ne prend que les préférences globales", () => {
    const s = stockage({
      "mdview.theme": '"catppuccin"',
      "mdview.user.profile": '{"colleurName":"Boujaida"}',
      // État de session par coffre : volumineux, sans valeur ailleurs.
      "azp:session::/home/Backup/AZColle": "{...}",
      "azp:draft:::/x::/y.md": "brouillon",
      "azp:lastfile::/home/x": "/home/x/a.md",
    });
    const m = instantaner(s, new Date("2026-08-23T10:00:00Z"));
    expect(Object.keys(m.cles).sort()).toEqual(["mdview.theme", "mdview.user.profile"]);
    expect(m.schema).toBe(SCHEMA_MIROIR);
    expect(m.date).toBe("2026-08-23T10:00:00.000Z");
  });

  test("le préfixe est bien celui des préférences", () => {
    expect(PREFIXE_PREFERENCES).toBe("mdview.");
  });

  test("stockage vide → miroir vide, jamais d'erreur", () => {
    expect(instantaner(stockage()).cles).toEqual({});
  });
});

describe("expurgation des secrets", () => {
  test("le mot de passe Gmail ne part JAMAIS dans le miroir", () => {
    // Le miroir sert à ne pas perdre des préférences, pas à sortir un secret
    // du stockage du navigateur pour l'écrire en clair sur le disque.
    const brut = '{"name":"Sadik","colleurName":"Boujaida","gmailAppPassword":"abcd efgh"}';
    const sorti = JSON.parse(expurger("mdview.user.profile", brut));
    expect(sorti).toEqual({ name: "Sadik", colleurName: "Boujaida" });
  });

  test("l'expurgation vaut aussi dans l'instantané complet", () => {
    const s = stockage({ "mdview.user.profile": '{"gmailAppPassword":"secret","name":"A"}' });
    expect(instantaner(s).cles["mdview.user.profile"]).not.toContain("secret");
  });

  test("valeur non-objet ou illisible → rendue telle quelle", () => {
    expect(expurger("mdview.user.profile", "pas du json")).toBe("pas du json");
    expect(expurger("mdview.user.profile", '"chaine"')).toBe('"chaine"');
    expect(expurger("mdview.theme", '{"gmailAppPassword":"x"}')).toBe('{"gmailAppPassword":"x"}');
  });
});

describe("restauration", () => {
  const miroir = JSON.stringify({
    schema: SCHEMA_MIROIR,
    date: "2026-08-23T10:00:00.000Z",
    cles: { "mdview.theme": '"nord"', "mdview.user.profile": '{"colleurName":"Boujaida"}' },
  });

  test("remet les clés ABSENTES", () => {
    const s = stockage();
    expect(restaurer(miroir, s)).toEqual(["mdview.theme", "mdview.user.profile"]);
    expect(s.getItem("mdview.user.profile")).toBe('{"colleurName":"Boujaida"}');
  });

  test("n'écrase JAMAIS une clé présente — le stockage fait foi", () => {
    const s = stockage({ "mdview.theme": '"catppuccin"' });
    expect(restaurer(miroir, s)).toEqual(["mdview.user.profile"]);
    expect(s.getItem("mdview.theme")).toBe('"catppuccin"');
  });

  test("une valeur VIDE reste une valeur : elle n'est pas remplacée", () => {
    // Tout effacer est un choix légitime de l'utilisateur.
    const s = stockage({ "mdview.user.profile": '{"colleurName":""}' });
    expect(restaurer(miroir, s)).toEqual(["mdview.theme"]);
    expect(s.getItem("mdview.user.profile")).toBe('{"colleurName":""}');
  });

  test("miroir absent, illisible, ou de schéma différent → rien", () => {
    expect(restaurer(null, stockage())).toEqual([]);
    expect(restaurer("{pas du json", stockage())).toEqual([]);
    expect(restaurer(JSON.stringify({ schema: 999, cles: { "mdview.a": "1" } }), stockage())).toEqual([]);
    expect(restaurer(JSON.stringify({ schema: SCHEMA_MIROIR }), stockage())).toEqual([]);
  });

  test("une clé hors préfixe présente dans le miroir est ignorée", () => {
    const hostile = JSON.stringify({
      schema: SCHEMA_MIROIR,
      cles: { "azp:session::/x": "{}", "autre": "1", "mdview.ok": '"v"' },
    });
    const s = stockage();
    expect(restaurer(hostile, s)).toEqual(["mdview.ok"]);
    expect(s.getItem("azp:session::/x")).toBeNull();
  });

  test("aller-retour : instantané puis restauration dans un stockage vide", () => {
    const source = stockage({ "mdview.theme": '"nord"', "mdview.ui.scale": "1.1" });
    const cible = stockage();
    restaurer(JSON.stringify(instantaner(source)), cible);
    expect(cible.tout()).toEqual({ "mdview.theme": '"nord"', "mdview.ui.scale": "1.1" });
  });
});
