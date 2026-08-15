/**
 * Tests du contexte d'environnement de l'agent (instructions + config inline).
 * Module PUR — la sonde phase 0c a confirmé que OPENCODE_CONFIG_CONTENT est
 * MERGÉE avec la config globale et que permission ask remonte en ACP.
 */
// @ts-nocheck
import { expect, test } from "bun:test";
import {
  buildAgentConfig,
  buildAgentEnv,
  buildAgentInstructions,
  extractToolDiff,
} from "../src/lib/agent/context";

const ROOT = "/home/prof/vault-boujaida";

test("les instructions situent l'agent : AZprose, vault, rootPath interpolé", () => {
  const text = buildAgentInstructions(ROOT);
  expect(text).toContain("AZprose");
  expect(text).toContain(ROOT);
  expect(text).toContain("vault");
});

// ── R2 : la doctrine « instruction = comportement, outil = donnée » ────────
// Ces tests la rendent NON CONTOURNABLE. Une donnée qui reviendrait se loger
// dans les instructions les ferait rougir.

test("instructions : AUCUNE donnée du vault n'y figure", () => {
  const text = buildAgentInstructions(ROOT);
  // Le préambule et les callouts ne sont plus interpolés : ils sont servis
  // par vault_preambule_math et vault_callouts.
  expect(text).not.toContain("~~~latex");
  expect(text).not.toContain("math.preamble");
  // Plus de catalogue des fichiers .azprose/ en prose (→ outil dédié).
  expect(text).not.toContain("session.json");
  expect(text).not.toContain("csv-cache");
  // Plus de contournement par la ligne de commande : l'accès légitime est
  // un outil, et l'accès texte est refusé par la config.
  expect(text).not.toContain("sqlite3");
});

test("instructions : les outils sont NOMMÉS, avec la consigne de les appeler", () => {
  const text = buildAgentInstructions(ROOT);
  for (const outil of [
    "vault_preambule_math",
    "vault_callouts",
    "vault_donnees_description",
    "base_interroger",
  ]) {
    expect(text).toContain(outil);
  }
  // Un modèle n'appelle un outil que s'il sait qu'il fait autorité.
  expect(text).toContain("fait\nfoi");
});

test("instructions : les conventions d'ÉCRITURE restent (comportement, pas donnée)", () => {
  const text = buildAgentInstructions(ROOT);
  expect(text).toContain("[[wikilinks]]");
  expect(text).toContain("> [!type]");
  expect(text).toContain("MathJax");
});

test("la config déclare les instructions et external_directory: ask", () => {
  const cfg = buildAgentConfig("/appdata/agent-instructions.md") as any;
  expect(cfg.instructions).toEqual(["/appdata/agent-instructions.md"]);
  expect(cfg.permission.external_directory).toBe("ask");
});

test("la config INTERDIT l'accès texte à data.db (règle, pas supplique)", () => {
  const cfg = buildAgentConfig("/appdata/agent-instructions.md") as any;
  // Lecture ET écriture : ouvrir un fichier SQLite avec un outil texte le
  // corrompt, quel que soit le sens.
  for (const clef of ["read", "edit"] as const) {
    expect(cfg.permission[clef][".azprose/data.db"]).toBe("deny");
    expect(cfg.permission[clef]["**/.azprose/data.db"]).toBe("deny");
  }
});

test("l'env porte OPENCODE_CONFIG_CONTENT en JSON valide", () => {
  const env = buildAgentEnv("/appdata/agent-instructions.md");
  const parsed = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
  expect(parsed.instructions).toEqual(["/appdata/agent-instructions.md"]);
});

test("extractToolDiff lit le bloc content type=diff (forme phase 0c)", () => {
  const params = {
    toolCall: {
      toolCallId: "call_1",
      content: [{ type: "diff", path: "/vault/suites.md", oldText: "# Suites", newText: "# Suites\nExercice BENALI" }],
      rawInput: { diff: "Index: /vault/suites.md\n@@ -1 +1,2 @@\n" },
    },
  };
  const diff = extractToolDiff(params);
  expect(diff?.path).toBe("/vault/suites.md");
  expect(diff?.newText).toContain("BENALI");
  expect(diff?.unified).toContain("Index:");
});

test("extractToolDiff fonctionne aussi sur la forme tool_call_update (content au premier niveau)", () => {
  const diff = extractToolDiff({
    content: [{ type: "diff", path: "/vault/notes/el-moujahid.md", oldText: "", newText: "nouveau" }],
  });
  expect(diff?.path).toBe("/vault/notes/el-moujahid.md");
});

test("extractToolDiff : pas de diff → undefined, jamais d'erreur", () => {
  expect(extractToolDiff({ toolCall: { content: [{ type: "content" }] } })).toBeUndefined();
  expect(extractToolDiff(undefined)).toBeUndefined();
  expect(extractToolDiff(null)).toBeUndefined();
});
