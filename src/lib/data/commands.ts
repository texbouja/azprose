/**
 * Commandes applicatives du domaine data (phase 0bis) — canal 3.
 *
 * Une commande est une demande UI → hôte (navigation, création de vue,
 * titre d'onglet). Les sagas ci-dessous sont PURES et testables : toutes
 * leurs dépendances (navigateur PanelManager + domaine IPC) passent en
 * paramètre. app.svelte fournit l'implémentation réelle et s'abonne au bus
 * via `subscribeCommands()`.
 *
 * Règle 9 (rapport architecture-review) : une saga ne parle JAMAIS à la db
 * en direct — elle passe par les wrappers IPC du domaine (les mêmes appels
 * que les anciens handlers app.svelte). Toute commande termine par
 * `navigate()` : le navigateur est la SEULE porte d'entrée du reducer
 * (PanelManager).
 */

import type {
  DataCommand,
  OpenGridStackCommand,
  OpenGridCommand,
} from "./events";
import type { NavIntent } from "@/lib/navigation";

/** Navigateur — la SEULE porte d'entrée du reducer (règle 9). Les sagas
 *  terminent TOUJOURS par `navigate(intent)` ; l'hôte (app.svelte) branche
 *  ce dispatcher sur `navigateVoid(navDeps, intent)`. Le reducer applique
 *  l'intention sur la session (PanelManager) — jamais d'appels directs à
 *  PanelManager depuis une saga. */
export interface NavDispatcher {
  navigate(intent: NavIntent): void;
}

/** Accès IPC du domaine datagrid/spreadsheet (wrappers `@/datagrid/store`).
 *  `findGridForSpreadsheet` = `datagridFindBySource` (DatagridMeta porte le
 *  nom de la vue — utilisé par open-grid-stack pour réparer les grids
 *  mal nommés). */
export interface GridDomain {
  findGridForSpreadsheet(
    spreadsheetId: string,
  ): Promise<{ id: string; name?: string } | null>;
  createGridForSpreadsheet(
    id: string,
    name: string,
    spreadsheetId: string,
  ): Promise<string>;
  renameGrid(id: string, name: string): Promise<void>;
  getSpreadsheet(id: string): Promise<{ name: string } | null>;
}

export interface CommandDeps {
  nav: NavDispatcher;
  domain: GridDomain;
}

/** Saga `open-grid` : trouve le grid lié au tableur, ou le crée depuis le
 *  tableur source (config de vue seulement — jamais de données), puis poste
 *  l'intention `open-datafilter` (pile d'un grid). Même logique que l'ancien
 *  listener `azprose:datafilter-open` d'app.svelte. */
export async function openGrid(
  spreadsheetId: string,
  name: string | undefined,
  deps: CommandDeps,
): Promise<void> {
  const { nav, domain } = deps;
  let gridId: string | null = null;
  const meta = await domain.findGridForSpreadsheet(spreadsheetId);
  if (meta) {
    gridId = meta.id;
  } else {
    gridId = await domain.createGridForSpreadsheet(
      `dg-${spreadsheetId}`,
      name || "Tableau",
      spreadsheetId,
    );
  }
  nav.navigate({
    type: "open-datafilter",
    datafilterIds: [gridId],
    title: name || "Filtre de données",
  });
}

/** Saga `open-grid-stack` : ouvre TOUS les tableurs d'un ensemble (colloscope)
 *  en une seule pile DataFilter — un grid par tableur, nommé du nom de SON
 *  tableau source (jamais le nom de la pile), réparant au passage les grids
 *  créés avant le fix (nom de pile au lieu du nom du tableau). */
export async function openGridStack(
  cmd: OpenGridStackCommand,
  deps: CommandDeps,
): Promise<void> {
  const { nav, domain } = deps;
  const gridIds: string[] = [];
  for (const spreadsheetId of cmd.spreadsheetIds) {
    const sheet = await domain.getSpreadsheet(spreadsheetId).catch(() => null);
    const sheetName = sheet?.name || cmd.name || "Tableau";
    const meta = await domain.findGridForSpreadsheet(spreadsheetId);
    if (meta) {
      // Réparer les grids créés avant le fix (nom de pile au lieu du nom du
      // tableau) : `datagridRename` n'a aucun appelant UI, pas de rename
      // manuel à préserver.
      if (meta.name !== sheetName) {
        await domain.renameGrid(meta.id, sheetName);
      }
      gridIds.push(meta.id);
    } else {
      const gridId = await domain.createGridForSpreadsheet(
        `dg-${spreadsheetId}`,
        sheetName,
        spreadsheetId,
      );
      gridIds.push(gridId);
    }
  }
  nav.navigate({
    type: "open-datafilter",
    datafilterIds: gridIds,
    title: cmd.name || "Filtre de données",
  });
}

/** Dispatch central des commandes : chaque branche est une saga qui termine
 *  par `navigate()` (le reducer). Appelé par l'abonnement `subscribeCommands`
 *  de l'hôte. Les erreurs sont loggées — une commande échouée ne fait jamais
 *  planter l'app (l'ancien handler catchait déjà). */
export async function runCommand(
  cmd: DataCommand,
  deps: CommandDeps,
): Promise<void> {
  const { nav } = deps;
  try {
    switch (cmd.type) {
      case "command:open-grid": {
        await openGrid(cmd.spreadsheetId, cmd.name, deps);
        return;
      }
      case "command:open-grid-stack": {
        await openGridStack(cmd, deps);
        return;
      }
      case "command:open-spreadsheet": {
        nav.navigate({
          type: "open-spreadsheet",
          spreadsheetId: cmd.spreadsheetId,
          title: cmd.name || "Tableur",
        });
        return;
      }
      case "command:open-spreadsheet-new": {
        // Lire le nom réel (comme l'ancien handler `spreadsheet-open-new` qui
        // faisait `spreadsheetGet` avant d'ouvrir) — le titre correct est
        // affiché dès l'ouverture, pas seulement après le reload du viewer.
        const sheet = await deps.domain.getSpreadsheet(cmd.spreadsheetId).catch(() => null);
        nav.navigate({
          type: "open-spreadsheet",
          spreadsheetId: cmd.spreadsheetId,
          title: sheet?.name || "Tableur",
        });
        return;
      }
      case "command:set-spreadsheet-id": {
        nav.navigate({
          type: "set-spreadsheet-id",
          spreadsheetId: cmd.spreadsheetId,
          title: cmd.title,
        });
        return;
      }
      case "command:set-tab-title": {
        nav.navigate({
          type: "set-spreadsheet-title",
          spreadsheetId: cmd.spreadsheetId,
          title: cmd.title,
        });
        return;
      }
    }
  } catch (err) {
    console.error("[data] command failed:", cmd.type, err);
  }
}

export type { OpenGridCommand, OpenGridStackCommand };
