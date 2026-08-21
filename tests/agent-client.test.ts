/**
 * Tests du client agent (phase 2) — module PUR, transport injecté (P6 :
 * jamais mock.module, qui est process-global). Le faux transport capture les
 * émissions et simule les réponses/notifications de l'agent.
 */
// @ts-nocheck
import { afterAll, expect, test } from "bun:test";
import { createAgentClient, resolveAgentBinary } from "../src/lib/agent/client";
import type { AcpTransport } from "../src/lib/agent/transport";

/** Faux transport : capture les requêtes émises, simule les réponses. */
function fakeTransport(script: Record<string, unknown> = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const notifHandlers: Array<(method: string, params: unknown) => void> = [];
  let serverReqHandler: unknown = null;
  let killed = false;

  const transport: AcpTransport & {
    sent: typeof sent;
    emit: (method: string, params: unknown) => void;
    readonly killed: boolean;
    readonly serverReqHandler: unknown;
  } = {
    sent,
    sendRequest(method: string, params?: unknown) {
      sent.push({ method, params });
      const response = script[method];
      if (response instanceof Error) return Promise.reject(response);
      if (response !== undefined) return Promise.resolve(response);
      return Promise.resolve({});
    },
    sendNotification(method: string, params?: unknown) {
      sent.push({ method, params, notification: true });
    },
    respond() {},
    respondError() {},
    onNotification(handler) {
      notifHandlers.push(handler);
      return () => {
        const i = notifHandlers.indexOf(handler);
        if (i >= 0) notifHandlers.splice(i, 1);
      };
    },
    onServerRequest(handler) { serverReqHandler = handler; },
    async kill() { killed = true; },
    emit(method, params) {
      for (const h of notifHandlers) h(method, params);
    },
    get killed() { return killed; },
    get serverReqHandler() { return serverReqHandler; },
  };
  return transport;
}

const INIT_RESULT = {
  protocolVersion: 1,
  agentInfo: { name: "OpenCode", version: "1.18.11" },
  agentCapabilities: { loadSession: true },
  authMethods: [],
};

test("start() envoie initialize SANS capacités par défaut (P3)", async () => {
  const t = fakeTransport({ initialize: INIT_RESULT });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  const result = await client.start();
  expect(t.sent[0].method).toBe("initialize");
  expect(t.sent[0].params.protocolVersion).toBe(1);
  expect(t.sent[0].params.clientCapabilities).toEqual({});
  expect(t.sent[0].params.clientInfo.name).toBe("AZprose");
  expect(result.agentInfo.version).toBe("1.18.11");
});

test("start() transmet les capacités déclarées explicitement", async () => {
  const t = fakeTransport({ initialize: INIT_RESULT });
  const client = createAgentClient({
    cwd: "/vault",
    transport: t,
    capabilities: { fs: { readTextFile: true, writeTextFile: true } },
  });
  await client.start();
  expect(t.sent[0].params.clientCapabilities).toEqual({
    fs: { readTextFile: true, writeTextFile: true },
  });
});

test("start() convertit un échec de spawn en AgentNotInstalledError", async () => {
  const t = fakeTransport({
    initialize: new Error("failed to spawn opencode: No such file or directory (os error 2)"),
  });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await expect(client.start()).rejects.toMatchObject({ name: "AgentNotInstalledError" });
});

test("newSession() exige start() au préalable", async () => {
  const client = createAgentClient({ cwd: "/vault", transport: fakeTransport() });
  await expect(client.newSession("/vault")).rejects.toThrow(/start/);
});

test("newSession() envoie cwd = racine du vault et mcpServers vide (D13)", async () => {
  const t = fakeTransport({
    initialize: INIT_RESULT,
    "session/new": { sessionId: "ses_test123" },
  });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await client.start();
  const ses = await client.newSession("/vault");
  expect(ses.sessionId).toBe("ses_test123");
  expect(t.sent[1]).toMatchObject({
    method: "session/new",
    params: { cwd: "/vault", mcpServers: [] },
  });
});

test("newSession() rend les configOptions déclarées par l'agent (ACP v1)", async () => {
  // Forme réelle mesurée en sonde (2026-08-21) : session/new ne rend que
  // {sessionId, configOptions} — c'est LA source du sélecteur de modèle.
  const options = [
    {
      id: "model",
      category: "model",
      type: "select",
      currentValue: "opencode/big-pickle",
      options: [{ value: "opencode/big-pickle", name: "OpenCode/Big Pickle" }],
    },
  ];
  const t = fakeTransport({
    initialize: INIT_RESULT,
    "session/new": { sessionId: "ses_1", configOptions: options },
  });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await client.start();
  const ses = await client.newSession("/vault");
  expect(ses.configOptions).toEqual(options);
});

test("newSession() : agent sans configOptions → tableau vide, jamais d'erreur", async () => {
  const t = fakeTransport({
    initialize: INIT_RESULT,
    "session/new": { sessionId: "ses_1" },
  });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await client.start();
  const ses = await client.newSession("/vault");
  expect(ses.configOptions).toEqual([]);
});

test("prompt() envoie un bloc texte et retourne le stopReason", async () => {
  const t = fakeTransport({
    initialize: INIT_RESULT,
    "session/new": { sessionId: "ses_1" },
    "session/prompt": { stopReason: "end_turn" },
  });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await client.start();
  await client.newSession("/vault");
  const result = await client.prompt("ses_1", "Rédige un exercice pour Boujaida");
  expect(result.stopReason).toBe("end_turn");
  expect(t.sent[2].params).toEqual({
    sessionId: "ses_1",
    prompt: [{ type: "text", text: "Rédige un exercice pour Boujaida" }],
  });
});

