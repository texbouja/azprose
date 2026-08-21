/**
 * Tests du module de listing des modèles (sélecteur du panneau assistant).
 * Module PUR — parsing, repli saisie libre, groupement, cache à TTL.
 * Le runner est injecté (P6 : jamais mock.module).
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  estIdModele,
  grouperParProvider,
  invaliderCacheModeles,
  listerModeles,
  parserModeles,
} from "../src/lib/agent/modeles";

// Sortie réelle mesurée en sonde (2026-08-21) — 27 lignes dans cet
// environnement ; on en garde une tranche représentative.
const SORTIE_SONDE = `opencode/big-pickle
opencode/hy3-free
opencode/grok-code
opencode-go/qwen3-coder
opencode-go/kimi-k2`;

test("parserModeles lit les lignes provider/model de la sonde", () => {
  const modeles = parserModeles(SORTIE_SONDE);
  expect(modeles.length).toBe(5);
  expect(modeles[0]).toEqual({ id: "opencode/big-pickle", provider: "opencode" });
  expect(modeles[4]).toEqual({ id: "opencode-go/kimi-k2", provider: "opencode-go" });
});

test("parserModeles ignore les lignes qui ne sont pas un identifiant", () => {
  // Une bannière ou un en-tête ajouté par une montée de version ne doit pas
  // casser le sélecteur : ligne non conforme → ignorée, jamais fatale.
  const modeles = parserModeles("Models:\nopencode/big-pickle\n\n  \n27 models total");
  expect(modeles).toEqual([{ id: "opencode/big-pickle", provider: "opencode" }]);
});

test("parserModeles retire les codes ANSI et déduplique", () => {
  const modeles = parserModeles(
    "\x1b[1mopencode/big-pickle\x1b[0m\nopencode/big-pickle\n",
  );
  expect(modeles).toEqual([{ id: "opencode/big-pickle", provider: "opencode" }]);
});

test("parserModeles : sortie vide → liste vide, jamais d'erreur", () => {
  expect(parserModeles("")).toEqual([]);
});

describe("estIdModele (repli saisie libre)", () => {
  test("accepte la forme fournisseur/modèle", () => {
    expect(estIdModele("anthropic/claude-sonnet-4-5")).toBe(true);
    expect(estIdModele("  opencode/hy3-free  ")).toBe(true); // trim toléré
  });
  test("refuse tout ce qui n'a pas exactement un séparateur utilisable", () => {
    expect(estIdModele("big-pickle")).toBe(false);
    expect(estIdModele("/hy3-free")).toBe(false);
    expect(estIdModele("opencode/")).toBe(false);
    expect(estIdModele("deux mots/model")).toBe(false);
    expect(estIdModele("")).toBe(false);
  });
});

test("grouperParProvider conserve l'ordre de première apparition", () => {
  const groupes = grouperParProvider(parserModeles(SORTIE_SONDE));
  expect([...groupes.keys()]).toEqual(["opencode", "opencode-go"]);
  expect(groupes.get("opencode")!.map((m) => m.id)).toEqual([
    "opencode/big-pickle",
    "opencode/hy3-free",
    "opencode/grok-code",
  ]);
});

describe("listerModeles (cache + injection)", () => {
  test("parse la sortie du runner injecté", async () => {
    invaliderCacheModeles();
    let appels = 0;
    const executer = async () => {
      appels++;
      return SORTIE_SONDE;
    };
    const modeles = await listerModeles("opencode", executer);
    expect(modeles.length).toBe(5);
    // Deuxième appel : servi par le cache, le processus n'est PAS relancé
    // (~2 s par invocation mesurées en sonde — les repayer à chaque ouverture
    // de menu serait absurde).
    await listerModeles("opencode", executer);
    expect(appels).toBe(1);
  });

  test("un changement de binaire force une nouvelle mesure", async () => {
    invaliderCacheModeles();
    let appels = 0;
    const executer = async (_cmd: string, args: string[]) => {
      appels++;
      expect(args).toEqual(["models"]);
      return SORTIE_SONDE;
    };
    await listerModeles("opencode", executer);
    await listerModeles("/usr/local/bin/opencode-candidate", executer);
    expect(appels).toBe(2);
  });

  test("un échec n'est PAS caché : l'ouverture suivante retente", async () => {
    invaliderCacheModeles();
    let appels = 0;
    const executer = async () => {
      appels++;
      if (appels === 1) throw new Error("opencode: exit 1: Provider not found");
      return SORTIE_SONDE;
    };
    await expect(listerModeles("opencode", executer)).rejects.toThrow("Provider not found");
    const modeles = await listerModeles("opencode", executer);
    expect(modeles.length).toBe(5);
    expect(appels).toBe(2);
  });
});
