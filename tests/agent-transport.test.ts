/**
 * Tests du transport ACP — le VRAI transport, avec les appels Tauri injectés
 * (P6 : jamais mock.module).
 *
 * Pourquoi ce fichier existe : `agent-client.test.ts` valide la conversion en
 * `AgentNotInstalledError` en injectant un transport FACTICE — donc en sautant
 * précisément le code qui perdait le rejet du spawn. Ici on fait échouer
 * `acp_spawn` lui-même.
 */
// @ts-nocheck
import { expect, test } from "bun:test";
import { createAcpTransport } from "../src/lib/agent/transport";
import { createAgentClient } from "../src/lib/agent/client";

/** Faux pont Tauri : journalise les commandes, rend les désabonnements. */
function faussesDeps(options: { spawn?: Error } = {}) {
  const commandes: Array<{ nom: string; args: Record<string, unknown> }> = [];
  const ecouteurs = new Map<string, (charge: unknown) => void>();
  let desabonnements = 0;

  return {
    commandes,
    get desabonnements() { return desabonnements; },
    /** Émettre un événement du pont vers le transport. */
    emettre(nom: string, charge: unknown) { ecouteurs.get(nom)?.(charge); },
    deps: {
      async invoquer(nom: string, args: Record<string, unknown>) {
        commandes.push({ nom, args });
        if (nom === "acp_spawn" && options.spawn) throw options.spawn;
        return null;
      },
      async ecouter(nom: string, cb: (charge: unknown) => void) {
        ecouteurs.set(nom, cb);
        return () => { desabonnements += 1; ecouteurs.delete(nom); };
      },
    },
  };
}

test("sendRequest propage le rejet du spawn au lieu d'attendre son délai", async () => {
  const pont = faussesDeps({
    spawn: new Error("failed to spawn opencode: No such file or directory (os error 2)"),
  });
  const t = createAcpTransport("agent-test", "opencode", ["acp"], undefined, pont.deps);
  const debut = Date.now();
  // Délai VOLONTAIREMENT court : s'il s'écoulait, c'est que le rejet du spawn
  // est de nouveau avalé (défaut D1).
  await expect(t.sendRequest("initialize", {}, 5_000)).rejects.toThrow(/failed to spawn/);
  expect(Date.now() - debut).toBeLessThan(1_000);
});

test("un spawn manqué remonte en AgentNotInstalledError jusqu'au client", async () => {
  // Le bout en bout que le transport factice ne pouvait pas couvrir : pont
  // Rust → transport → client.
  const pont = faussesDeps({
    spawn: new Error("failed to spawn opencode: No such file or directory (os error 2)"),
  });
  const transport = createAcpTransport("agent-test", "opencode", ["acp"], undefined, pont.deps);
  const client = createAgentClient({ cwd: "/vault", transport });
  await expect(client.start()).rejects.toMatchObject({ name: "AgentNotInstalledError" });
});

test("sendRequest résout sur la réponse acheminée par acp://output", async () => {
  const pont = faussesDeps();
  const t = createAcpTransport("agent-test", "opencode", ["acp"], undefined, pont.deps);
  const attente = t.sendRequest("initialize", { protocolVersion: 1 });
  // L'écriture n'a lieu qu'après le spawn et ses trois abonnements.
  await new Promise((r) => setTimeout(r, 0));
  const ecriture = pont.commandes.find((c) => c.nom === "acp_write");
  expect(ecriture).toBeTruthy();
  const trame = JSON.parse(ecriture.args.content as string);
  expect(trame.method).toBe("initialize");
  pont.emettre("acp://output", {
    id: "agent-test",
    data: JSON.stringify({ jsonrpc: "2.0", id: trame.id, result: { protocolVersion: 1 } }),
  });
  expect(await attente).toEqual({ protocolVersion: 1 });
});

test("kill() désabonne les trois écouteurs Tauri", async () => {
  const pont = faussesDeps();
  const t = createAcpTransport("agent-test", "opencode", ["acp"], undefined, pont.deps);
  t.sendNotification("session/cancel", { sessionId: "s" });
  // Attendre le spawn (l'abonnement se fait dedans).
  await new Promise((r) => setTimeout(r, 0));
  expect(pont.desabonnements).toBe(0);
  await t.kill();
  // Trois écouteurs : output, stderr, exit. Sans ça, l'id de processus étant
  // constant, ils captaient les événements du panneau suivant.
  expect(pont.desabonnements).toBe(3);
  expect(pont.commandes.some((c) => c.nom === "acp_kill")).toBe(true);
});

test("la sortie du processus rejette les requêtes en vol et se désabonne", async () => {
  const pont = faussesDeps();
  const t = createAcpTransport("agent-test", "opencode", ["acp"], undefined, pont.deps);
  const attente = t.sendRequest("session/prompt", {}, 60_000);
  await new Promise((r) => setTimeout(r, 0));
  // Forme mesurée : `acp://exit` porte l'id NU (pas {id, data}).
  pont.emettre("acp://exit", "agent-test");
  await expect(attente).rejects.toThrow(/exited/);
  expect(pont.desabonnements).toBe(3);
  // Transport mort : plus aucune requête n'est armée.
  await expect(t.sendRequest("initialize", {}, 60_000)).rejects.toThrow(/exited/);
});

test("un échec d'écriture rejette sans attendre le délai", async () => {
  const pont = faussesDeps();
  const deps = {
    ...pont.deps,
    async invoquer(nom: string, args: Record<string, unknown>) {
      if (nom === "acp_write") throw new Error("stdin fermé");
      return pont.deps.invoquer(nom, args);
    },
  };
  const t = createAcpTransport("agent-test", "opencode", ["acp"], undefined, deps);
  await expect(t.sendRequest("initialize", {}, 60_000)).rejects.toThrow(/stdin fermé/);
});
