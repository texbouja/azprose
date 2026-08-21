/**
 * Tests du cycle de vie du serveur headless OpenCode (`serve.ts`) — la voie
 * documentée vers le catalogue complet des fournisseurs. Tout passe par des
 * dépendances injectées (règle P6 : jamais mock.module) : pont ACP simulé
 * qui émet les événements avec les formes RÉELLES de bridge.rs
 * (`acp://output` → {id, data} ; `acp://exit` → id NU).
 */
// @ts-nocheck
import { describe, expect, test } from "bun:test";
import {
  ID_SERVEUR,
  creerGestionnaireServeur,
  extraireBase,
} from "../src/lib/agent/serve";

/**
 * Pont ACP factice : enregistre les spawns/kills et permet aux tests
 * d'émettre des événements comme le ferait le vrai pont Rust.
 */
function creerFauxPont() {
  const lancements: { commande: string; args: string[] }[] = [];
  const morts: string[] = [];
  const abonnes = new Map<string, Array<(c: unknown) => void>>();
  /** Crochet appelé après chaque spawn — le test y déclenche ses émissions. */
  let surLancement: ((tentative: number) => void) | null = null;

  const deps = {
    lancer: async (_id: string, commande: string, args: string[]) => {
      lancements.push({ commande, args });
      surLancement?.(lancements.length);
    },
    tuer: async (id: string) => {
      morts.push(id);
    },
    ecouter: async (nom: string, cb: (c: unknown) => void) => {
      const arr = abonnes.get(nom) ?? [];
      arr.push(cb);
      abonnes.set(nom, arr);
      return () => {
        const i = arr.indexOf(cb);
        if (i >= 0) arr.splice(i, 1);
      };
    },
    recuperer: async (): Promise<Response> => {
      throw new TypeError("réseau coupé");
    },
  };

  return {
    deps,
    lancements,
    morts,
    emettre(nom: string, charge: unknown) {
      for (const cb of abonnes.get(nom) ?? []) cb(charge);
    },
    annoncer(tentative: number | "toujours", port: number) {
      const ligne = `opencode server listening on http://127.0.0.1:${port}`;
      const declencher = () =>
        // Abonnement AVANT lancer dans attendreAnnonce → une émission
        // synchrone depuis le spawn est bien capturée.
        this.emettre("acp://output", { id: ID_SERVEUR, data: ligne });
      surLancement =
        tentative === "toujours"
          ? declencher
          : (n: number) => {
              if (n === tentative) declencher();
            };
    },
    faireSortir() {
      surLancement = () => queueMicrotask(() => this.emettre("acp://exit", ID_SERVEUR));
    },
  };
}

const BIN = "/usr/bin/opencode";
const ORIGINE = "http://tauri.localhost";

describe("extraireBase (annonce stdout du serveur)", () => {
  test("extrait l'URL de la ligne mesurée", () => {
    expect(extraireBase(["opencode server listening on http://127.0.0.1:4909"])).toBe(
      "http://127.0.0.1:4909",
    );
  });

  test("première annonce gagne, slash final ôté, rien sinon", () => {
    expect(
      extraireBase([
        "bruit quelconque",
        "listening on http://127.0.0.1:1/",
        "listening on http://127.0.0.1:2",
      ]),
    ).toBe("http://127.0.0.1:1");
    expect(extraireBase(["rien à voir ici"])).toBe(null);
    expect(extraireBase([])).toBe(null);
  });
});

