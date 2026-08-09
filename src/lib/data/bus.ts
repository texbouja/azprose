/**
 * Bus data typé (phase 0bis) — le canal unique de fraîcheur (canal 2) et de
 * commandes applicatives (canal 3) du domaine spreadsheet/datagrid.
 *
 * Le bus est un simple broadcast synchrone : `emit()` délivre l'événement à
 * tous les abonnés dont le matcher le sélectionne, en ignorant ceux qui se
 * sont abonnés avec un `skipOrigin` égal à l'origin de l'événement (le skip
 * self — ne pas se recharger après son propre flush).
 *
 * Les abonnements sont des gardes de premier niveau : le matcher typé
 * (`ofType("cells-changed")`…) + le skipOrigin. Le FILTRAGE métier reste
 * dans le handler (ex. `ev.spreadsheetId === id`), exactement comme le
 * filtre `detail.spreadsheetId === id` des anciens CustomEvent.
 */

import type { BusEvent, DataEvent, DataEventMatcher } from "./events";

type Listener = (ev: BusEvent) => void;

export interface BusSubscription {
  unsubscribe(): void;
}

export class DataBus {
  private listeners = new Set<Listener>();

  /** Délivre un événement à tous les abonnés dont le matcher le sélectionne.
   *  Synchrone — les handlers doivent être légers (une lecture de vue, un
   *  flush, une navigation), jamais de travail lourd inline. */
  emit(ev: BusEvent): void {
    for (const l of [...this.listeners]) l(ev);
  }

  /** S'abonne aux événements data sélectionnés par `matcher`. Les événements
   *  dont l'`origin` vaut `skipOrigin` sont ignorés (skip self). Retourne un
   *  abonnement annulable — à appeler dans le cleanup d'un `$effect`. */
  subscribe<E extends DataEvent>(
    matcher: DataEventMatcher<E>,
    handler: (ev: E) => void,
    opts?: { skipOrigin?: string },
  ): BusSubscription {
    const listener: Listener = (raw) => {
      if (opts?.skipOrigin && (raw as DataEvent).origin === opts.skipOrigin)
        return;
      if (!matcher(raw as DataEvent)) return;
      handler(raw as E);
    };
    this.listeners.add(listener);
    return {
      unsubscribe: () => {
        this.listeners.delete(listener);
      },
    };
  }

  /** S'abonne aux commandes (canal 3) — typiquement l'hôte (app.svelte). */
  subscribeCommands(handler: (cmd: Extract<BusEvent, { type: `command:${string}` }>) => void): BusSubscription {
    const listener: Listener = (raw) => {
      if ((raw as DataEvent).type.startsWith("command:")) {
        handler(raw as Extract<BusEvent, { type: `command:${string}` }>);
      }
    };
    this.listeners.add(listener);
    return {
      unsubscribe: () => {
        this.listeners.delete(listener);
      },
    };
  }
}

/** Bus singleton du domaine data (un seul bus pour l'app). */
export const dataBus = new DataBus();

/** Identités d'instance pour le skip self : chaque composant data (une carte
 *  DataFilter, un viewer tableur…) crée la sienne au montage et la passe en
 *  `origin` sur ses émissions. Deux instances sur la même source se
 *  rechargent mutuellement (leurs origins diffèrent) — seule sa propre
 *  notification est ignorée. */
let originCounter = 0;
export function createOrigin(prefix: string): string {
  return `${prefix}:${++originCounter}`;
}
