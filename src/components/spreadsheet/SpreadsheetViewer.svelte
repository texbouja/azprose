<script lang="ts">
  import { tick } from "svelte";
  import Spreadsheet from "./Spreadsheet.svelte";
  import type { JspreadsheetInstance } from "./Spreadsheet.svelte";
  import ImportSpreadsheetDialog from "./dialogs/ImportSpreadsheetDialog.svelte";
  import SpreadsheetManager from "./dialogs/SpreadsheetManager.svelte";
  import { Modal, Button } from "@svar-ui/svelte-core";
  import { ExportPopup } from "@svar-ui/svelte-export-popup";
  import type { ExportRequest } from "@svar-ui/svelte-export-popup";
  import {
    spreadsheetGet, spreadsheetCreate,
    spreadsheetSaveAll, spreadsheetSaveCells, spreadsheetSaveStructure,
  } from "@/spreadsheet/store";
  import type { ColumnDef, SpreadsheetViewState, CellChange } from "@/spreadsheet/types";
  import {
    datagridFindBySource,
  } from "@/datagrid/store";
  // Imports STATIQUES (jamais mélangés avec du dynamique) : @/lib/files et les
  // wrappers tauri sont déjà chargés en eager (app.svelte / transclusion) — les
  // `await import()` d'avant ne découpaient aucun chunk. Restent DYNAMIQUES à
  // dessein : `@/lib/spreadsheet/import` (xlsx parsing, module runtime lazy) et
  // `xlsx` (grosse lib externe, chargée seulement à l'import/export).
  import { pickXlsx } from "@/lib/files";
  import { save } from "@tauri-apps/plugin-dialog";
  import { writeFile } from "@tauri-apps/plugin-fs";
  let {
    spreadsheetId = "",
  }: {
    spreadsheetId?: string;
  } = $props();

  // When the current spreadsheet is deleted via Gérer,
  // we clear local state and show the empty view (tab stays open).
  let cleared = $state(false);
  // `true` UNIQUEMENT tant que le premier chargement n'est pas terminé. Les
  // rechargements suivants (pont live) NE démontent PAS <Spreadsheet> : ils
  // ré-initialisent jspreadsheet en place via `Spreadsheet.reload()`. Le
  // remount (`{#if loading}` → unmount → flushOnDestroy → remount → init) à
  // CHAQUE reload était le moteur de la boucle infinie spreadsheet↔datagrid.
  let initialLoading = $state(true);

  /** Fenêtre de suppression des événements jspreadsheet pendant un re-init en
   *  place (`Spreadsheet.reload()`) : les événements émis par init() (onchange,
   *  structurels, styles) ne doivent pas être traités comme des edits utilisateur.
   *  Plain variable — jamais rendue, uniquement lue par les handlers. */
  let suppressChanges = false;

  let data: string[][] = $state([]);
  let columns: ColumnDef[] = $state([]);
  let viewState: SpreadsheetViewState = $state({
    hidden_columns: "[]",
    hidden_rows: "[]",
    frozen_columns: 0,
    frozen_rows: 0,
    sort_column: null,
    sort_order: null,
  });
  let sheetName = $state("");
  let spreadsheetRef: Spreadsheet;

  // ── Column type auto-detection ─────────────────────────────────────────

  /** Returns true if all non-empty values in a column parse as numbers. */
  function isNumericColumn(colIndex: number, rows: string[][]): boolean {
    for (let r = 0; r < rows.length; r++) {
      const val = rows[r]?.[colIndex]?.trim();
      if (val !== "" && val !== undefined && (isNaN(Number(val)) || val === "")) {
        return false;
      }
    }
    return true;
  }

  function autoDetectColumnTypes(rows: string[][], cols: ColumnDef[]): ColumnDef[] {
    return cols.map((c, i) => ({
      ...c,
      type: isNumericColumn(i, rows) ? "numeric" : (c.type || "text"),
    }));
  }

  // Import dialog state
  let importDialogOpen = $state(false);
  let importSheets: any[] = $state([]);
  let importPath: string | undefined = $state();

  // Create dialog state
  let createDialogOpen = $state(false);
  let createName = $state("Nouveau tableau");
  let createColCount = $state(3);
  let createRowCount = $state(10);
  let createColTitles = $state<string[]>(["", "", ""]);
  // Plain variable to break the effect cycle (avoids effect_update_depth_exceeded).
  let prevColCount = 0;
  // Resize colTitles array when col count changes
  $effect(() => {
    const n = createColCount;
    if (n !== prevColCount) {
      prevColCount = n;
      const old = createColTitles;
      createColTitles = Array.from({ length: n }, (_, i) => old[i] ?? "");
    }
  });

  // Manage / open dialog state
  let managerOpen = $state(false);

  // Export popup
  let exportPopupOpen = $state(false);
  let exportAnchor = $state<HTMLElement | null>(null);

  // Debounce timer

  // ── Link to datagrid views of this spreadsheet ─────────────────────────
  // Data lives in the shared spreadsheet_cells table, so datagrid views are
  // just config over the same source — no mirroring needed. We still track
  // the linked grid id to notify open views to reload after a save (the
  // "azprose:datagrid-updated" event), found once per spreadsheet open.
  let linkedGridId: string | null = null;

  $effect(() => {
    const id = spreadsheetId;
    if (!id) {
      linkedGridId = null;
      return;
    }
    let cancelled = false;
    datagridFindBySource(id)
      .then((meta) => {
        if (cancelled) return;
        linkedGridId = meta?.id ?? null;
      })
      .catch((err) => {
        if (!cancelled) console.warn("[spreadsheet] link lookup failed:", err);
      });
    return () => {
      cancelled = true;
    };
  });

  // ── Load ────────────────────────────────────────────────────────────────

  // Generation counter to avoid stale completions from parallel load() calls.
  // NOT reactive — plain variable to avoid triggering the $effect on write.
  let loadGen = -1;

  /** Dernier titre dispatché via `azprose:spreadsheet-title-change` (évite
   *  les re-dispatches → notify() → re-render à chaque reload du pont live). */
  let lastDispatchedSheetTitle = "";

  /** Restore view state after jspreadsheet init: hidden cols/rows, styles, sort. */
  function restoreViewState() {
    const sheet = spreadsheetRef?.getApi()?.[0];
    if (!sheet) return;
    try {
      const hiddenCols = JSON.parse(viewState.hidden_columns) as number[];
      if (hiddenCols.length > 0) sheet.hideColumn(hiddenCols);
    } catch {}
    try {
      const hiddenRows = JSON.parse(viewState.hidden_rows) as number[];
      if (hiddenRows.length > 0) sheet.hideRow(hiddenRows);
    } catch {}
    // Nota: freezeColumns is applied at init via worksheetOptions; no runtime API needed.

    try {
      const styles = viewState.styles
        ? JSON.parse(viewState.styles) as Record<string, string>
        : null;
      if (styles && Object.keys(styles).length > 0) {
        // Replaying stored styles dispatches onchangestyle per cell — the
        // restoring flag stops them from re-triggering a save.
        restoring = true;
        try {
          sheet.setStyle(styles);
        } finally {
          restoring = false;
        }
      }
    } catch (e) {
      console.warn("[spreadsheet] failed to restore styles:", e);
    }
  }

  async function load() {
    if (!spreadsheetId) return;
    cleared = false;
    const gen = ++loadGen;
    try {
      const result = await spreadsheetGet(spreadsheetId);
      // Discard result if a newer load is already running
      if (gen !== loadGen) return;

      // Skip rendering if the result has no columns (broken old "Nouveau tableur" entries)
      if (result.columns.length === 0) {
        initialLoading = false;
        cleared = true;
        return;
      }
      sheetName = result.name;
      data = result.data;
      columns = autoDetectColumnTypes(result.data, result.columns);
      viewState = result.state;

      // Note: styles / hidden cols are restored via onReady (called after
      // Spreadsheet.svelte's init() has set the api reference).
      // We no longer try to restore them here because init() runs
      // asynchronously and the jspreadsheet instance isn't ready yet.

      // Sync the tab title with the database name — only when it actually
      // changed. load() runs on every `azprose:spreadsheet-updated` (datagrid
      // edits) and an unconditional dispatch would cascade notify() →
      // re-render on each reload.
      if (lastDispatchedSheetTitle !== result.name) {
        lastDispatchedSheetTitle = result.name;
        window.dispatchEvent(new CustomEvent("azprose:spreadsheet-title-change", {
          detail: { spreadsheetId, title: result.name },
        }));
      }

      if (initialLoading) {
        // Premier chargement : le template monte <Spreadsheet> avec les
        // nouvelles props (init() prendra data/columns/viewState au mount).
        initialLoading = false;
      } else {
        // Rechargement en place : le composant est DÉJÀ monté. On ne le
        // démonte PAS (le remount à chaque reload était le moteur de la
        // boucle) — on ré-initialise jspreadsheet avec les props courantes,
        // en supprimant les événements émis par init() pour qu'ils ne soient
        // pas persistés comme des edits fantômes.
        suppressChanges = true;
        try {
          await spreadsheetRef?.reload();
          // Laisse passer un flush Svelte pour que les événements différés de
          // init()/onReady (s'il y en a) tombent encore dans la fenêtre.
          await tick();
        } finally {
          suppressChanges = false;
        }
      }
    } catch (err) {
      // Only report if no newer load superseded this one
      if (gen === loadGen) {
        console.error("Failed to load spreadsheet:", err);
        initialLoading = false;
        cleared = true; // Show empty/create UI instead of a broken grid
      }
    }
  }

  $effect(() => {
    const id = spreadsheetId;
    if (id) {
      load();
    } else {
      initialLoading = false;
    }
  });

  // A linked datagrid edits cells directly through the same SQLite table.
  // When it saves, it dispatches "azprose:spreadsheet-updated" — reload so the
  // sheet mirrors the grid without waiting for a manual refresh. Local pending
  // edits are flushed first: they share the same spreadsheet_cells rows, and a
  // blind reload would drop edits queued but not yet persisted.
  $effect(() => {
    const id = spreadsheetId;
    if (!id) return;
    const onSpreadsheetUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<{ spreadsheetId: string }>).detail;
      if (!detail || detail.spreadsheetId !== id) return;
      void (async () => {
        // Let a currently in-flight flush (and any re-queued one) finish before
        // reading, so the reload never sees a stale snapshot.
        while (saving || pendingFlush) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (pendingCellChanges.size > 0) await flushChanges();
        while (saving || pendingFlush) {
          await new Promise((r) => setTimeout(r, 50));
        }
        // Only reload if this viewer is still on the same spreadsheet.
        if (spreadsheetId === id) load();
      })();
    };
    window.addEventListener("azprose:spreadsheet-updated", onSpreadsheetUpdated);
    return () => window.removeEventListener("azprose:spreadsheet-updated", onSpreadsheetUpdated);
  });

  // ── SQLite persistence (incremental cells + structural save) ─────────────
  //
  // Two-tier model, both flushed together on every change batch:
  //   1. Cell edits — jspreadsheet's onchange gives exact (row, col, value)
  //      coordinates, so we accumulate them in a Map keyed by "row:col" and
  //      upsert via `spreadsheetSaveCells` (native ON CONFLICT, O(changes)).
  //      No diff, no O(R×C) snapshot, no getStyle()/getData() on cell edits.
  //   2. Structural changes (column/row insert/delete/move/resize, style
  //      formatting) — `spreadsheetSaveStructure` replace-alls the columns,
  //      garbage-collects orphan cells and persists the view state. This is
  //      the path that guarantees added columns survive (the old bug: an
  //      incremental cell save that never touched spreadsheet_columns).
  // Order per flush: cells FIRST, structure AFTER (the structure save then
  // removes any orphan cells, including edits that landed in a deleted
  // column/row). `spreadsheetSaveAll` remains only as the safety net on
  // Ctrl+S / tab close.

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingCellChanges = new Map<string, CellChange>();
  // Plain variables: only touched by handlers / flushChanges, never rendered.
  let structureDirty = false;
  let saving = false;
  let pendingFlush = false;
  // Set while restoreViewState replays stored styles into jspreadsheet, so
  // the resulting onchangestyle events do not re-trigger a save.
  let restoring = false;

  function debouncedSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      flushChanges();
    }, 500);
  }

  /** Read all cell styles from the jspreadsheet instance. Returns JSON string or "{}". */
  function captureStyles(sheet: JspreadsheetInstance): string {
    try {
      const raw = sheet.getStyle?.();
      // getStyle can return string (error) or object
      if (!raw || typeof raw === "string") return "{}";
      const styles: Record<string, string> = {};
      for (const key of Object.keys(raw)) {
        const val = (raw as any)[key];
        styles[key] = typeof val === "string" ? val : JSON.stringify(val);
      }
      return JSON.stringify(styles);
    } catch {
      return "{}";
    }
  }

  /**
   * Rebuild the column definitions from the live jspreadsheet instance.
   * Structural edits (insert/delete/move/resize) never reach the `columns`
   * $state prop, so we read the authoritative headers/widths at save time:
   * headers via getHeaders(true), widths via getWidth(c). Types/options are
   * kept from the previous column config when the column already existed.
   *
   * IMPORTANT: `getHeaders()` without the `asArray` argument returns a joined
   * STRING ("A,B,C,…" with the worksheet's csvDelimiter), not an array. The
   * original code indexed that string — every header collapsed to a single
   * character and `headers.length` became the CHARACTER count (27 for 14
   * columns), so EVERY structural save / Ctrl+S / tab-close persisted garbage
   * columns and the sheet corrupted after reload. `getHeaders(true)` returns
   * the real array, one entry per live column (hidden ones included), and its
   * length IS the authoritative column count.
   */
  function buildColumnsFromSheet(sheet: JspreadsheetInstance): ColumnDef[] {
    const live: ColumnDef[] = [];
    try {
      const headers = (sheet.getHeaders?.(true) as string[] | undefined) ?? [];
      // Defensive: never let a silent empty result wipe the persisted columns.
      if (headers.length === 0 && columns.length > 0) return columns;
      for (let c = 0; c < headers.length; c++) {
        const prev = columns[c];
        const width = Number(sheet.getWidth?.(c) ?? prev?.width ?? 120);
        live.push({
          title: headers[c] ?? prev?.title ?? "",
          width: Number.isFinite(width) && width > 0 ? width : (prev?.width ?? 120),
          type: prev?.type ?? "text",
          options: prev?.options ?? undefined,
        });
      }
    } catch (err) {
      console.warn("[spreadsheet] buildColumnsFromSheet failed, falling back:", err);
      return columns;
    }
    return live;
  }

  /**
   * Flush the accumulated changes. Cells → SQLite, structure (if dirty) →
   * SQLite. Overlap-protected: a running flush re-queues (`pendingFlush`)
   * instead of stacking parallel snapshots.
   */
  async function flushChanges() {
    if (saving) {
      pendingFlush = true;
      return;
    }
    const sheet = spreadsheetRef?.getApi()?.[0];
    if (!sheet || !spreadsheetId) return;
    saving = true;
    try {
      const changes = [...pendingCellChanges.values()];
      const structureNow = structureDirty;

      if (changes.length > 0) {
        await spreadsheetSaveCells(spreadsheetId, changes);
        // Remove only the entries that were just saved — edits made while the
        // IPC was in flight must stay queued for the next flush (a blanket
        // clear() would silently drop them).
        for (const ch of changes) {
          pendingCellChanges.delete(`${ch.row_index}:${ch.col_index}`);
        }
      }

      if (structureNow) {
        const liveColumns = buildColumnsFromSheet(sheet);
        const numRows = (sheet.getData() as unknown[]).length;
        const stylesJson = captureStyles(sheet);
        const finalState = { ...viewState, styles: stylesJson };
        await spreadsheetSaveStructure(spreadsheetId, liveColumns, numRows, finalState);
        structureDirty = false;
        viewState = finalState;
        // Mirror the persisted columns back into the $state so subsequent
        // buildColumnsFromSheet() lookups (type/width via `prev`) stay
        // accurate after inserts/deletes/moves.
        columns = liveColumns;
      }

      // Data lives in the shared spreadsheet_cells table — any open datagrid
      // view reads it live. Tell them to reload so they reflect this sheet
      // without waiting for a manual refresh.
      if (linkedGridId && (changes.length > 0 || structureNow)) {
        notifyDatagridUpdated();
      }

    } catch (err) {
      console.error("Failed to save spreadsheet changes:", err);
    } finally {
      saving = false;
      if (pendingFlush) {
        pendingFlush = false;
        flushChanges();
      }
    }
  }

  // ── Change handlers ─────────────────────────────────────────────────────

  function handleCellChange(colIndex: number, rowIndex: number, value: any, _oldValue: any) {
    if (suppressChanges) return;
    const normalized = String(value ?? "");
    const key = `${rowIndex}:${colIndex}`;
    // Skip d'égalité : un événement fantôme (re-init en place, restore de
    // style…) peut rejouer la même valeur déjà en attente — ne pas re-queuer
    // une sauvegarde redondante (un upsert idempotent est inoffensif, mais
    // chaque edit fantôme relance le debounce → flush → notify → reload).
    if (pendingCellChanges.get(key)?.value === normalized) return;
    pendingCellChanges.set(key, {
      row_index: rowIndex,
      col_index: colIndex,
      value: normalized,
    });
    debouncedSave();
  }

  /** Column/row inserted, deleted, moved or resized → structural save. */
  function handleStructureChange() {
    if (suppressChanges) return;
    structureDirty = true;
    debouncedSave();
  }

  /** Toolbar formatting (bold/italic/align/color) → structural save. */
  function handleStyleChange() {
    if (restoring || suppressChanges) return;
    structureDirty = true;
    debouncedSave();
  }

  // ── Import dialog ───────────────────────────────────────────────────────

  async function handleImport() {
    const { importFileToMatrix } = await import("@/lib/spreadsheet/import");

    const path = await pickXlsx("Fichier à importer");
    if (!path) return;

    try {
      const results = await importFileToMatrix({ path });
      if (results.length === 0) return;
      importSheets = results;
      importPath = path;
      importDialogOpen = true;
    } catch (err) {
      console.error("Import failed:", err);
    }
  }

  function handleImported(imported: { id: string; name: string }[]) {
    importDialogOpen = false;
    if (imported.length === 0) return;
    // In create mode, upgrade the tab via the panel store instead of
    // setting the prop directly — this keeps the store in sync across sessions.
    if (!spreadsheetId) {
      initialLoading = true;
      window.dispatchEvent(new CustomEvent("azprose:spreadsheet-set-id", {
        detail: { id: imported[0].id, title: imported[0].name },
      }));
      return;
    }
    // Switching sheet in place (import into an open tab): flush pending edits
    // of the CURRENT sheet FIRST — the pending map is keyed "row:col" without
    // a sheet id, a flush after the switch would save them against the NEW id.
    void flushPendingBeforeSwitch().then(() => {
      spreadsheetId = imported[0].id;
      load();
    });
  }

  // ── Create new spreadsheet ────────────────────────────────────────────

  async function handleCreateSubmit() {
    const id = crypto.randomUUID();
    const cols: ColumnDef[] = createColTitles.map((title) => ({
      title,
      type: "text",
      width: title ? 120 : 100,
    }));
    const rows: string[][] = Array.from({ length: createRowCount }, () =>
      Array.from({ length: createColCount }, () => "")
    );
    try {
      await spreadsheetCreate(id, createName, cols, rows, undefined);
      createDialogOpen = false;
      // Ensure initialLoading=true BEFORE the prop changes, so the template
      // never renders Spreadsheet briefly with stale initialLoading=false.
      initialLoading = true;
      // Upgrade the current tab with the real spreadsheetId
      window.dispatchEvent(new CustomEvent("azprose:spreadsheet-set-id", {
        detail: { id, title: createName },
      }));
    } catch (err) {
      console.error("Failed to create spreadsheet:", err);
    }
  }

  // ── Manage / Open spreadsheets ─────────────────────────────────────────

  function handleManage() {
    managerOpen = true;
  }

  async function handleManagerOpenSheet(id: string, openInNewTab: boolean) {
    managerOpen = false;
    if (openInNewTab) {
      window.dispatchEvent(new CustomEvent("azprose:spreadsheet-open-new", {
        detail: { id },
      }));
    } else {
      if (id === spreadsheetId) return; // Already showing this sheet
      // In create mode (no spreadsheetId), upgrade the tab via the panel store
      // so the $effect / prop change triggers load() cleanly.
      if (!spreadsheetId) {
        try {
          const data = await spreadsheetGet(id);
          initialLoading = true;
          window.dispatchEvent(new CustomEvent("azprose:spreadsheet-set-id", {
            detail: { id, title: data.name },
          }));
        } catch (err) {
          console.error("Failed to open spreadsheet:", err);
        }
        return;
      }
      // Switching sheet in place: flush the CURRENT sheet's pending edits
      // before the id changes (the pending map is not sheet-scoped — a flush
      // after the switch would save them against the NEW id).
      await flushPendingBeforeSwitch();
      spreadsheetId = id;
      await load();
    }
  }

  /** Flushe les edits en attente du tableur courant avant un changement de
   *  feuille en place. Le rechargement en place (reload()) ne démonte PAS le
   *  composant, donc `flushOnDestroy` ne se déclenche pas pour l'ancienne
   *  feuille — il faut donc sauver explicitement. */
  async function flushPendingBeforeSwitch() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (pendingCellChanges.size > 0 || structureDirty) {
      await flushChanges();
    }
  }

  // ── Export (via ExportPopup + SheetJS) ──────────────────────────────────

  async function handleExport(request: ExportRequest) {
    const sheet = spreadsheetRef?.getApi()?.[0];
    if (!sheet) return;

    const gridData = sheet.getData() as (string | number | boolean)[][];
    const headerTitles = columns.map((c, i) => c.title || String.fromCharCode(65 + i));

    // Build workbook: header row + data rows
    const sheetData = [headerTitles, ...gridData];

    // Determine filename and filter
    const fmt = request.format || "xlsx";
    const isXlsx = fmt === "xlsx";
    const ext = isXlsx ? "xlsx" : "csv";
    const label = isXlsx ? "Excel" : "CSV";

    // Open save dialog
    const path = await save({
      filters: [{ name: label, extensions: [ext] }],
      defaultPath: `${request.fileName || sheetName || "export"}.${ext}`,
    });
    if (!path) return;

    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName || "Sheet1");

      const buf = XLSX.write(wb, {
        bookType: isXlsx ? "xlsx" : "csv",
        type: "array",
      }) as Uint8Array;

      await writeFile(path, buf);
    } catch (err) {
      console.error("Export failed:", err);
    }
  }

  // ── Save (Ctrl+S / toolbar Save) ─────────────────────────────────────────

  function handleSave() {
    // Safety net: flush the FULL snapshot immediately (columns + cells +
    // state) instead of the incremental path — a single replace-all write.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    pendingCellChanges.clear();
    structureDirty = false;
    const sheet = spreadsheetRef?.getApi()?.[0];
    if (!sheet || !spreadsheetId) return;
    const currentData = sheet.getData() as (string | number | boolean)[][];
    const strData = currentData.map((row) =>
      Array.from({ length: row.length }, (_, c) => String(row[c] ?? ""))
    );
    const liveColumns = buildColumnsFromSheet(sheet);
    const stylesJson = captureStyles(sheet);
    const finalState = { ...viewState, styles: stylesJson };
    // Refresh the link (it may have appeared after mount) so open datagrid
    // views are notified to reload.
    refreshLinkedGrid().then(() => {
      spreadsheetSaveAll(spreadsheetId, liveColumns, strData, finalState)
        .then(() => {
          viewState = finalState;
          columns = liveColumns;
          if (linkedGridId) {
            notifyDatagridUpdated();
          }
        })
        .catch((err: unknown) => console.error("Failed to save spreadsheet:", err));
    });
  }

  /** Tell any open datagrid view that its linked grid changed → reload. */
  function notifyDatagridUpdated() {
    if (!linkedGridId) return;
    window.dispatchEvent(new CustomEvent("azprose:datagrid-updated", {
      detail: { datagridId: linkedGridId },
    }));
  }

  /**
   * Refresh the cached linked grid id. The link is only found on mount
   * ($effect above); if a grid is created afterwards (toolbar button), this
   * re-check picks it up so open datagrid views get notified to reload.
   */
  async function refreshLinkedGrid() {
    if (linkedGridId) return; // already linked
    try {
      const meta = await datagridFindBySource(spreadsheetId);
      linkedGridId = meta?.id ?? null;
    } catch {
      // keep previous value (null) — next flush will retry
    }
  }

  // ── Toolbar ─────────────────────────────────────────────────────────────

  /**
   * Toolbar button: open (or create, then open) the linked grid for the
   * current spreadsheet in the DataFilter side panel. The actual create/find
   * logic lives in app.svelte ("azprose:datafilter-open" listener).
   */
  function openInDataFilter() {
    if (!spreadsheetId) return;
    window.dispatchEvent(new CustomEvent("azprose:datafilter-open", {
      detail: { spreadsheetId, name: sheetName || "Tableau" },
    }));
  }

  function buildToolbar(defaultToolbar: any, _instance: any[]) {
    // The default jspreadsheet toolbar ships a legacy "save" item (calls
    // download()) right after undo/redo. Our own Save button (handleSave)
    // is prepended below, so drop the legacy duplicate. Also drop the
    // font-family select: cell fonts now follow the app-wide preview fonts
    // (--font-preview), so a per-cell font picker only adds friction.
    const defaultItems = (defaultToolbar.items || []).filter(
      (item: any) =>
        item.content !== "save" &&
        !(item.type === "select" && Array.isArray(item.options) && item.options.includes("Verdana")),
    );
    return {
      ...defaultToolbar,
      title: false,
      items: [
        // File operations on the left
        {
          content: "download",
          title: "Importer",
          onclick: () => handleImport(),
        },
        {
          content: "upload",
          title: "Exporter",
          onclick: (e: MouseEvent) => {
            exportAnchor = e.currentTarget as HTMLElement;
            exportPopupOpen = true;
          },
        },
        {
          content: "folder_managed",
          title: "Gérer les tableaux",
          onclick: () => handleManage(),
        },
        {
          content: "grid_view",
          title: "Ouvrir dans le filtre de données",
          onclick: () => openInDataFilter(),
        },
        {
          content: "save",
          title: "Save",
          onclick: () => handleSave(),
        },
        { type: "divisor" },
        // Default jspreadsheet items (undo, redo, formatting, etc.)
        ...defaultItems,
      ],
    };
  }

  // ── Full save on destroy ──────────────────────────────────────────────

  /**
   * Flush pending save before jspreadsheet is destroyed.
   * Called synchronously from Spreadsheet.svelte's onDestroy (with the raw
   * api — the `spreadsheetRef` bind:this may already be cleared at that
   * point), BEFORE jspreadsheet.destroy() runs. Captures data now, fires
   * the async IPC after a microtask so the component lifecycle can complete.
   */
  function flushOnDestroy(api: JspreadsheetInstance[] | null) {
    const sheet = api?.[0];
    if (!sheet || !spreadsheetId) return;
    // Cancel any pending debounced save
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    pendingCellChanges.clear();
    structureDirty = false;
    // Capture data synchronously while the API is valid (live columns too,
    // so structural changes made since the last flush are not lost)
    const currentData = sheet.getData() as (string | number | boolean)[][];
    const strData = currentData.map((row) =>
      Array.from({ length: row.length }, (_, c) => String(row[c] ?? ""))
    );
    const liveColumns = buildColumnsFromSheet(sheet);
    const stylesJson = captureStyles(sheet);
    const finalState = { ...viewState, styles: stylesJson };
    // Fire async save — don't await, let the destroy complete
    setTimeout(() => {
      spreadsheetSaveAll(spreadsheetId, liveColumns, strData, finalState)
        .catch((err: unknown) => console.error("Failed to save on close:", err));
    }, 0);
  }