describe("assurer (cycle de vie via le pont ACP)", () => {
  test("spawn avec --port 0 --cors origine, annonce → base ; puis cache sans re-spawn", async () => {
    const faux = creerFauxPont();
    faux.annoncer("toujours", 4910);
    const g = creerGestionnaireServeur(faux.deps as never);

    const base = await g.assurer(BIN, { origine: ORIGINE, delaiMs: 1000 });
    expect(base).toBe("http://127.0.0.1:4910");
    expect(faux.lancements).toEqual([
      { commande: BIN, args: ["serve", "--port", "0", "--cors", ORIGINE] },
    ]);

    // Deuxième appel : servi par le cache, aucun nouveau processus.
    await expect(g.assurer(BIN, { origine: ORIGINE })).resolves.toBe(base);
    expect(faux.lancements.length).toBe(1);
  });

  test("processus vivant mais muet (orphelin post-rechargement) → kill + relance qui annonce", async () => {
    const faux = creerFauxPont();
    // Tentative 1 : ne parle jamais. Tentative 2 : annonce vite.
    faux.annoncer(2, 4911);
    const g = creerGestionnaireServeur(faux.deps as never);

    const base = await g.assurer(BIN, { origine: ORIGINE, delaiMs: 150, pauseMs: 20 });
    expect(base).toBe("http://127.0.0.1:4911");
    // Le kill a bien eu lieu entre les deux tentatives (acp_kill retire la
    // session du pont : c'est CE qui permet au respawn de repartir à neuf).
    expect(faux.morts).toEqual([ID_SERVEUR]);
    expect(faux.lancements.length).toBe(2);
  });

  test("binaire cassé (sortie avant annonce) → échec rapide après relance unique", async () => {
    const faux = creerFauxPont();
    faux.faireSortir();
    const g = creerGestionnaireServeur(faux.deps as never);

    // Délai énorme : si le drapeau de sortie n'était pas traité, le test
    // expirerait (2 × délai) au lieu de finir en quelques dizaines de ms.
    await expect(g.assurer(BIN, { origine: ORIGINE, delaiMs: 60_000, pauseMs: 5 })).rejects.toThrow(
      /injoignable/,
    );
    expect(faux.lancements.length).toBe(2);
    expect(faux.morts.length).toBe(2);
  }, 3000);

  test("appels concurrents → un seul démarrage partagé", async () => {
    const faux = creerFauxPont();
    faux.annoncer("toujours", 4912);
    const g = creerGestionnaireServeur(faux.deps as never);

    const [a, b] = await Promise.all([
      g.assurer(BIN, { origine: ORIGINE }),
      g.assurer(BIN, { origine: ORIGINE }),
    ]);
    expect(a).toBe(b);
    expect(faux.lancements.length).toBe(1);
  });
});

describe("requete (GET JSON sur le serveur)", () => {
  function gestionnairePret() {
    const faux = creerFauxPont();
    faux.annoncer("toujours", 4920);
    // Réponse mutable : le test la change en cours de route (le spread
    // initial serait une copie muette, impossible à permuter après coup).
    let repondre: () => Promise<Response> = async () => new Response("", { status: 500 });
    const g = creerGestionnaireServeur({
      ...faux.deps,
      recuperer: () => repondre(),
    } as never);
    return { faux, g, definirReponse: (fn: () => Promise<Response>) => (repondre = fn) };
  }

  test("parse le JSON de la réponse", async () => {
    const { g, definirReponse } = gestionnairePret();
    definirReponse(async () => new Response(JSON.stringify({ all: [], connected: [] }), { status: 200 }));
    await expect(g.requete(BIN, "/provider")).resolves.toEqual({ all: [], connected: [] });
  });

  test("erreur HTTP → jetée telle quelle, serveur laissé en cache", async () => {
    const { faux, g, definirReponse } = gestionnairePret();
    await expect(g.requete(BIN, "/provider")).rejects.toThrow(/HTTP 500/);
    // Le serveur est vivant (il répond !) : l'appel suivant ne respawn PAS.
    definirReponse(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await g.requete(BIN, "/provider");
    expect(faux.lancements.length).toBe(1);
  });

  test("échec réseau → cache invalidé : l'appel suivant relance le serveur", async () => {
    const { faux, g, definirReponse } = gestionnairePret();
    definirReponse(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(g.requete(BIN, "/provider")).rejects.toThrow(TypeError);
    definirReponse(async () => new Response(JSON.stringify({ all: [] }), { status: 200 }));
    await g.requete(BIN, "/provider");
    expect(faux.lancements.length).toBe(2);
  });
});

describe("arreter (à la destruction du panneau)", () => {
  test("tue le processus et oublie le cache : l'appel suivant repart à neuf", async () => {
    const faux = creerFauxPont();
    faux.annoncer("toujours", 4930);
    const g = creerGestionnaireServeur(faux.deps as never);

    await g.assurer(BIN, { origine: ORIGINE });
    await g.arreter();
    expect(faux.morts).toContain(ID_SERVEUR);

    await g.assurer(BIN, { origine: ORIGINE });
    expect(faux.lancements.length).toBe(2);
  });
});
