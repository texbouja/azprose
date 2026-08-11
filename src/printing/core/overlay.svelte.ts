/**
 * Noyau overlay d'impression (printing.md §2.1) — mécanique COMMUNE à tous
 * les types (md, colle). Il consomme le contrat type (`core/contract.ts`) :
 *
 *   - machine à états : "idle" → "loading" (lecture des réglages persistés)
 *     → "ready" → "exporting"/"previewing" → "done" ; "error" sur échec ou
 *     absence de feuilles. Transitions par événements (`createPhaseMachine`),
 *     les événements hors alphabet sont ignorés ;
 *   - requête d'impression éditée (`req`) + chargement au CHAQUE open ;
 *   - actions preview/export génériques : les fonctions du contrat font le
 *     travail spécifique (assembleur HTML, dialogue de destination), le noyau
 *     gère les états, la sauvegarde du dernier réglage, la notification de
 *     succès et la fermeture.
 *
 * La réactivité (runes) exige d'appeler cette factory depuis le script d'un
 * composant Svelte (ou d'un module .svelte.ts monté dans un composant) — les
 * sources `open`/`source`/`filePath` sont passées en getters pour être lues
 * à l'instant T (le $effect n'enregistre que les dépendances qu'il lit).
 *
 * PIÈGE RÉACTIVITÉ 1 (découvert par l'investigation des boutons manquants) :
 * ne JAMAIS retourner `req`/`error`/`count`/`canExport` directement dans
 * l'objet de la factory — le compilateur Svelte unwrap les $state en
 * `$.get(...)` dans le littéral retourné : le composant recevrait des
 * SNAPSHOTS figées au montage (machine "idle" → canExport false, count 0,
 * req = défauts) et l'UI resterait gelée même quand la machine passe en
 * "ready" (symptôme « overlay sans boutons aperçu/export »). L'état exposé
 * est donc un objet `state` dont les propriétés sont des GETTERS relus à
 * chaque accès — seuls `machine` (proxy) et les getters sont réactifs.
 *
 * PIÈGE RÉACTIVITÉ 2 (corrigé — même bug que ColleSendDialog, cf. commentaire
 * du reset) : un $effect qui LIT `machine` (reset) ET dont les `.then`
 * MUTENT `machine` (send) se re-planifie en boucle — la machine ne reste
 * jamais en "ready" et les boutons Aperçu/Export (rendus seulement en phase
 * "ready" stable) disparaissent. Toute lecture de `machine` dans l'effet
 * doit passer par `untrack`. (NB : avec l'implémentation actuelle de
 * `createPhaseMachine`, `reset`/`send` n'écrivent que `this.current` sans le
 * lire — l'untrack est un garde-fou, pas une nécessité mesurée.)
 */
import { untrack } from "svelte";
import { createPhaseMachine, type PhaseDef, type PhaseMachine } from "@/lib/phase-machine";
import type { PrintRequest } from "@/lib/print-request";
import type { PrintTypeContract } from "./contract";

export type PrintPhase =
  | "idle"
  | "loading"
  | "ready"
  | "previewing"
  | "exporting"
  | "done"
  | "error";
export type PrintEvent =
  | "open"
  | "loaded"
  | "empty"
  | "preview"
  | "previewed"
  | "failed"
  | "export"
  | "exported"
  | "cancelled";

/** Machine à phases : chaque phase n'accepte que son alphabet. */
export const PRINT_PHASES: readonly PhaseDef<PrintPhase, PrintEvent>[] = [
  { name: "idle", on: { open: "loading" } },
  { name: "loading", on: { loaded: "ready", empty: "error" } },
  { name: "ready", on: { preview: "previewing", export: "exporting" } },
  { name: "previewing", on: { previewed: "ready", failed: "error" } },
  { name: "exporting", on: { exported: "done", cancelled: "ready", failed: "error" } },
  { name: "done", on: {} },
  { name: "error", on: {} },
];

