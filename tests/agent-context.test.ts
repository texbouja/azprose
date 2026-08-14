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

test("les instructions expliquent le rôle de .azprose (maintenance, pas interdiction)", () => {
  const text = buildAgentInstructions(ROOT);
  expect(text).toContain(".azprose/");
  expect(text).toContain("config.json");
  expect(text).toContain("session.json");
  // data.db = SQLite binaire : le piège à déjouer est l'édition TEXTE.
  expect(text).toContain("data.db");
  expect(text).toContain("SQLite");
  expect(text).toContain("sqlite3");
});

test("la config déclare les instructions et external_directory: ask", () => {
  const cfg = buildAgentConfig("/appdata/agent-instructions.md") as any;
  expect(cfg.instructions).toEqual(["/appdata/agent-instructions.md"]);
  expect(cfg.permission.external_directory).toBe("ask");
  // Rien d'autre : pas de deny sur .azprose (rôle de maintenance assumé),
  // pas de ask sur edit à l'intérieur du vault (libre dedans, ask dehors).
  expect(cfg.permission.edit).toBeUndefined();
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