test("cancel() envoie session/cancel en notification (sans réponse attendue)", async () => {
  const t = fakeTransport({ initialize: INIT_RESULT, "session/new": { sessionId: "ses_1" } });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await client.start();
  await client.newSession("/vault");
  await client.cancel("ses_1");
  const notif = t.sent.find((m) => m.method === "session/cancel");
  expect(notif).toBeTruthy();
  expect(notif.notification).toBe(true);
  expect(notif.params).toEqual({ sessionId: "ses_1" });
});

// ── Changement de modèle ─────────────────────────────────────────────────────
// Chemin DOCUMENTÉ d'abord (`session/set_config_option`, ACP v1 stabilisé —
// la réponse porte l'état complet des options), repli historique
// `session/set_model` pour les binaires sans configOptions.

test("setConfigOption() envoie sessionId, configId et value", async () => {
  const t = fakeTransport({
    initialize: INIT_RESULT,
    "session/set_config_option": { configOptions: [{ id: "model", currentValue: "a/b" }] },
  });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await client.start();
  const opts = await client.setConfigOption("ses_1", "model", "a/b");
  expect(t.sent[1]).toMatchObject({
    method: "session/set_config_option",
    params: { sessionId: "ses_1", configId: "model", value: "a/b" },
  });
  // La spec garantit l'état COMPLET en réponse : l'appelant s'en sert pour
  // rafraîchir son affichage (options dépendantes comprises).
  expect(opts).toEqual([{ id: "model", currentValue: "a/b" }]);
});

test("setConfigOption() : réponse sans état → tableau vide, jamais d'erreur", async () => {
  const t = fakeTransport({ initialize: INIT_RESULT, "session/set_config_option": {} });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await client.start();
  expect(await client.setConfigOption("ses_1", "model", "a/b")).toEqual([]);
});

test("setModel() envoie session/set_model avec sessionId et modelId (repli)", async () => {
  const t = fakeTransport({ initialize: INIT_RESULT, "session/set_model": {} });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await client.start();
  await client.setModel("ses_1", "opencode/hy3-free");
  expect(t.sent[1]).toMatchObject({
    method: "session/set_model",
    params: { sessionId: "ses_1", modelId: "opencode/hy3-free" },
  });
});

test("setModel() propage l'erreur « model not found » du binaire", async () => {
  // Forme mesurée : -32602 « Invalid params: model not found: X/Y » — le
  // sélecteur s'en sert pour distinguer une saisie invalide d'une méthode absente.
  const t = fakeTransport({
    initialize: INIT_RESULT,
    "session/set_model": new Error("Invalid params: model not found: inconnu/nimporte"),
  });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await client.start();
  await expect(client.setModel("ses_1", "inconnu/nimporte")).rejects.toThrow(/model not found/);
});

test("onUpdate ne transmet que session/update, dépliée", async () => {
  const t = fakeTransport({ initialize: INIT_RESULT });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  const updates: unknown[] = [];
  client.onUpdate((u) => updates.push(u));
  t.emit("session/update", {
    sessionId: "ses_1",
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "bon" } },
  });
  t.emit("window/logMessage", { message: "bruit" });
  expect(updates).toEqual([
    { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "bon" } },
  ]);
});

test("le désabonnement d'onUpdate coupe le flux", async () => {
  const t = fakeTransport({ initialize: INIT_RESULT });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  const updates: unknown[] = [];
  const off = client.onUpdate((u) => updates.push(u));
  t.emit("session/update", { sessionId: "s", update: { sessionUpdate: "a" } });
  off();
  t.emit("session/update", { sessionId: "s", update: { sessionUpdate: "b" } });
  expect(updates).toHaveLength(1);
});

test("stop() tue le processus via le transport", async () => {
  const t = fakeTransport({ initialize: INIT_RESULT });
  const client = createAgentClient({ cwd: "/vault", transport: t });
  await client.start();
  await client.stop();
  expect(t.killed).toBe(true);
});

test("onServerRequest est câblé sur le transport (P4)", () => {
  const t = fakeTransport();
  const handler = () => ({});
  createAgentClient({ cwd: "/vault", transport: t, onServerRequest: handler });
  expect(t.serverReqHandler).toBe(handler);
});

// ── Résolution du binaire (D6) ─────────────────────────────────────────────
// localStorage est absent du runtime bun brut : le try/catch de
// resolveAgentBinary doit retomber sur le PATH sans casser.

test("resolveAgentBinary : défaut PATH, surcharge directe prioritaire", () => {
  expect(resolveAgentBinary()).toBe("opencode");
  expect(resolveAgentBinary("  ")).toBe("opencode");
  expect(resolveAgentBinary("/usr/local/bin/opencode-beta")).toBe("/usr/local/bin/opencode-beta");
});

test("resolveAgentBinary : le réglage persisté prime sur le PATH", () => {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  };
  store.set("mdview.agent.binaryPath", JSON.stringify("/opt/opencode-2/bin/opencode"));
  expect(resolveAgentBinary()).toBe("/opt/opencode-2/bin/opencode");
  // Mauvais contenu persisté → repli PATH, jamais d'erreur.
  store.set("mdview.agent.binaryPath", "{invalide");
  expect(resolveAgentBinary()).toBe("opencode");
});

// Leçon phase 1.3 : l'isolation de globalThis entre fichiers n'est PAS
// garantie — nettoyer ce que le test a pollué.
afterAll(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
});