/** Services injectés par le composant hôte (i18n, notifications, fermeture). */
export interface PrintOverlayHost {
  /** Traduction d'une clé (avec variables optionnelles). */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Notification de succès (chemin d'export). */
  notify: (message: string) => void;
  /** Ferme l'overlay (après export réussi). */
  onClose: () => void;
}

export interface PrintOverlayCore {
  /**
   * État RÉACTIF exposé au composant : les propriétés sont des GETTERS relus
   * à chaque accès (jamais des snapshots — cf. piège réactivité 1 du
   * docstring). `machine` est le proxy de la machine à états.
   */
  state: {
    machine: PhaseMachine<PrintPhase, PrintEvent>;
    /** Requête d'impression éditée (réactive). */
    req: PrintRequest;
    /** Message d'erreur courant (phase "error"). */
    error: string;
    /** Nombre de feuilles à imprimer (md : 1 ; colle : planches). */
    count: number;
    /** L'export est-il possible (phase ready + feuilles non vides) ? */
    canExport: boolean;
  };
  patch: (p: Partial<PrintRequest>) => void;
  patchMargins: (p: Partial<PrintRequest["margins"]>) => void;
  handlePreview: () => Promise<void>;
  handleExport: () => Promise<void>;
}

/**
 * Fabrique le noyau overlay pour un contrat + un hôte. À appeler UNE fois
 * dans le script du composant hôte (les getters `open`/`source`/`filePath`
 * sont relus à chaque accès — props du composant).
 */
export function createPrintOverlayCore(
  contract: PrintTypeContract,
  host: PrintOverlayHost,
  sources: {
    open: () => boolean;
    source: () => string | null;
    filePath: () => string | null;
  },
): PrintOverlayCore {
  let machine = $state(createPhaseMachine(PRINT_PHASES, { initial: "idle" }));
  let error = $state("");
  let req = $state<PrintRequest>(structuredClone(contract.defaultRequest));
  let count = $state(0);

  // Charge les derniers réglages à CHAQUE ouverture. Le $effect ne lit que
  // `open` et `source` (jamais les états qu'il écrit — piège boucle d'effet
  // Svelte 5). Le parse planches est SYNCHRONE (`countFor` sans DOM).
  $effect(() => {
    if (!sources.open()) return;
    // Reset INCONDITIONNEL à chaque ouverture (cycle de vie) : le chargement
    // repart depuis n'importe quelle phase précédente. `untrack` est
    // OBLIGATOIRE : sans lui, la LECTURE de `machine` ici en ferait une
    // dépendance de l'effet, et chaque mutation de la machine (les `send`
    // du `.then` ci-dessous) re-déclencherait l'effet → reset → nouvelle
    // promesse → send → BOUCLE (schedule_possible_effect_self_invalidation
    // → effect_update_depth_exceeded — même piège que ColleSendDialog,
    // commentaire l.174-181). La machine resterait figée en "loading" et le
    // template (boutons Aperçu/Export rendus seulement en phase "ready"
    // stable) ne les afficherait jamais.
    untrack(() => machine.reset("loading"));
    error = "";
    count = 0;
    let cancelled = false;
    void contract.loadRequest().then((saved) => {
      if (cancelled) return;
      req = saved;
      const src = sources.source();
      if (!src) {
        // Repli défensif (l'app lit le store, phase 7) : état vide BRUYANT,
        // jamais des boutons muets.
        count = 0;
        error = contract.emptyKey ? host.t(contract.emptyKey) : "";
        machine.send("empty");
        return;
      }
      count = contract.countFor(src);
      machine.send(contract.canExport(count) ? "loaded" : "empty");
      if (!contract.canExport(count) && contract.emptyKey) {
        error = host.t(contract.emptyKey);
      }
    });
    return () => {
      cancelled = true;
    };
  });

  const canExport = $derived(machine.current === "ready" && contract.canExport(count));

  /**
   * État exposé au composant — GETTERS relus à chaque accès. NE PAS retourner
   * les $state directement (snapshots — piège réactivité 1 du docstring) :
   * le compilateur unwrap `req`/`canExport`/... en `$.get(...)` dans l'objet
   * retourné de la factory, figeant l'UI au montage. Ici, chaque propriété est
   * évaluée à la lecture ; `machine` est le proxy (réactif par lui-même).
   */
  const state = $state({
    machine,
    get req(): PrintRequest {
      return req;
    },
    get error(): string {
      return error;
    },
    get count(): number {
      return count;
    },
    get canExport(): boolean {
      return canExport;
    },
  });

  function patch(p: Partial<PrintRequest>) {
    req = { ...req, ...p };
  }

  function patchMargins(p: Partial<PrintRequest["margins"]>) {
    req = { ...req, margins: { ...req.margins, ...p } };
  }

  /** Aperçu avant impression : MÊME HTML que l'export, fenêtre Chromium visible. */
  async function handlePreview() {
    const source = sources.source();
    const filePath = sources.filePath();
    if (!source || !filePath) return;
    if (!machine.send("preview")) return; // hors alphabet (ex. déjà en cours)
    error = "";
    try {
      await contract.preview({ source, filePath }, req);
      // L'aperçu reste ouvert — retour à l'état prêt (réglages ajustables).
      machine.send("previewed");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      machine.send("failed");
    }
  }

  async function handleExport() {
    const source = sources.source();
    const filePath = sources.filePath();
    if (!source || !filePath) return;
    if (!machine.send("export")) return; // hors alphabet (ex. déjà en cours)
    error = "";
    try {
      const result = await contract.export({ source, filePath }, req);
      if (result.status === "empty") {
        error = contract.emptyKey ? host.t(contract.emptyKey) : "";
        machine.send("failed");
        return;
      }
      if (result.status === "cancelled") {
        // Dialogue de destination annulé — on reste sur l'overlay.
        machine.send("cancelled");
        return;
      }
      await contract.saveRequest(req);
      host.notify(host.t(contract.doneKey, { path: result.path }));
      machine.send("exported");
      host.onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      machine.send("failed");
    }
  }

  return {
    state,
    patch,
    patchMargins,
    handlePreview,
    handleExport,
  };
}
