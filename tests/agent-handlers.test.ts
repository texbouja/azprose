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
  toolCall: {
    toolCallId: "call_1",
    // Forme RÉELLE (phase 0c) : title = chemin cible, kind = famille d'outil.
    title: "/vault/cours/suites.md",
    kind: "edit",
    locations: [{ path: "/vault/cours/suites.md" }],
    content: [{ type: "diff", path: "/vault/cours/suites.md", oldText: "", newText: "# Exercice\n" }],
  },
  options: [
    { optionId: "once", kind: "allow_once", name: "Allow once" },
    { optionId: "always", kind: "allow_always", name: "Always allow" },
    { optionId: "reject", kind: "reject_once", name: "Reject" },
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
  const h = createAgentHandlers(fsDeps(), async () => "once");
  const res = await h.handle({ method: "session/request_permission", id: 1, params: PERMISSION_PARAMS });
  expect(res).toEqual({ outcome: { outcome: "selected", optionId: "once" } });
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
  const h = createAgentHandlers(fsDeps(), async () => { prompts++; return "always"; });
  await h.handle({ method: "session/request_permission", id: 1, params: PERMISSION_PARAMS });
  // Seconde demande pour la MÊME famille d'outil (kind "edit"), autre
  // fichier : pas de nouveau prompt — la clé est `kind`, pas le chemin.
  const autreFichier = {
    ...PERMISSION_PARAMS,
    toolCall: { ...PERMISSION_PARAMS.toolCall, title: "/vault/notes/el-amrani.md" },
  };
  const res = await h.handle({ method: "session/request_permission", id: 2, params: autreFichier });
  expect(prompts).toBe(1);
  expect(res).toEqual({ outcome: { outcome: "selected", optionId: "always" } });
});

test("permission : « toujours » est par famille d'outil (kind), pas global", async () => {
  let prompts = 0;
  const h = createAgentHandlers(fsDeps(), async () => { prompts++; return "always"; });
  await h.handle({ method: "session/request_permission", id: 1, params: PERMISSION_PARAMS });
  const autreFamille = {
    ...PERMISSION_PARAMS,
    toolCall: { ...PERMISSION_PARAMS.toolCall, kind: "bash", title: "ls" },
  };
  await h.handle({ method: "session/request_permission", id: 2, params: autreFamille });
  expect(prompts).toBe(2);
});

test("permission : le diff est transmis au prompt (objet de la décision)", async () => {
  let received: unknown = null;
  const h = createAgentHandlers(fsDeps(), async (req) => { received = req; return "once"; });
  await h.handle({ method: "session/request_permission", id: 1, params: PERMISSION_PARAMS });
  const r = received as { diff?: { newText?: string }; kind?: string };
  expect(r.kind).toBe("edit");
  expect(r.diff?.newText).toContain("Exercice");
});

test("méthode inconnue → undefined (le transport renvoie -32601)", async () => {
  const h = createAgentHandlers(fsDeps());
  const res = await h.handle({ method: "terminal/create", id: 1, params: {} });
  expect(res).toBeUndefined();
});
