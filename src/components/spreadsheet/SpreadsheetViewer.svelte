<script lang="ts">
  import Spreadsheet from "./Spreadsheet.svelte";
  import type { JspreadsheetInstance } from "./Spreadsheet.svelte";
  import ImportSpreadsheetDialog from "./dialogs/ImportSpreadsheetDialog.svelte";
  import SpreadsheetManager from "./dialogs/SpreadsheetManager.svelte";
  import { Modal, Button } from "@svar-ui/svelte-core";
  import { ExportPopup } from "@svar-ui/svelte-export-popup";
  import type { ExportRequest } from "@svar-ui/svelte-export-popup";
  import {
    spreadsheetGet, spreadsheetCreate, spreadsheetSaveCells,
    spreadsheetSaveState,
    spreadsheetSaveAll,
  } from "@/spreadsheet/store";
  import type { ColumnDef, SpreadsheetViewState } from "@/spreadsheet/types";
  import { datagridFindBySource, datagridSyncFromSpreadsheet } from "@/datagrid/store";
  let {
    spreadsheetId = "",
  }: {
    spreadsheetId?: string;
  } = $props();

  // When the current spreadsheet is deleted via Gérer,
  // we clear local state and show the empty view (tab stays open).
  let cleared = $state(false);

  let loading = $state(true);
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
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Live bridge to a linked SVAR datagrid ──────────────────────────────
  // When this spreadsheet is the source of a datagrid (source_spreadsheet_id),
  // cell edits are mirrored into that grid so both representations stay in
  // sync. The grid is found once per spreadsheet open; re-sync happens AFTER
  // the SQLite cell save (in doSaveCells) so the bridge never reads a stale
  // spreadsheet snapshot.
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
        if (linkedGridId) {
          console.log(`[spreadsheet] live bridge: grid "${linkedGridId}" follows this sheet`);
        }
      })
      .catch((err) => {
        if (!cancelled) console.warn("[spreadsheet] bridge lookup failed:", err);
      });
    return () => {
      cancelled = true;
    };
  });

  async function syncLinkedGrid() {
    if (!linkedGridId) return;
    try {
      const gridId = await datagridSyncFromSpreadsheet(spreadsheetId);
      if (gridId) {
        window.dispatchEvent(new CustomEvent("azprose:datagrid-synced", {
          detail: { spreadsheetId, gridId },
        }));
      }
    } catch (err) {
      console.warn("[spreadsheet] live bridge sync failed:", err);
    }
  }

  // ── Load ────────────────────────────────────────────────────────────────

  // Generation counter to avoid stale completions from parallel load() calls.
  // NOT reactive — plain variable to avoid triggering the $effect on write.
  let loadGen = -1;

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
        sheet.setStyle(styles);
      }
    } catch (e) {
      console.warn("[spreadsheet] failed to restore styles:", e);
    }
  }

  async function load() {
    if (!spreadsheetId) return;
    cleared = false;
    loading = true;
    const gen = ++loadGen;
    try {
      const result = await spreadsheetGet(spreadsheetId);
      // Discard result if a newer load is already running
      if (gen !== loadGen) return;

      // Skip rendering if the result has no columns (broken old "Nouveau tableur" entries)
      if (result.columns.length === 0) {
        loading = false;
        cleared = true;
        return;
      }
      sheetName = result.name;
      data = result.data;
      columns = autoDetectColumnTypes(result.data, result.columns);
      viewState = result.state;
      // Sync lastSavedData with the fresh data so the next diff works
      lastSavedData = result.data.map((row) => [...row]);
      loading = false;

      // Note: styles / hidden cols are restored via onReady (called after
      // Spreadsheet.svelte's init() has set the api reference).
      // We no longer try to restore them here because init() runs
      // asynchronously and the jspreadsheet instance isn't ready yet.

      // Always sync the tab title with the database name.
      window.dispatchEvent(new CustomEvent("azprose:spreadsheet-title-change", {
        detail: { spreadsheetId, title: result.name },
      }));
    } catch (err) {
      // Only report if no newer load superseded this one
      if (gen === loadGen) {
        console.error("Failed to load spreadsheet:", err);
        loading = false;
        cleared = true; // Show empty/create UI instead of a broken grid
      }
    }
  }

  $effect(() => {
    const id = spreadsheetId;
    if (id) {
      load();
    } else {
      loading = false;
    }
  });

  // ── SQLite persistence on cell change ─────────────────────────────────

  // Non-reactive copy of last saved data, used ONLY for diff computation
  // in doSaveCells(). DO NOT make this $state — updating a $state variable
  // would trigger Spreadsheet.svelte's $effect → init() → destroys the
  // jspreadsheet instance and loses all in-memory state (styles, selection…).
  let lastSavedData: string[][] = [];

  function debouncedSaveCells() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      doSaveCells();
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

  async function doSaveCells() {
    const sheet = spreadsheetRef?.getApi()?.[0];
    if (!sheet) return;
    const currentData = sheet.getData() as (string | number | boolean)[][];
    const numCols = columns.length || (currentData[0]?.length ?? 0);
    const changes: { row: number; col: number; value: string }[] = [];
    for (let r = 0; r < currentData.length; r++) {
      const row = currentData[r];
      for (let c = 0; c < numCols; c++) {
        const val = String(row?.[c] ?? "");
        const oldVal = lastSavedData[r]?.[c] ?? "";
        if (val !== oldVal) {
          changes.push({ row: r, col: c, value: val } as any);
        }
      }
    }
    // Update the non-reactive diff copy — DO NOT update `data` (a $state)
    // because that would trigger Spreadsheet.svelte's $effect → init() and
    // destroy the current jspreadsheet instance.
    lastSavedData = currentData.map((row) =>
      Array.from({ length: numCols }, (_, c) => String(row[c] ?? ""))
    );
    try {
      if (changes.length > 0) {
        await spreadsheetSaveCells(spreadsheetId, changes);
      }
      // Also persist styles (save debounced across value saves)
      const stylesJson = captureStyles(sheet);
      viewState = { ...viewState, styles: stylesJson };
      await spreadsheetSaveState(spreadsheetId, viewState);
      // Live bridge: mirror the now-persisted snapshot into the linked
      // datagrid (after the save so we never read a stale sheet).
      await syncLinkedGrid();
    } catch (err) {
      console.error("Failed to save cells:", err);
    }
  }

  // ── Change handler ──────────────────────────────────────────────────────

  function handleCellChange(_colIndex: number, _rowIndex: number, _value: any, _oldValue: any) {
    debouncedSaveCells();
  }

  // ── Import dialog ───────────────────────────────────────────────────────

  async function handleImport() {
    const { importFileToMatrix } = await import("@/lib/spreadsheet/import");
    const { pickXlsx } = await import("@/lib/files");

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
      loading = true;
      window.dispatchEvent(new CustomEvent("azprose:spreadsheet-set-id", {
        detail: { id: imported[0].id, title: imported[0].name },
      }));
      return;
    }
    spreadsheetId = imported[0].id;
    load();
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
      // Ensure loading=true BEFORE the prop changes, so the template
      // never renders Spreadsheet briefly with stale loading=false.
      loading = true;
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
          loading = true;
          window.dispatchEvent(new CustomEvent("azprose:spreadsheet-set-id", {
            detail: { id, title: data.name },
          }));
        } catch (err) {
          console.error("Failed to open spreadsheet:", err);
        }
        return;
      }
      spreadsheetId = id;
      await load();
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
    const { save } = await import("@tauri-apps/plugin-dialog");
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

      const { writeFile } = await import("@tauri-apps/plugin-fs");
      await writeFile(path, buf);
    } catch (err) {
      console.error("Export failed:", err);
    }
  }

  // ── Save (Ctrl+S / toolbar Save) ─────────────────────────────────────────

  function handleSave() {
    // Flush pending debounced save immediately
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    doSaveCells();
  }

  // ── Toolbar ─────────────────────────────────────────────────────────────

  /**
   * Test button: open (or create, then open) the linked datagrid for the
   * current spreadsheet in the side panel. The actual create/find logic
   * lives in app.svelte ("azprose:datagrid-open" listener).
   */
  function openInDatagrid() {
    if (!spreadsheetId) return;
    window.dispatchEvent(new CustomEvent("azprose:datagrid-open", {
      detail: { spreadsheetId, name: sheetName || "Datagrid" },
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
          title: "Ouvrir dans datagrid",
          onclick: () => openInDatagrid(),
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
   * Called synchronously from Spreadsheet.svelte's onDestroy,
   * BEFORE jspreadsheet.destroy() runs. Captures data now, fires
   * the async IPC after a microtask so the component lifecycle
   * can complete.
   */
  function flushOnDestroy() {
    const sheet = spreadsheetRef?.getApi()?.[0];
    if (!sheet || !spreadsheetId) return;
    // Cancel any pending debounced save
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    // Capture data synchronously while the API is valid
    const currentData = sheet.getData() as (string | number | boolean)[][];
    const numCols = columns.length || (currentData[0]?.length ?? 0);
    const strData = currentData.map((row) =>
      Array.from({ length: numCols }, (_, c) => String(row[c] ?? ""))
    );
    const stylesJson = captureStyles(sheet);
    const finalState = { ...viewState, styles: stylesJson };
    // Fire async save — don't await, let the destroy complete
    setTimeout(() => {
      spreadsheetSaveAll(spreadsheetId, columns, strData, finalState)
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

{#if loading}
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
