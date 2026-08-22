/**
 * Tests du parsing de `GET /config/providers` — la source des infos LOCALES
 * d'un fournisseur (clé, URL d'API). Formes MESURÉES le 2026-08-22 sur
 * OpenCode : `opencode-go` range sa clé dans `key`, `opencode` dans
 * `options.apiKey`. C'est cette asymétrie qui rendait le diagnostic de
 * passerelle muet pour tous les modèles `opencode/*`.
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import { parserConfigProviders } from "../src/lib/agent/config-providers";

const REPONSE = {
  providers: [
    {
      id: "opencode-go",
      name: "OpenCode Go",
      source: "api",
      env: ["OPENCODE_API_KEY"],
      key: "sk-go-boujaida",
      options: {},
      models: {
        "kimi-k2.7-code": {
          id: "kimi-k2.7-code",
          providerID: "opencode-go",
          api: { id: "kimi-k2.7-code", url: "https://opencode.ai/zen/go/v1" },
        },
      },
    },
    {
      id: "opencode",
      name: "OpenCode",
      source: "api",
      // Pas de `key` ici : la clé vit dans les options.
      options: { apiKey: "sk-zen-elmoujahid" },
      models: {
        "big-pickle": { api: { url: "https://opencode.ai/zen/v1/" } },
      },
    },
  ],
};

describe("parserConfigProviders", () => {
  test("trouve la clé dans les DEUX formes déclarées par le serveur", () => {
    const carte = parserConfigProviders(REPONSE);
    expect(carte.get("opencode-go")?.cle).toBe("sk-go-boujaida");
    // Le cas qui manquait : sans lui, aucun modèle opencode/* n'était vérifié.
    expect(carte.get("opencode")?.cle).toBe("sk-zen-elmoujahid");
  });

  test("rend l'URL d'API déclarée, slash final normalisé", () => {
    const carte = parserConfigProviders(REPONSE);
    expect(carte.get("opencode-go")?.urlApi).toBe("https://opencode.ai/zen/go/v1");
    expect(carte.get("opencode")?.urlApi).toBe("https://opencode.ai/zen/v1");
  });

  test("fournisseur non connecté : clé null, jamais de chaîne vide", () => {
    const carte = parserConfigProviders({
      providers: [{ id: "anthropic", key: "", options: { apiKey: "" }, models: {} }],
    });
    expect(carte.get("anthropic")).toEqual({ id: "anthropic", cle: null, urlApi: null });
  });

  test("défensif : réponse absente, déchets, doublons", () => {
    expect(parserConfigProviders(undefined).size).toBe(0);
    expect(parserConfigProviders({}).size).toBe(0);
    expect(parserConfigProviders({ providers: "pas-un-tableau" }).size).toBe(0);
    const carte = parserConfigProviders({
      providers: [null, 42, {}, { id: "a", key: "k1" }, { id: "a", key: "k2" }],
    });
    expect(carte.size).toBe(1);
    expect(carte.get("a")?.cle).toBe("k1"); // le premier gagne
  });

  test("modèles sans api.url → urlApi null (le repli en dur prendra la main)", () => {
    const carte = parserConfigProviders({
      providers: [{ id: "x", key: "k", models: { m1: {}, m2: { api: {} } } }],
    });
    expect(carte.get("x")?.urlApi).toBeNull();
  });
});