</script>

<!-- ── Create dialog ─────────────────────────────────────────────── -->
{#if createDialogOpen}
  <Modal title="Créer un tableau" oncancel={() => createDialogOpen = false} buttons={[]}>
    {#snippet children()}
      <div class="create-form">
        <label class="create-field">
          <span>Nom</span>
          <input type="text" bind:value={createName} placeholder="Nouveau tableau" />
        </label>
        <div class="create-row">
          <label class="create-field create-field--num">
            <span>Colonnes</span>
            <input type="number" min="1" max="50" bind:value={createColCount} />
          </label>
          <label class="create-field create-field--num">
            <span>Lignes</span>
            <input type="number" min="1" max="5000" bind:value={createRowCount} />
          </label>
        </div>
        <div class="create-cols">
          <span class="create-cols__label">Titres des colonnes</span>
          {#each createColTitles as _, i}
            <input
              type="text"
              class="create-col-title"
              bind:value={createColTitles[i]}
              placeholder="Colonne {String.fromCharCode(65 + i)}"
            />
          {/each}
        </div>
      </div>
      <div class="create-footer">
        <Button type="secondary" onclick={() => createDialogOpen = false}>Annuler</Button>
        <Button type="primary" onclick={handleCreateSubmit}>Créer</Button>
      </div>
    {/snippet}
  </Modal>
{/if}

<ImportSpreadsheetDialog
  open={importDialogOpen}
  sheets={importSheets}
  originalPath={importPath}
  onClose={() => importDialogOpen = false}
  onImported={handleImported}
/>

<SpreadsheetManager
  open={managerOpen}
  currentId={spreadsheetId ?? ""}
  onClose={() => managerOpen = false}
  onOpenSheet={handleManagerOpenSheet}
  onCurrentDeleted={() => { cleared = true; }}
/>

{#if exportPopupOpen && exportAnchor}
  <ExportPopup
    title="Exporter le tableur"
    tabs={["xlsx"]}
    parent={exportAnchor}
    initial={{
      fileName: sheetName || "export",
    }}
    onexport={(request) => {
      handleExport(request);
      exportPopupOpen = false;
    }}
    onclose={() => { exportPopupOpen = false; }}
  />
{/if}

{#if initialLoading}
  <div class="spreadsheet-loading">Chargement…</div>
{:else if !spreadsheetId || cleared}
  <div class="spreadsheet-empty">
    <div class="spreadsheet-empty__frame">
      <span class="spreadsheet-empty__icon material-symbols-outlined">grid_on</span>
      <h3 class="spreadsheet-empty__title">Tableur</h3>
      <p class="spreadsheet-empty__desc">
        Créez un nouveau tableau ou importez un fichier existant.
      </p>
      <div class="spreadsheet-empty__actions">
        <button type="button" class="spreadsheet-empty__btn spreadsheet-empty__btn--primary" onclick={() => createDialogOpen = true}>
          <span class="material-symbols-outlined">add</span>
          Nouveau
        </button>
        <button type="button" class="spreadsheet-empty__btn spreadsheet-empty__btn--secondary" onclick={handleImport}>
          <span class="material-symbols-outlined">download</span>
          Importer
        </button>
        <button type="button" class="spreadsheet-empty__btn spreadsheet-empty__btn--secondary" onclick={handleManage}>
          <span class="material-symbols-outlined">folder_managed</span>
          Ouvrir
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="spreadsheet-viewer-wrapper">
    <Spreadsheet
      bind:this={spreadsheetRef}
      {data}
      {columns}
      toolbar={(dt: any, inst: any[]) => buildToolbar(dt, inst)}
      onchange={handleCellChange}
      onStructureChange={handleStructureChange}
      onStyleChange={handleStyleChange}
      onsave={handleSave}
      onReady={restoreViewState}
      onBeforeDestroy={flushOnDestroy}
      worksheetOptions={{
        filters: true,
        columnSorting: true,
        textOverflow: false,
        freezeColumns: Number(viewState.frozen_columns) || 0,
        search: true,
        wordWrap: true,
        columnDrag: true,
        rowDrag: true,
        rowResize: true,
      }}
    />
  </div>
{/if}

<style>
  .spreadsheet-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: 14px;
  }

  .spreadsheet-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-family: var(--font-ui);
  }

  .spreadsheet-empty__frame {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 64px;
    border: 2px dashed var(--border, #ccc);
    border-radius: 12px;
    max-width: 440px;
    text-align: center;
  }

  .spreadsheet-empty__icon {
    font-size: 40px;
    color: var(--muted);
  }

  .spreadsheet-empty__title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
  }

  .spreadsheet-empty__desc {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.4;
  }

  .spreadsheet-empty__actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .spreadsheet-empty__btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 18px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    font-family: var(--font-ui);
    transition: filter 0.15s;
  }

  .spreadsheet-empty__btn:hover {
    filter: brightness(1.1);
  }

  .spreadsheet-empty__btn--primary {
    background: var(--accent);
    color: var(--accent-fg, #fff);
  }

  .spreadsheet-empty__btn--secondary {
    background: var(--bg2, #e8e8e8);
    color: var(--text);
  }

  .spreadsheet-viewer-wrapper {
    height: 100%;
    overflow: hidden;
  }

  /* ── Create dialog ────────────────────────────────────────── */
  .create-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 320px;
  }

  .create-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .create-field > span {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .create-field input {
    padding: 6px 10px;
    border: 1px solid var(--border, #ccc);
    border-radius: 4px;
    font-size: 14px;
    font-family: var(--font-ui);
    background: var(--bg);
    color: var(--text);
  }

  .create-row {
    display: flex;
    gap: 12px;
  }
  .create-field--num {
    flex: 1;
    max-width: 120px;
  }

  .create-cols {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 200px;
    overflow-y: auto;
  }
  .create-cols__label {
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .create-col-title {
    padding: 5px 8px;
    border: 1px solid var(--border, #ccc);
    border-radius: 4px;
    font-size: 13px;
    font-family: var(--font-ui);
    background: var(--bg);
    color: var(--text);
  }

  .create-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
</style>
