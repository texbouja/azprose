/**
 * Tests du catalogue complet des fournisseurs — parsing de `GET /provider`
 * (serveur headless OpenCode, voie documentée) + tri d'affichage + recherche
 * du fournisseur d'un modèle. Formes calquées sur la sonde du 2026-08-21
 * (OpenCode 1.18.11, 193 fournisseurs à charge réelle).
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  filtrerCatalogue,
  fournisseurDeId,
  parserCatalogue,
  trierCatalogue,
} from "../src/lib/agent/catalogue";

// Tranche représentative de la vraie réponse : clés de modèles pouvant
// contenir un « / » interne (hpc-ai), fournisseurs connectés et non
// connectés mêlés, entrées déchets que le serveur ne devrait pas produire
// mais qu'on ne paie jamais de plantage.
const REPONSE_SONDE = {
  all: [
    {
      id: "opencode",
      name: "OpenCode",
      source: "opencode",
      models: {
        "big-pickle": { id: "opencode/big-pickle", name: "OpenCode/Big Pickle" },
        "hy3-free": {},
      },
    },
    {
      id: "hpc-ai",
      name: "HPC-AI",
      models: { "deepseek/deepseek-v4-flash": { name: "DeepSeek V4 Flash" } },
    },
    {
      id: "anthropic",
      name: "Anthropic",
      models: { "claude-sonnet-4-5": { name: "Claude Sonnet 4.5" } },
    },
    { id: "opencode" }, // doublon → ignoré
    null,
    42,
    {}, // déchets → ignorés
  ],
  default: { opencode: "big-pickle" },
  connected: ["anthropic"],
};

describe("parserCatalogue (GET /provider)", () => {
  test("parse la forme mesurée : ordre conservé, état de connexion posé", () => {
    const catalogue = parserCatalogue(REPONSE_SONDE);
    expect(catalogue.map((f) => f.id)).toEqual(["opencode", "hpc-ai", "anthropic"]);
    expect(catalogue.map((f) => f.connecte)).toEqual([false, false, true]);
  });

  test("identifiant complet = fournisseur + clé, même quand la clé contient un /", () => {
    const hpc = parserCatalogue(REPONSE_SONDE).find((f) => f.id === "hpc-ai")!;
    expect(hpc.modeles[0]).toMatchObject({
      id: "hpc-ai/deepseek/deepseek-v4-flash",
      slug: "deepseek/deepseek-v4-flash",
      nom: "DeepSeek V4 Flash",
    });
  });

  test("nom de repli : fournisseur sans name → id ; modèle sans name → undefined", () => {
    const [opencode] = parserCatalogue(REPONSE_SONDE);
    expect(opencode.nom).toBe("OpenCode");
    expect(opencode.modeles[1]).toMatchObject({ id: "opencode/hy3-free", nom: undefined });
    expect(parserCatalogue({ all: [{ id: "x", models: {} }] })[0].nom).toBe("x");
  });

  test("défensif : réponse absente, vide ou déchets → [], jamais d'erreur", () => {
    expect(parserCatalogue(undefined)).toEqual([]);
    expect(parserCatalogue(null)).toEqual([]);
    expect(parserCatalogue({})).toEqual([]);
    expect(parserCatalogue({ all: "pas-un-tableau" })).toEqual([]);
  });

  test("connected absent ou déchets → aucun fournisseur connecté", () => {
    const catalogue = parserCatalogue({ all: REPONSE_SONDE.all.slice(0, 3) });
    expect(catalogue.every((f) => !f.connecte)).toBe(true);
    const bizarre = parserCatalogue({
      all: [{ id: "a" }],
      connected: [42, null, true],
    });
    expect(bizarre[0].connecte).toBe(false);
  });
});

describe("trierCatalogue (ordre de repos du menu)", () => {
  test("connectés d'abord (ordre déclaré), puis le reste par nom insensible à la casse", () => {
    const trié = trierCatalogue(parserCatalogue(REPONSE_SONDE));
    // anthropic connecté passe devant ; HPC-AI < OpenCode alphabétiquement.
    expect(trié.map((f) => f.id)).toEqual(["anthropic", "hpc-ai", "opencode"]);
  });

  test("sans connecté : pur ordre alphabétique ; égalité de nom départagée par id", () => {
    const trié = trierCatalogue([
      { id: "zeta", nom: "Zorro", connecte: false, modeles: [] },
      { id: "alpha", nom: "abandonné", connecte: false, modeles: [] },
      { id: "b-bis", nom: "Abandonné", connecte: false, modeles: [] },
    ]);
    expect(trié.map((f) => f.id)).toEqual(["alpha", "b-bis", "zeta"]);
  });

  test("ne mute pas l'entrée", () => {
    const liste = parserCatalogue(REPONSE_SONDE);
    trierCatalogue(liste);
    expect(liste.map((f) => f.id)).toEqual(["opencode", "hpc-ai", "anthropic"]);
  });
});

describe("fournisseurDeId (recherche par identifiant complet)", () => {
  const catalogue = parserCatalogue(REPONSE_SONDE);

  test("préfixe exact fournisseur/ — survit aux « / » internes du slug", () => {
    expect(fournisseurDeId(catalogue, "hpc-ai/deepseek/deepseek-v4-flash")?.id).toBe("hpc-ai");
    expect(fournisseurDeId(catalogue, "anthropic/claude-sonnet-4-5")?.id).toBe("anthropic");
  });

  test("inconnu, préfixe trompeur ou id nu → null", () => {
    expect(fournisseurDeId(catalogue, "inconnu/x")).toBe(null);
    // « opencodex/… » ne doit PAS matcher le fournisseur « opencode ».
    expect(fournisseurDeId(catalogue, "opencodex/big-pickle")).toBe(null);
    expect(fournisseurDeId(catalogue, "big-pickle")).toBe(null);
    expect(fournisseurDeId([], "opencode/x")).toBe(null);
  });
});

describe("filtrerCatalogue (curation utilisateur)", () => {
  const catalogue = parserCatalogue(REPONSE_SONDE);

  test("ne garde que les fournisseurs cochés ET non connectés", () => {
    const visibles = filtrerCatalogue(catalogue, ["opencode", "anthropic"]);
    // anthropic est connecté : visible par nature, jamais dans la section
    // catalogue (le sélecteur l'affiche à part, via les actifs).
    expect(visibles.map((f) => f.id)).toEqual(["opencode"]);
  });

  test("aucune coche → liste vide (opt-in assumé)", () => {
    expect(filtrerCatalogue(catalogue, [])).toEqual([]);
  });

  test("id inconnu ignoré, entrée non mutée", () => {
    expect(filtrerCatalogue(catalogue, ["inconnu", "hpc-ai"]).map((f) => f.id)).toEqual(["hpc-ai"]);
    expect(catalogue.map((f) => f.id)).toEqual(["opencode", "hpc-ai", "anthropic"]);
  });
});
