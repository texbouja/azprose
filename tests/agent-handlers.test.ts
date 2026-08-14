/**
 * Tests des handlers agent→client (phase 4) — module PUR, fonctions fs
 * injectées (P6 : jamais mock.module). Point critique : un refus de
 * permission doit renvoyer une réponse ACP VALIDE (`outcome: cancelled`),
 * jamais une absence de réponse — l'agent attend et se figerait.
 */
// @ts-nocheck
import { expect, test } from "bun:test";
import { createAgentHandlers } from "../src/lib/agent/handlers";

const fsDeps = () => {
  const files = new Map<string, string>([["/vault/cours/suites.md", "# Suites\nContenu Boujaida"]]);
  return {
    files,
    readFile: async (p: string) => {
      const c = files.get(p);
      if (c === undefined) throw new Error(`fichier absent : ${p}`);
      return c;
    },
    writeFile: async (p: string, c: string) => { files.set(p, c); },
  };
};

const PERMISSION_PARAMS = {
  sessionId: "ses_1",
  toolCall: { toolCallId: "call_1", title: "write", locations: [{ path: "/vault/cours/suites.md" }] },
  options: [
    { optionId: "opt_once", name: "Allow once", kind: "allow_once" },
    { optionId: "opt_always", name: "Always", kind: "allow_always" },
    { optionId: "opt_reject", name: "Reject", kind: "reject_once" },
  ],
};

test("fs/read_text_file lit depuis le dep injecté", async () => {
  const deps = fsDeps();
  const h = createAgentHandlers(deps);
  const res = await h.handle({ method: "fs/read_text_file", id: 1, params: { path: "/vault/cours/suites.md" } });
  expect(res).toEqual({ content: "# Suites\nContenu Boujaida" });
});

test("fs/read_text_file sans path lève une erreur (le transport répondra -32603)", async () => {
  const h = createAgentHandlers(fsDeps());
  await expect(h.handle({ method: "fs/read_text_file", id: 1, params: {} })).rejects.toThrow(/path/);
});

test("fs/write_text_file écrit sur disque et renvoie null", async () => {
  const deps = fsDeps();
  const h = createAgentHandlers(deps);
  const res = await h.handle({
    method: "fs/write_text_file", id: 1,
    params: { path: "/vault/notes/benali.md", content: "# Brouillon BENALI" },
  });
  expect(res).toBeNull();
  expect(deps.files.get("/vault/notes/benali.md")).toBe("# Brouillon BENALI");
});

test("permission : choix « une fois » → selected + optionId", async () => {
  const h = createAgentHandlers(fsDeps(), async () => "opt_once");
  const res = await h.handle({ method: "session/request_permission", id: 1, params: PERMISSION_PARAMS });
  expect(res).toEqual({ outcome: { outcome: "selected", optionId: "opt_once" } });
});

test("permission : annulation (null) → réponse VALIDE cancelled, jamais d'absence", async () => {
  const h = createAgentHandlers(fsDeps(), async () => null);
  const res = await h.handle({ method: "session/request_permission", id: 1, params: PERMISSION_PARAMS });
  expect(res).toEqual({ outcome: { outcome: "cancelled" } });
});

test("permission : sans prompt câblé → cancelled (jamais suspendu)", async () => {
  const h = createAgentHandlers(fsDeps());
  const res = await h.handle({ method: "session/request_permission", id: 1, params: PERMISSION_PARAMS });
  expect(res).toEqual({ outcome: { outcome: "cancelled" } });
});

test("permission : « toujours » est mémorisé POUR LA SESSION (D12)", async () => {
  let prompts = 0;
  const h = createAgentHandlers(fsDeps(), async () => { prompts++; return "opt_always"; });
  await h.handle({ method: "session/request_permission", id: 1, params: PERMISSION_PARAMS });
  // Seconde demande pour le MÊME titre d'outil : pas de nouveau prompt.
  const res = await h.handle({ method: "session/request_permission", id: 2, params: PERMISSION_PARAMS });
  expect(prompts).toBe(1);
  expect(res).toEqual({ outcome: { outcome: "selected", optionId: "opt_always" } });
});

test("permission : « toujours » est par appel d'outil, pas global", async () => {
  let prompts = 0;
  const h = createAgentHandlers(fsDeps(), async () => { prompts++; return "opt_always"; });
  await h.handle({ method: "session/request_permission", id: 1, params: PERMISSION_PARAMS });
  const autreOutil = {
    ...PERMISSION_PARAMS,
    toolCall: { ...PERMISSION_PARAMS.toolCall, title: "bash" },
  };
  await h.handle({ method: "session/request_permission", id: 2, params: autreOutil });
  expect(prompts).toBe(2);
});

test("méthode inconnue → undefined (le transport renvoie -32601)", async () => {
  const h = createAgentHandlers(fsDeps());
  const res = await h.handle({ method: "terminal/create", id: 1, params: {} });
  expect(res).toBeUndefined();
});
