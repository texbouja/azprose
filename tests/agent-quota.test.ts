/**
 * Tests du diagnostic de quota passerelle (module pur, fetch injecté).
 * Corps 429 = forme réelle mesurée sur opencode.ai/zen/go/v1 (2026-08-22).
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  diagnostiquerQuota,
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

  test("429 → verdict avec le message verbatim de la passerelle", async () => {
    const v = await diagnostiquerQuota({
      ...DEPS,
      fetchImpl: fetchFactice(429, CORPS_429),
    });
    expect(v?.message).toContain("Weekly usage limit reached");
    expect(v?.message).toContain("Resets in 1 day");
  });

  test("200 (non bloqué) → non concluant", async () => {
    const v = await diagnostiquerQuota({
      ...DEPS,
      fetchImpl: fetchFactice(200, { choices: [] }),
    });
    expect(v).toBe(null);
  });

  test("429 sans message exploitable → non concluant", async () => {
    const v = await diagnostiquerQuota({
      ...DEPS,
      fetchImpl: fetchFactice(429, { error: {} }),
    });
    expect(v).toBe(null);
  });

  test("sans clé (fournisseur non connecté) → ni appel ni verdict", async () => {
    let appele = false;
    const v = await diagnostiquerQuota({
      fournisseur: "opencode-go",
      modele: "ox-alpha-free",
      cle: null,
      fetchImpl: (() => {
        appele = true;
        return Promise.resolve(new Response("{}", { status: 429 }));
      }) as unknown as typeof fetch,
    });
    expect(v).toBe(null);
    expect(appele).toBe(false);
  });

  test("fournisseur tiers → pas d'appel du tout", async () => {
    const v = await diagnostiquerQuota({
      fournisseur: "openai",
      modele: "gpt-5.3",
      cle: "sk-x",
      fetchImpl: fetchFactice(429, CORPS_429),
    });
    expect(v).toBe(null);
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

test("le verdict porte l'URL quand le message en cite une", async () => {
  const v = await diagnostiquerQuota({
    fournisseur: "opencode-go",
    modele: "ox-alpha-free",
    cle: "sk-x",
    fetchImpl: (async () =>
      new Response(JSON.stringify(CORPS_429), { status: 429 })) as unknown as typeof fetch,
  });
  expect(v?.url).toBe("https://opencode.ai/workspace/wrk_x/go");
});
