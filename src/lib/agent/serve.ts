// Cycle de vie du serveur headless OpenCode (`opencode serve`) — la voie
// DOCUMENTÉE vers le catalogue complet des fournisseurs (`GET /provider`,
// opencode.ai/docs/server), que le contrat ACP ne peut pas donner :
// `configOptions` ne rend que l'utilisable ici et maintenant.
//
// Pourquoi passer par le pont ACP existant : `acp_spawn` est idempotent par
// id et relaie chaque ligne stdout sur `acp://output` ({id, data}) — le
// serveur annonce son URL (« … listening on http://127.0.0.1:PORT ») avec
// `--port 0`, donc sans collision de port. Zéro nouveau code Rust.
//
// Cas piège (rechargement de la webview) : un serveur orphelin tourne déjà,
// `acp_spawn` est un no-op et n'annoncera JAMAIS son port. Détection : délai
// dépassé + processus vivant → `acp_kill` (qui retire la session du pont,
// donc le respawn repart à neuf) → pause de drainage (l'`acp://exit` de
// l'orphelin tué peut arriver en retard ; il faut l'absorber AVANT de
// réarmer le drapeau de sortie, sinon la 2e tentative échouerait à tort)
// → relance unique.
//
// Formes d'événements mesurées dans bridge.rs : `acp://output` porte
// {id, data}, mais `acp://exit` porte l'id NU (chaîne) — asymétrie voulue
// côté Rust, ne pas « uniformiser » ici.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Id du processus serveur dans le pont ACP — distinct de l'agent chat. */
export const ID_SERVEUR = "agent-serve";

/** Dépendances injectables (jamais mock.module — règle P6). */
export interface DepsServeur {
  lancer(id: string, commande: string, args: string[]): Promise<void>;
  tuer(id: string): Promise<void>;
  /** S'abonner à un événement Tauri brut (charge non typée). */
  ecouter(nom: string, cb: (charge: unknown) => void): Promise<() => void>;
  recuperer: typeof fetch;
}

function depsParDefaut(): DepsServeur {
  return {
    lancer: (id, commande, args) => invoke("acp_spawn", { id, command: commande, args }),
    tuer: (id) => invoke("acp_kill", { id }),
    ecouter: (nom, cb) => listen(nom, (ev) => cb(ev.payload)),
    recuperer: (...a: Parameters<typeof fetch>) => fetch(...a),
  };
}

export interface OptionsAssurer {
  /** Origine de la webview, passée en `--cors` pour que le fetch passe. */
  origine?: string;
  /** Délai d'attente de l'annonce, PAR tentative (défaut 20 s). */
  delaiMs?: number;
  /** Pause de drainage après kill avant la relance (défaut 300 ms). */
  pauseMs?: number;
}

/**
 * Extrait l'URL de base depuis les lignes stdout du serveur. Renvoie la
 * PREMIÈRE annonce trouvée, sans slash final ; null si aucune.
 */
export function extraireBase(lignes: string[]): string | null {
  for (const ligne of lignes) {
    const m = /listening on (https?:\/\/\S+)/i.exec(ligne);
    if (m) return m[1].replace(/\/+$/, "");
  }
  return null;
}

export interface GestionnaireServeur {
  /** Garantit un serveur pour CE binaire et rend sa base URL. */
  assurer(binaire: string, options?: OptionsAssurer): Promise<string>;
  /** GET JSON sur le serveur (chemin commençant par « / »). */
  requete<T>(binaire: string, chemin: string, init?: RequestInit): Promise<T>;
  /** Tue le serveur (appelé à la destruction du panneau). */
  arreter(): Promise<void>;
  /** Oublie la mise en cache (le prochain appel relancera le serveur). */
  invalider(): void;
}

