/**
 * SqliteGridProvider — le provider de persistance d'une grille DataFilter
 * (phase 0bis, idée H du rapport architecture-review).
 *
 * Sous-classe de `DataProvider<TMethodsConfig>` de `@svar-ui/lib-data-provider`
 * branchée sur l'API du Grid SVAR via `api.setNext(provider)` : les actions
 * `update-cell` du DataStore (saisie, combo, date, undo/redo) arrivent ici en
 * fin de chaîne d'événements (après les handlers du store) et sont persistées
 * via l'upsert natif `datagrid_save_cells` — les MÊMES commandes IPC que
 * l'ancien `handleUpdateCell` du composant, aucune nouvelle commande Rust.
 *
 * La logique de persistance est déplacée TEL QUELLE depuis DataFilterGrid
 * (contrats sacrés, règle 7) :
 *  - accumulation Map `row:col` + debounce 500 ms
 *  - anti-chevauchement saving/pendingFlush (un flush en cours re-queue au
 *    lieu d'empiler ; le pending n'est vidé qu'après succès — un échec IPC
 *    conserve les edits pour le prochain essai)
 *  - skip d'égalité contre la Map en attente (NE PAS comparer avec la prop
 *    `svarRows` — périmée après un edit : le DataStore garde ses copies)
 *  - fenêtre `suppressed` (le composant la lève pendant un rechargement
 *    `setGridData` : les `update-cell` fantômes du re-init ne sont pas
 *    persistés comme des edits utilisateur)
 *  - après un flush réussi, émet `cells-changed` sur le bus (canal 2) au lieu
 *    du CustomEvent `azprose:spreadsheet-updated`
 *
 * La garde `ev.skipProvider` du DataProvider (`if (!ev.skipProvider) return
 * this._queue.add(...)`) reste un filet : une action du store marquée
 * skipProvider n'atteint jamais le provider.
 */

import { DataProvider } from "@svar-ui/lib-data-provider";
import type { TMethodsConfig } from "@svar-ui/grid-store";
import type { CellChange } from "@/spreadsheet/types";
import type { DataBus } from "./bus";

type UpdateCell = TMethodsConfig["update-cell"];

export interface GridProviderDeps {
  /** Id de la vue datagrid (gridId du composant). */
  gridId: string;
  /** Identité d'instance pour le skip self (`createOrigin`). */
  origin: string;
  /** Bus data (canal 2) — l'émission cells-changed après flush. */
  bus: DataBus;
  /** Commande IPC de persistance — `datagridSaveCells(gridId, changes)` en
   *  production, un spy dans les tests. */
  saveCells: (changes: CellChange[]) => Promise<void>;
}

export class SqliteGridProvider extends DataProvider<TMethodsConfig> {
  private deps: GridProviderDeps;

  private pending = new Map<string, CellChange>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving = false;
  private pendingFlush = false;
  private suppressed = false;
  private destroyed = false;
  /** Source_spreadsheet_id du grid — connu seulement après le premier load
   *  du composant (`provider.setSourceSpreadsheetId(...)` dans load()). */
  private sourceSpreadsheetId: string | null = null;

  constructor(deps: GridProviderDeps) {
    super({
      "update-cell": {
        handler: (data) => {
          this.handleUpdateCell(data as UpdateCell);
          return Promise.resolve();
        },
      },
    });
    this.deps = deps;
  }

  // ── État poussé par le composant ──────────────────────────────────────────

  /** Fenêtre de suppression (rechargement `setGridData`) : les update-cell
   *  émis pendant le re-init du Grid ne sont pas persistés. */
  setSuppressed(v: boolean): void {
    this.suppressed = v;
  }

  /** Source du grid, appris au load — l'émission cells-changed n'a lieu que
   *  si un tableur source est connu (sinon personne ne matche, no-op). */
  setSourceSpreadsheetId(id: string | null): void {
    this.sourceSpreadsheetId = id;
  }

  // ── Pipeline de persistance (déplacé tel quel depuis DataFilterGrid) ─────

  private handleUpdateCell(p: UpdateCell): void {
    if (this.suppressed || this.destroyed) return;
    const rowIndex = Number(String(p.id).replace(/^r/, ""));
    const colIndex = Number(String(p.column).replace(/^c/, ""));
    if (isNaN(rowIndex) || isNaN(colIndex) || rowIndex < 0 || colIndex < 0)
      return;
    const value =
      p.value instanceof Date
        ? p.value.toISOString().slice(0, 10)
        : String(p.value ?? "");
    const key = `${rowIndex}:${colIndex}`;
    // Skip d'égalité : un `update-cell` fantôme peut rejouer une valeur déjà
    // en attente — ne pas re-queuer une sauvegarde redondante.
    if (this.pending.get(key)?.value === value) return;
    this.pending.set(key, { row_index: rowIndex, col_index: colIndex, value });
    this.debounce();
  }

  private debounce(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 500);
  }

  /** Flush immédiat (filet de fermeture) : force le debounce et retourne la
   *  promesse du flush pour les teardowns. */
  flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size > 0) return this.flush();
    return Promise.resolve();
  }

  private async flush(): Promise<void> {
    if (this.saving) {
      this.pendingFlush = true;
      return;
    }
    this.saving = true;
    try {
      const changes = [...this.pending.values()];
      if (changes.length === 0) return;
      await this.deps.saveCells(changes);
      // Ne retirer que les edits sauvés — un edit arrivé pendant l'IPC en vol
      // reste en attente pour le prochain flush.
      for (const ch of changes) {
        this.pending.delete(`${ch.row_index}:${ch.col_index}`);
      }
      // Canal 2 : le viewer tableur (s'il est ouvert sur ce source) se
      // recharge — remplace le CustomEvent `azprose:spreadsheet-updated`.
      const src = this.sourceSpreadsheetId;
      if (src) {
        this.deps.bus.emit({
          type: "cells-changed",
          spreadsheetId: src,
          origin: this.deps.origin,
        });
      }
    } catch (err) {
      console.error("[datafilter] save failed:", err);
    } finally {
      this.saving = false;
      if (this.pendingFlush) {
        this.pendingFlush = false;
        this.flush();
      }
    }
  }

  /** Teardown du composant : coupe les futurs edits. Le flush final doit être
   *  demandé AVANT (le composant appelle `flushNow()` puis `destroy()`). */
  destroy(): void {
    this.destroyed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
