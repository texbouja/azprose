/**
 * Événements typés du domaine data (phases 0bis du plan d'architecture).
 *
 * Deux canaux sémantiques transportés par le même bus :
 *
 *  - CANAL 2 (fraîcheur) : `DataEvent` — l'état des données a changé dans la
 *    db (SQLite). Les vues s'abonnent avec un matcher + `skipOrigin` (ne pas
 *    se recharger soi-même après son propre flush). Aucun payload de données,
 *    uniquement des identifiants — les vues relisent live (modèle v8).
 *
 *  - CANAL 3 (commandes) : `DataCommand` — une action applicative demandée
 *    par un composant (navigation, création de vue, titre d'onglet). Elles
 *    sont exécutées par l'hôte (app.svelte) via `runCommand()` avec le
 *    navigateur (PanelManager) en DI — les SEULS inputs du reducer.
 *
 * Une commande ne porte JAMAIS d'`origin` (broadcast) ; un `DataEvent` porte
 * TOUJOURS l'identité de l'émetteur pour le skip self.
 */

/** Canal 2 — fraîcheur : des cellules ont changé dans la table source. */
export type CellsChanged = {
  type: "cells-changed";
  /** Tableur dont les cellules ont changé (source_spreadsheet_id). */
  spreadsheetId: string;
  /** Identité de l'émetteur (`createOrigin`) — les vues skippent la leur. */
  origin: string;
};

/** Canal 2 — fraîcheur : la config de VUE d'un datagrid a changé (largeurs…). */
export type GridConfigChanged = {
  type: "grid-config-changed";
  gridId: string;
  origin: string;
};

/** Canal 2 — fraîcheur : l'ensemble des événements data. */
export type DataEvent = CellsChanged | GridConfigChanged;

/** Canal 3 — commandes applicatives (UI → hôte, terminent par `navigate()`). */

/** Ouvrir (ou créer puis ouvrir) le grid lié à un tableur dans DataFilter. */
export type OpenGridCommand = {
  type: "command:open-grid";
  spreadsheetId: string;
  name?: string;
};

/** Ouvrir une PILE DataFilter (plusieurs tableurs liés — colloscope…). */
export type OpenGridStackCommand = {
  type: "command:open-grid-stack";
  spreadsheetIds: string[];
  name?: string;
};

/** Ouvrir un tableur dans le side panel (ex. « Edit dans Spreadsheet »). */
export type OpenSpreadsheetCommand = {
  type: "command:open-spreadsheet";
  spreadsheetId: string;
  name?: string;
};

/** Ouvrir un tableur dans un onglet (existant → activé, sinon créé). */
export type OpenSpreadsheetNewCommand = {
  type: "command:open-spreadsheet-new";
  spreadsheetId: string;
};

/** Upgrader l'onglet « création » avec le vrai spreadsheetId (création ok). */
export type SetSpreadsheetIdCommand = {
  type: "command:set-spreadsheet-id";
  spreadsheetId: string;
  title: string;
};

/** Mettre à jour le titre des onglets ouverts d'un tableur (rename). */
export type SetTabTitleCommand = {
  type: "command:set-tab-title";
  spreadsheetId: string;
  title: string;
};

/** Canal 3 — l'ensemble des commandes. */
export type DataCommand =
  | OpenGridCommand
  | OpenGridStackCommand
  | OpenSpreadsheetCommand
  | OpenSpreadsheetNewCommand
  | SetSpreadsheetIdCommand
  | SetTabTitleCommand;

/** Union transportée par le bus data (canal 2 + canal 3). */
export type BusEvent = DataEvent | DataCommand;

/** Type guard pour le matcher de `DataBus.subscribe`. */
export type DataEventMatcher<E extends DataEvent = DataEvent> = (
  ev: DataEvent,
) => ev is E;

/** Matcher d'abonnement par type d'événement (discriminé). */
export function ofType<T extends DataEvent["type"]>(type: T) {
  return (ev: DataEvent): ev is Extract<DataEvent, { type: T }> =>
    ev.type === type;
}

/** Combine plusieurs matchers en un (union des sélections). Le handler
 *  reçoit `DataEvent` et discrimine par `ev.type` — le filtrage métier par
 *  identifiant (ex. `ev.spreadsheetId === id`) reste dans le handler. */
export function anyOf(...matchers: DataEventMatcher[]): DataEventMatcher {
  return (ev: DataEvent): ev is DataEvent => matchers.some((m) => m(ev));
}