export function creerGestionnaireServeur(depsPartielles?: Partial<DepsServeur>): GestionnaireServeur {
  const deps: DepsServeur = { ...depsParDefaut(), ...depsPartielles };
  let cache: { binaire: string; base: string } | null = null;
  let demarrage: Promise<string> | null = null;

  async function attendreAnnonce(
    binaire: string,
    origine: string,
    delaiMs: number,
  ): Promise<string> {
    const lignes: string[] = [];
    // Drapeau de sortie : l'id est NU sur acp://exit (voir en-tête).
    let sorti = false;
    const desabonnerSortie = await deps.ecouter("acp://output", (charge) => {
      const p = charge as { id?: unknown; data?: unknown };
      if (p.id === ID_SERVEUR && typeof p.data === "string") lignes.push(p.data);
    });
    const desabonnerFin = await deps.ecouter("acp://exit", (charge) => {
      if (charge === ID_SERVEUR) sorti = true;
    });
    try {
      await deps.lancer(ID_SERVEUR, binaire, ["serve", "--port", "0", "--cors", origine]);
      const echeance = Date.now() + delaiMs;
      while (Date.now() < echeance) {
        const base = extraireBase(lignes);
        if (base) {
          cache = { binaire, base };
          return base;
        }
        // Sortie rapide (binaire cassé, sous-commande absente) : inutile
        // d'attendre le délai complet.
        if (sorti) throw new Error("le processus s'est arrêté avant d'annoncer son port");
        await new Promise((r) => setTimeout(r, Math.min(50, Math.max(10, delaiMs / 20))));
      }
      throw new Error(`port jamais annoncé en ${delaiMs} ms`);
    } finally {
      desabonnerSortie();
      desabonnerFin();
    }
  }

  async function demarrer(binaire: string, options: OptionsAssurer): Promise<string> {
    const origine =
      options.origine ?? (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1");
    const delaiMs = options.delaiMs ?? 20_000;
    const pauseMs = options.pauseMs ?? 300;
    // Tentative 1 : annonce stdout normale. Tentative 2 (unique) : cas de
    // l'orphelin post-rechargement décrit en en-tête — kill puis pause de
    // drainage : l'exit tardif de l'orphelin s'émet PENDANT la pause, donc
    // avant que la tentative 2 ne s'abonne (chaque tentative a son propre
    // drapeau local, rien à réarmer). La relance fraîche annonce son port.
    try {
      try {
        return await attendreAnnonce(binaire, origine, delaiMs);
      } catch {
        await deps.tuer(ID_SERVEUR).catch(() => {});
        await new Promise((r) => setTimeout(r, pauseMs));
        return await attendreAnnonce(binaire, origine, delaiMs);
      }
    } catch (e) {
      // Échec définitif : ne laisser AUCUN processus derrière — sans ça, un
      // processus muet deux fois de suite resterait orphelin pour toujours.
      await deps.tuer(ID_SERVEUR).catch(() => {});
      throw new Error(`opencode serve injoignable (${String(e)})`);
    }
  }

  return {
    assurer(binaire, options = {}) {
      if (cache && cache.binaire === binaire) return Promise.resolve(cache.base);
      // Un seul démarrage concurrent : les appels parallèles partagent la
      // même promesse (double spawn = double port annoncé, chaos assuré).
      demarrage ??= demarrer(binaire, options).finally(() => {
        demarrage = null;
      });
      return demarrage;
    },

    async requete<T>(binaire: string, chemin: string, init?: RequestInit): Promise<T> {
      const base = await this.assurer(binaire);
      let reponse: Response;
      try {
        reponse = await deps.recuperer(base + chemin, init);
      } catch (e) {
        // Échec réseau (pas HTTP !) : le serveur a pu mourir depuis sa mise
        // en cache → on l'oublie pour que le prochain appel le relance.
        this.invalider();
        throw e;
      }
      if (!reponse.ok) throw new Error(`${chemin} → HTTP ${reponse.status}`);
      return (await reponse.json()) as T;
    },

    async arreter() {
      this.invalider();
      try {
        await deps.tuer(ID_SERVEUR);
      } catch {
        /* déjà mort — très bien */
      }
    },

    invalider() {
      cache = null;
    },
  };
}

/** Singleton utilisé par l'UI ; les tests créent leurs propres instances. */
export const serveurCatalogue: GestionnaireServeur = creerGestionnaireServeur();
