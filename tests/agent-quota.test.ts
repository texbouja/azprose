/**
 * Tests du diagnostic de quota passerelle (module pur, fetch injecté).
 * Corps 429 = forme réelle mesurée sur opencode.ai/zen/go/v1 (2026-08-22).
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  diagnostiquerQuota,
  estPasserelleMaison,
  urlDuMessage,
  urlPasserelle,
} from "../src/lib/agent/quota";

const CORPS_429 = {
  type: "error",
  error: {
    type: "GoUsageLimitError",
    message:
      "Weekly usage limit reached. Resets in 1 day. To continue using this model now, enable usage from your available balance: https://opencode.ai/workspace/wrk_x/go",
  },
  metadata: { workspace: "wrk_x", limitName: "weekly" },
};

describe("urlPasserelle", () => {
  test("fournisseurs maison uniquement", () => {
    expect(urlPasserelle("opencode-go")).toBe("https://opencode.ai/zen/go/v1");
    expect(urlPasserelle("opencode")).toBe("https://opencode.ai/zen/v1");
    expect(urlPasserelle("anthropic")).toBe(null);
    expect(urlPasserelle("opencode-go-factice")).toBe(null);
  });

  test("l'URL déclarée par le serveur fait foi, les constantes sont le repli", () => {
    // Ces URL appartiennent à OpenCode, pas à nous : les coder en dur était
    // le point faible. Slash final normalisé.
    expect(urlPasserelle("opencode-go", "https://miroir.example/zen/go/v1/")).toBe(
      "https://miroir.example/zen/go/v1",
    );
    expect(urlPasserelle("opencode-go", null)).toBe("https://opencode.ai/zen/go/v1");
    // Une URL déclarée ne rend PAS un fournisseur tiers diagnosticable : la
    // sonde poste une complétion de forme OpenAI, mesurée sur la maison seule.
    expect(urlPasserelle("anthropic", "https://api.anthropic.com/v1")).toBe(null);
  });

  test("estPasserelleMaison sert de garde en amont", () => {
    expect(estPasserelleMaison("opencode")).toBe(true);
    expect(estPasserelleMaison("opencode-go")).toBe(true);
    expect(estPasserelleMaison("openai")).toBe(false);
  });
});

function fetchFactice(statut: number, corps: unknown) {
  return (async () =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("diagnostiquerQuota", () => {
  const DEPS = { fournisseur: "opencode-go", modele: "ox-alpha-free", cle: "sk-x" };

  test("429 → refus, avec le message verbatim et l'URL citée", async () => {
    const v = await diagnostiquerQuota({ ...DEPS, fetchImpl: fetchFactice(429, CORPS_429) });
    expect(v.etat).toBe("refus");
    expect(v.message).toContain("Weekly usage limit reached");
    expect(v.message).toContain("Resets in 1 day");
    expect(v.url).toBe("https://opencode.ai/workspace/wrk_x/go");
  });

  test("200 → VÉRIFIÉ SAIN, ce qui n'est pas la même chose que « rien à dire »", async () => {
    const v = await diagnostiquerQuota({ ...DEPS, fetchImpl: fetchFactice(200, { choices: [] }) });
    expect(v).toEqual({ etat: "sain" });
  });

  test("429 sans motif → indéterminé, jamais « sain »", async () => {
    const v = await diagnostiquerQuota({ ...DEPS, fetchImpl: fetchFactice(429, { error: {} }) });
    expect(v).toEqual({ etat: "indetermine", raison: "reponse-inattendue" });
  });

  test("sans clé → indéterminé et AUCUN appel", async () => {
    let appele = false;
    const v = await diagnostiquerQuota({
      ...DEPS,
      cle: null,
      fetchImpl: (() => {
        appele = true;
        return Promise.resolve(new Response("{}", { status: 429 }));
      }) as unknown as typeof fetch,
    });
    expect(v).toEqual({ etat: "indetermine", raison: "cle-introuvable" });
    expect(appele).toBe(false);
  });

  test("passerelle injoignable → indéterminé, PAS un feu vert", async () => {
    // Le trou corrigé : ce cas rendait null, indiscernable de « sain ».
    const v = await diagnostiquerQuota({
      ...DEPS,
      fetchImpl: (() => Promise.reject(new Error("ENETUNREACH"))) as unknown as typeof fetch,
    });
    expect(v).toEqual({ etat: "indetermine", raison: "passerelle-injoignable" });
  });

  test("fournisseur tiers → hors-sujet, pas d'appel du tout", async () => {
    let appele = false;
    const v = await diagnostiquerQuota({
      fournisseur: "openai",
      modele: "gpt-5.3",
      cle: "sk-x",
      fetchImpl: (() => {
        appele = true;
        return Promise.resolve(new Response("{}", { status: 429 }));
      }) as unknown as typeof fetch,
    });
    expect(v).toEqual({ etat: "hors-sujet" });
    expect(appele).toBe(false);
  });

  test("la sonde part bien sur l'URL déclarée par le serveur", async () => {
    let vue = "";
    await diagnostiquerQuota({
      ...DEPS,
      urlDeclaree: "https://miroir.example/zen/go/v1",
      fetchImpl: ((url: string) => {
        vue = url;
        return Promise.resolve(new Response("{}", { status: 200 }));
      }) as unknown as typeof fetch,
    });
    expect(vue).toBe("https://miroir.example/zen/go/v1/chat/completions");
  });
});

describe("urlDuMessage (lien du pied de panneau)", () => {
  test("extrait l'URL d'espace de travail du 429 verbatim", () => {
    expect(urlDuMessage(CORPS_429.error.message)).toBe(
      "https://opencode.ai/workspace/wrk_x/go",
    );
  });

  test("la ponctuation de fin de phrase ne fait pas partie du lien", () => {
    expect(urlDuMessage("Voir https://opencode.ai/workspace.")).toBe(
      "https://opencode.ai/workspace",
    );
  });

  test("message sans URL → undefined (pas de bouton « Ouvrir »)", () => {
    expect(urlDuMessage("Weekly usage limit reached.")).toBeUndefined();
  });
});
