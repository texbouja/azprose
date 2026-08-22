/**
 * Tests du catalogue complet des fournisseurs — parsing de `GET /provider`
 * (serveur headless OpenCode, voie documentée) + tri d'affichage + recherche
 * du fournisseur d'un modèle. Formes calquées sur la sonde du 2026-08-21
 * (OpenCode 1.18.11, 193 fournisseurs à charge réelle).
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  decouperIdModele,
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
  test("parse la forme mesurée : ordre du serveur conservé", () => {
    const catalogue = parserCatalogue(REPONSE_SONDE);
    expect(catalogue.map((f) => f.id)).toEqual(["opencode", "hpc-ai", "anthropic"]);
  });

  test("le catalogue est PUREMENT STATIQUE : pas d'état de connexion dedans", () => {
    // L'état de connexion est volatil et le catalogue se persiste : les
    // mélanger obligeait à écrire une logique d'invalidation. Il vient
    // désormais des configOptions de la session vivante.
    const [opencode] = parserCatalogue(REPONSE_SONDE);
    expect(Object.keys(opencode).sort()).toEqual(["id", "modeles", "nom"]);
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

  test("le champ `connected` de la réponse est délibérément ignoré", () => {
    const catalogue = parserCatalogue({ all: [{ id: "a" }], connected: ["a"] });
    expect(catalogue[0]).toEqual({ id: "a", nom: "a", modeles: [] });
  });
});

describe("trierCatalogue (ordre de repos du menu)", () => {
  test("connectés d'abord, puis ordre de popularité (maison, célébrités, agrégateurs)", () => {
    // Les connectés viennent de l'APPELANT (configOptions de la session),
    // plus d'un drapeau porté par l'entrée.
    const trié = trierCatalogue(parserCatalogue(REPONSE_SONDE), new Set(["anthropic"]));
    expect(trié.map((f) => f.id)).toEqual(["anthropic", "opencode", "hpc-ai"]);
  });

  test("sans ensemble de connectés : popularité seule (catalogue relu du disque)", () => {
    const trié = trierCatalogue(parserCatalogue(REPONSE_SONDE));
    expect(trié.map((f) => f.id)).toEqual(["opencode", "anthropic", "hpc-ai"]);
  });

  test("ordre imposé des célébrités ; égalité de nom départagée par id", () => {
    const trié = trierCatalogue([
      { id: "zeta", nom: "Zorro", connecte: false, modeles: [] },
      { id: "openai", nom: "OpenAI", connecte: false, modeles: [] },
      { id: "deepseek", nom: "DeepSeek", connecte: false, modeles: [] },
      { id: "anthropic", nom: "Anthropic", connecte: false, modeles: [] },
    ]);
    // Ordre imposé (opencode absent de l'entrée) : openai, anthropic,
    // deepseek — zeta inclassable ferme la marche.
    expect(trié.map((f) => f.id)).toEqual(["openai", "anthropic", "deepseek", "zeta"]);
  });

  test("la famille reste groupée : variantes officielles derrière leur éditeur", () => {
    const trié = trierCatalogue([
      { id: "mistral", nom: "Mistral", connecte: false, modeles: [] },
      { id: "google-vertex-anthropic", nom: "Vertex Anthropic", connecte: false, modeles: [] },
      { id: "google-vertex", nom: "Vertex AI", connecte: false, modeles: [] },
      { id: "google", nom: "Google", connecte: false, modeles: [] },
      { id: "alibaba-token-plan", nom: "Alibaba Token Plan", connecte: false, modeles: [] },
      { id: "alibaba-cn", nom: "Alibaba CN", connecte: false, modeles: [] },
      { id: "moonshotai-cn", nom: "Moonshot CN", connecte: false, modeles: [] },
      { id: "zhipuai-coding-plan", nom: "Zhipu Coding Plan", connecte: false, modeles: [] },
    ]);
    // Familles groupées (google*, alibaba*, moonshotai*) ; mistral = autre
    // éditeur connu ; zhipuai-coding-plan = éditeur connu aussi (pas « zai »).
    expect(trié.map((f) => f.id)).toEqual([
      "google",
      "google-vertex",
      "google-vertex-anthropic",
      "alibaba-cn",
      "alibaba-token-plan",
      "moonshotai-cn",
      "mistral",
      "zhipuai-coding-plan",
    ]);
  });

  test("éditeurs connus avant les agrégateurs, le long tail ferme la marche", () => {
    const trié = trierCatalogue([
      { id: "inconnu-du-tail", nom: "Obscur", connecte: false, modeles: [] },
      { id: "openrouter", nom: "OpenRouter", connecte: false, modeles: [] },
      { id: "xai", nom: "xAI", connecte: false, modeles: [] },
    ]);
    expect(trié.map((f) => f.id)).toEqual(["xai", "openrouter", "inconnu-du-tail"]);
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
    const visibles = filtrerCatalogue(catalogue, ["opencode", "anthropic"], new Set(["anthropic"]));
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

describe("decouperIdModele (aide unique de découpage)", () => {
  test("coupe au PREMIER « / » — la clé peut en contenir", () => {
    expect(decouperIdModele("opencode/big-pickle")).toEqual({
      fournisseur: "opencode",
      modele: "big-pickle",
    });
    expect(decouperIdModele("hpc-ai/deepseek/deepseek-v4-flash")).toEqual({
      fournisseur: "hpc-ai",
      modele: "deepseek/deepseek-v4-flash",
    });
  });

  test("formes sans fournisseur exploitable → null", () => {
    // Le défaut corrigé : `slice(0, indexOf("/"))` rendait ici l'id amputé de
    // son dernier caractère, chaîne passée telle quelle au diagnostic.
    expect(decouperIdModele("gpt-5")).toBeNull();
    expect(decouperIdModele("/big-pickle")).toBeNull();
    expect(decouperIdModele("opencode/")).toBeNull();
    expect(decouperIdModele("")).toBeNull();
  });
});
