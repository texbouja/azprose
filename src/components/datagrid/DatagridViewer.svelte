<script lang="ts">
  // ── SVAR datagrid viewer (édition directe) ───────────────────────────────
  // Vue éditable d'une datagrid liée à un tableur (source_spreadsheet_id) :
  //  - données chargées depuis la table SQLite du tableur (spreadsheetGet) —
  //    c'est la source de vérité, la datagrid n'est que la représentation SVAR
  //  - chaque édition de cellule est persistée via `spreadsheetSaveCells`
  //    (upsert natif ON CONFLICT, O(changements)) puis reflétée dans la
  //    snapshot datagrid (`datagridSyncCells`) — même contrat que le viewer
  //    tableur, les deux représentations restent synchronisées
  //  - undo/redo natifs du Grid SVAR (mode `undo`) : les rejoués portent
  //    `eventSource: "undo"` et SONT persistés comme toute édition
  //  - toolbar : undo/redo (état depuis l'historique), filtre Finder-like
  //    (FilterEditor @svar-ui/svelte-filter → `filter-rows`), et ouverture
  //    du tableur source en panneau principal (« Edit dans Spreadsheet »)
  //  - rechargement inverse : écoute `azprose:datagrid-updated` (le viewer
  //    tableur pousse ses propres modifications via le pont live)
  //  - datagrid non liée (pas de tableur source) : fallback en lecture seule
  //    (tableau HTML simple), la grille éditable n'a pas de source d'écriture.

  import { onMount, onDestroy, tick } from "svelte";
  import Datagrid from "./Datagrid.svelte";
  import type { UpdateCellPayload } from "./Datagrid.svelte";
  import { FilterEditor } from "@svar-ui/svelte-filter";
  import { getFilter } from "@svar-ui/filter-store";
  import type { IField, IFilter, TPredicate } from "@svar-ui/filter-store";
  import type { IColumn, IRow, IApi, IColumnEditor, IOption } from "@svar-ui/grid-store";
  import { datagridGet, datagridSyncCells } from "@/datagrid/store";
  import type { DatagridData, DatagridColumnDef } from "@/datagrid/types";
  import { spreadsheetGet, spreadsheetSaveCells } from "@/spreadsheet/store";
  import type { ColumnDef, CellChange } from "@/spreadsheet/types";

  let {
    datagridId = "",
  }: {
    datagridId?: string;
  } = $props();

  /** `true` uniquement tant que le premier chargement n'est pas terminé.
   *  Les rechargements suivants (pont live) NE démontent PAS le Grid :
   *  démonter/remonter `<Datagrid>` à chaque reload détruit le DataStore
   *  (sélection, scroll, éditeur, undo), et c'est le symptôme d'un
   *  « rafraîchissement en boucle » quand un événement se ré-émet. */
  let initialLoading = $state(true);
  let error = $state<string | null>(null);
  let grid = $state<DatagridData | null>(null);

  // ── Données de la grille SVAR ────────────────────────────────────────────
  let svarColumns: IColumn[] = $state([]);
  let svarRows: IRow[] = $state([]);
  let gridName = $state("");
  let sheetName = $state("");
  /** Id du tableur source — null = datagrid autonome (lecture seule). */
  let spreadsheetId = $state<string | null>(null);
  let loadGen = -1;

  /** Fenêtre de suppression des `update-cell` pendant un remplacement des
   *  données (`svarColumns`/`svarRows`) : le Grid SVAR ré-exécute
   *  `$effect(reinitStore)` → `dataStore.init()` à chaque changement de props
   *  et un re-init peut rejouer un `update-cell` fantôme — ne pas le
   *  persister comme un edit utilisateur. Plain variable, jamais rendue. */
  let suppressGridUpdates = false;

  /** Remplace les données de la grille sous suppression d'événements : les
   *  `update-cell` émis pendant le re-init du Grid (synchrones dans le flush
   *  Svelte + un macrotask pour les différés) sont ignorés. */
  async function setGridData(cols: IColumn[], rows: IRow[]) {
    suppressGridUpdates = true;
    svarColumns = cols;
    svarRows = rows;
    try {
      await tick();
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      suppressGridUpdates = false;
    }
  }

  // ── API Grid + historique undo/redo ──────────────────────────────────────
  let gridApi: IApi | null = $state(null);
  let canUndo = $state(false);
  let canRedo = $state(false);

  function handleReady(api: IApi) {
    gridApi = api;
  }

  // `IPublicWritable.subscribe` ne renvoie pas d'unsubscribe — on s'abonne
  // donc une seule fois par instance d'API (le composant Grid meurt avec sa
  // grille, donc l'abonnement vit exactement aussi longtemps que l'api).
  const subscribedHistoryApis = new WeakSet<IApi>();

  $effect(() => {
    const api = gridApi;
    if (!api || subscribedHistoryApis.has(api)) return;
    subscribedHistoryApis.add(api);
    const hist = api.getReactiveState().history;
    hist?.subscribe?.((h) => {
      canUndo = !!h?.undo;
      canRedo = !!h?.redo;
    });
  });

  function execUndo() {
    gridApi?.exec("undo").catch((e: unknown) => console.warn("[datagrid] undo:", e));
  }
  function execRedo() {
    gridApi?.exec("redo").catch((e: unknown) => console.warn("[datagrid] redo:", e));
  }

  // ── Mapping spreadsheet → grille SVAR ────────────────────────────────────

  /** jspreadsheet `ColumnDef.options` (JSON string) → options SVAR IOption[]. */
  function parseOptions(raw: string | null | undefined): IOption[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => {
          if (typeof v === "object" && v !== null) {
            const o = v as Record<string, unknown>;
            return {
              id: String(o.id ?? o.value ?? ""),
              label: String(o.label ?? o.name ?? o.id ?? o.value ?? ""),
            };
          }
          return { id: String(v), label: String(v) };
        });
      }
      if (typeof parsed === "object" && parsed !== null) {
        return Object.entries(parsed).map(([id, label]) => ({ id, label: String(label) }));
      }
    } catch {}
    return [];
  }

  /** Type jspreadsheet → éditeur SVAR (text/richselect/datepicker). */
  function toSvarEditor(col: ColumnDef): IColumnEditor | undefined {
    switch (col.type) {
      case "dropdown": {
        const options = parseOptions(col.options);
        if (options.length > 0) return { type: "richselect", config: { options } };
        return undefined;
      }
      case "checkbox":
        return {
          type: "richselect",
          config: {
            options: [
              { id: "true", label: "✓" },
              { id: "false", label: "✗" },
            ],
          },
        };
      case "calendar":
        return { type: "datepicker" };
      case "text":
      case "numeric":
      case "html":
      case "color":
      default:
        return { type: "text" };
    }
  }

  function mapColumns(cols: ColumnDef[]): IColumn[] {
    return cols.map((c, i) => {
      const col: IColumn = {
        id: `c${i}`,
        header: c.title || String.fromCharCode(65 + i),
        width: c.width || 120,
      };
      const editor = toSvarEditor(c);
      if (editor) col.editor = editor;
      return col;
    });
  }

  /** Matrice CSV → lignes SVAR : { id: "r{r}", "c0": …, "c1": … }. */
  function mapRows(data: string[][]): IRow[] {
    return data.map((row, r) => {
      const obj: IRow = { id: `r${r}` };
      for (let c = 0; c < row.length; c++) obj[`c${c}`] = row[c] ?? "";
      return obj;
    });
  }

  // ── Load ────────────────────────────────────────────────────────────────

  /** Dernier titre dispatché (évite les re-dispatches à chaque load). */
  let lastDispatchedTitle = "";

  /** Dernier déclencheur de load() (debug boucle). */
  let loadTrigger: string = "effect(datagridId)";

  // Garde anti-boucle : si un chemin d'événements ré-appelle load() en rafale
  // (ex. title-change → notify → remount → load → title-change), on coupe AVANT
  // de geler l'interface et on logge la boucle pour le debug.
  let reloadTimes: number[] = [];

  function tooManyReloads(): boolean {
    const now = Date.now();
    reloadTimes = reloadTimes.filter((t) => now - t < 5000);
    reloadTimes.push(now);
    return reloadTimes.length > 25;
  }

  async function load() {
    if (!datagridId) return;
    if (tooManyReloads()) {
      console.error("datagrid load() en boucle — coupe la cascade. dernier déclencheur:", loadTrigger);
      return;
    }
    error = null;
    const gen = ++loadGen;
    loadTrigger = "load()";
    try {
      const dg = await datagridGet(datagridId);
      if (gen !== loadGen) return;
      grid = dg;
      gridName = dg.name;

      // Titre de l'onglet depuis la datagrid elle-même — seulement s'il a
      // changé (un re-dispatch à chaque load() ferait notify → save session
      // → re-render inutilement, un amplificateur de boucle potentiel).
      if (lastDispatchedTitle !== dg.name) {
        lastDispatchedTitle = dg.name;
        window.dispatchEvent(new CustomEvent("azprose:datagrid-title-change", {
          detail: { datagridId, title: dg.name },
        }));
      }

      // Datagrid liée → les données viennent du tableur (source de vérité).
      const src = dg.source_spreadsheet_id ?? null;
      if (src) {
        try {
          const sheet = await spreadsheetGet(src);
          if (gen !== loadGen) return;
          spreadsheetId = src;
          sheetName = sheet.name;
          await setGridData(mapColumns(sheet.columns), mapRows(sheet.data));
        } catch (err) {
          if (gen === loadGen) {
            // Tableur source introuvable → repli lecture seule sur la snapshot.
            console.warn("[datagrid] linked spreadsheet load failed, using snapshot:", err);
            spreadsheetId = null;
            await setGridData(
              dg.columns.map((c) => ({
                id: c.id,
                header: c.title || c.id,
                width: c.width || 120,
              })),
              dg.rows.map((r) => {
                const parsed = parseRow(r.data);
                return { id: r.id, ...parsed };
              }),
            );
          }
        }
      } else {
        spreadsheetId = null;
        await setGridData(
          dg.columns.map((c) => ({
            id: c.id,
            header: c.title || c.id,
            width: c.width || 120,
          })),
          dg.rows.map((r) => {
            const parsed = parseRow(r.data);
            return { id: r.id, ...parsed };
          }),
        );
      }
      initialLoading = false;
    } catch (err) {
      if (gen === loadGen) {
        error = String(err);
        grid = null;
        initialLoading = false;
      }
    }
  }

  $effect(() => {
    const id = datagridId;
    if (id) {
      loadTrigger = "effect(datagridId)";
      load();
    }
  });

  /** Recharger quand le tableur lié pousse ses modifications (pont live). */
  function onGridUpdated(e: Event) {
    const detail = (e as CustomEvent<{ datagridId?: string }>).detail;
    if (detail?.datagridId && detail.datagridId === datagridId) {
      loadTrigger = "azprose:datagrid-updated";
      load();
    }
  }

  onMount(() => {
    window.addEventListener("azprose:datagrid-updated", onGridUpdated);
    return () => window.removeEventListener("azprose:datagrid-updated", onGridUpdated);
  });

  /** Parse un DataHash JSON `{"c0":"x","c1":"y"}` → map {cId: valeur}. */
  function parseRow(data: string): Record<string, string> {
    try {
      const obj = JSON.parse(data);
      const out: Record<string, string> = {};
      for (const k of Object.keys(obj)) out[k] = String(obj[k] ?? "");
      return out;
    } catch {
      return {};
    }
  }

  function cellValue(col: DatagridColumnDef, rowData: string): string {
    return parseRow(rowData)[col.id] ?? "";
  }

  // ── Persistance (spreadsheet_save_cells, incrémentale) ───────────────────
  //
  // Même contrat que le viewer tableur : on accumule les edits dans une Map
  // clé "row:col" et on flushe via l'upsert natif (O(changements)). La
  // snapshot datagrid est ensuite réécrite cellule par cellule
  // (`datagridSyncCells`) pour rester à jour, et un événement
  // `azprose:spreadsheet-updated` dit au viewer tableur de se recharger.
  // Anti-chevauchement saving/pendingFlush : un flush en cours re-queue au
  // lieu d'empiler ; le pending n'est vidé qu'après succès (un échec IPC
  // conserve les edits pour le prochain essai).

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingCellChanges = new Map<string, CellChange>();
  let saving = false;
  let pendingFlush = false;

  function normalizeCellValue(v: string | number | Date): string {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v ?? "");
  }

  function handleUpdateCell(p: UpdateCellPayload) {
    if (suppressGridUpdates) return;
    const rowIndex = Number(String(p.id).replace(/^r/, ""));
    const colIndex = Number(String(p.column).replace(/^c/, ""));
    if (isNaN(rowIndex) || isNaN(colIndex) || rowIndex < 0 || colIndex < 0) return;
    const value = normalizeCellValue(p.value);
    const key = `${rowIndex}:${colIndex}`;
    // Skip d'égalité : un `update-cell` fantôme (re-init du Grid pendant un
    // rechargement du pont live) peut rejouer une valeur déjà en attente —
    // ne pas re-queuer une sauvegarde redondante. On ne compare PAS avec
    // `svarRows` (la prop est périmée après un edit : le DataStore du Grid
    // garde ses propres copies) — cela écraserait un vrai edit de l'utilisateur.
    if (pendingCellChanges.get(key)?.value === value) return;
    pendingCellChanges.set(key, {
      row_index: rowIndex,
      col_index: colIndex,
      value,
    });
    debouncedSave();
  }

  function debouncedSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      flushChanges();
    }, 500);
  }

  async function flushChanges() {
    if (saving) {
      pendingFlush = true;
      return;
    }
    if (!spreadsheetId) return;
    saving = true;
    try {
      const changes = [...pendingCellChanges.values()];
      if (changes.length === 0) return;
      await spreadsheetSaveCells(spreadsheetId, changes);
      // Ne retirer que les edits sauvés — un edit arrivé pendant l'IPC en
      // vol reste en attente pour le prochain flush.
      for (const ch of changes) {
        pendingCellChanges.delete(`${ch.row_index}:${ch.col_index}`);
      }
      // Refléter dans la snapshot datagrid (ids stables r{i}/c{j}).
      await datagridSyncCells(spreadsheetId, changes);
      // Le viewer tableur (s'il est ouvert) doit se recharger.
      window.dispatchEvent(new CustomEvent("azprose:spreadsheet-updated", {
        detail: { spreadsheetId },
      }));
    } catch (err) {
      console.error("[datagrid] save failed:", err);
    } finally {
      saving = false;
      if (pendingFlush) {
        pendingFlush = false;
        flushChanges();
      }
    }
  }

  onDestroy(() => {
    // Filet de fermeture : flusher les edits encore en attente.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (pendingCellChanges.size > 0) flushChanges();
  });

  // ── Filtres (Finder-like) ────────────────────────────────────────────────

  let filterOpen = $state(false);
  let filterField = $state<string | null>(null);
  let activeRules = new Map<string, IFilter>();
  let filterCount = $state(0);

  /** Type de champ pour le FilterEditor (détection simple sur les données). */
  function detectFieldType(colIndex: number, rows: IRow[]): "text" | "number" | "date" {
    let seen = 0;
    for (const row of rows) {
      const v = row[`c${colIndex}`];
      if (v === undefined || v === null || v === "") continue;
      seen++;
      if (isNaN(Number(v))) return "text";
    }
    return seen > 0 ? "number" : "text";
  }

  const filterFields = $derived<IField[]>(
    svarColumns.map((c, i) => ({
      id: String(c.id),
      label: typeof c.header === "string" ? c.header : `Colonne ${i + 1}`,
      type: detectFieldType(i, svarRows),
    })),
  );

  function applyFilters() {
    const api = gridApi;
    if (!api) return;
    if (activeRules.size === 0) {
      api.exec("filter-rows", {}).catch((e: unknown) => console.warn("[datagrid] clear filter:", e));
      return;
    }
    const rules = [...activeRules.values()];
    api.exec("filter-rows", { filter: buildPredicate(rules) })
      .catch((e: unknown) => console.warn("[datagrid] filter:", e));
  }

  /** Combine les règles actives en un prédicat (handlers officiels filter-store). */
  function buildPredicate(rules: IFilter[]): (row: IRow) => boolean {
    return (row) =>
      rules.every((rule) => {
        const v = row[rule.field];
        // Multi-sélection (options) : appartenance à la liste cochée.
        if (rule.includes && rule.includes.length > 0) {
          return rule.includes.includes(v as any);
        }
        if (!rule.filter) return true;
        const h = getFilter(rule.filter, rule.type ?? "text");
        if (!h) return true;
        if (rule.value === undefined || rule.value === null) return true;
        // Les champs "number" stockent des chaînes (origine jspreadsheet) —
        // coerce les deux côtés pour des comparaisons numériques correctes.
        if (rule.type === "number") {
          return h.handler(Number(v), Number(rule.value));
        }
        return h.handler(v, rule.value);
      });
  }

  function handleFilterApply(ev: { value: IFilter }) {
    const rule = ev.value;
    if (rule.field && rule.field !== "*") {
      if (rule.filter || (rule.includes && rule.includes.length > 0)) {
        activeRules.set(rule.field, rule);
      } else {
        activeRules.delete(rule.field);
      }
      filterCount = activeRules.size;
      applyFilters();
    }
    filterOpen = false;
  }

  function handleFilterCancel() {
    filterOpen = false;
  }

  function clearFilters() {
    activeRules.clear();
    filterCount = 0;
    applyFilters();
  }

  function removeRule(field: string) {
    activeRules.delete(field);
    filterCount = activeRules.size;
    applyFilters();
  }

  /** Libellé d'un champ de filtre (`c{i}` → titre de colonne). */
  function fieldLabel(field: string): string {
    const f = filterFields.find((x) => x.id === field);
    if (f) return f.label;
    return field;
  }

  // ── Edit dans Spreadsheet (panneau principal) ────────────────────────────

  function editInSpreadsheet() {
    if (!spreadsheetId) return;
    window.dispatchEvent(new CustomEvent("azprose:datagrid-edit-in-spreadsheet", {
      detail: { spreadsheetId, name: sheetName || gridName || "Tableur" },
    }));
  }
</script>

{#if initialLoading}
  <div class="dg-loading">Chargement…</div>
{:else if error}
  <div class="dg-error">{error}</div>
{:else if !grid}
  <div class="dg-empty">Aucune datagrid.</div>
{:else if !spreadsheetId}
  <!-- Datagrid autonome (lecture seule) : tableau HTML simple. -->
  <div class="dg-wrap">
    <div class="dg-header">
      <span class="dg-name">{grid.name}</span>
      <span class="dg-meta">{grid.rows.length} ligne{grid.rows.length !== 1 ? "s" : ""} · {grid.columns.length} colonne{grid.columns.length !== 1 ? "s" : ""}</span>
      {#if grid.source_spreadsheet_id}
        <span class="dg-badge">liée au tableur</span>
      {/if}
    </div>
    <div class="dg-scroll">
      <table class="dg-table">
        <thead>
          <tr>
            {#each grid.columns as col}
              <th>{col.title || col.id}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each grid.rows as row}
            <tr>
              {#each grid.columns as col}
                <td>{cellValue(col, row.data)}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{:else}
  <div class="dg-viewer">
    <!-- ── Toolbar ── -->
    <div class="dg-toolbar">
      <span class="dg-toolbar__title">
        <span class="material-symbols-outlined dg-toolbar__icon">grid_view</span>
        {sheetName || gridName}
        <span class="dg-toolbar__linked">liée au tableur</span>
      </span>
      <div class="dg-toolbar__spacer"></div>
      <button
        type="button"
        class="dg-btn"
        title="Annuler (Ctrl+Z)"
        disabled={!canUndo}
        onclick={execUndo}
      >
        <span class="material-symbols-outlined">undo</span>
      </button>
      <button
        type="button"
        class="dg-btn"
        title="Rétablir (Ctrl+Y)"
        disabled={!canRedo}
        onclick={execRedo}
      >
        <span class="material-symbols-outlined">redo</span>
      </button>
      <button
        type="button"
        class="dg-btn"
        class:dg-btn--active={filterOpen || filterCount > 0}
        title="Filtrer"
        onclick={() => {
          filterOpen = !filterOpen;
          if (filterOpen) filterField = filterFields[0]?.id ?? null;
        }}
      >
        <span class="material-symbols-outlined">filter_alt</span>
        {#if filterCount > 0}
          <span class="dg-btn__badge">{filterCount}</span>
        {/if}
      </button>
      <span class="dg-toolbar__sep"></span>
      <button
        type="button"
        class="dg-btn dg-btn--text"
        title="Ouvrir le tableur source en panneau principal"
        onclick={editInSpreadsheet}
      >
        <span class="material-symbols-outlined">table_chart</span>
        <span>Edit dans Spreadsheet</span>
      </button>
    </div>

    <!-- ── Popover filtres ── -->
    {#if filterOpen}
      <div class="dg-filter-pop">
        <div class="dg-filter-pop__head">
          <span>Filtres</span>
          <div class="dg-filter-pop__head-actions">
            {#if filterCount > 0}
              <button type="button" class="dg-link" onclick={clearFilters}>Tout effacer</button>
            {/if}
            <button type="button" class="dg-link" onclick={handleFilterCancel}>Fermer</button>
          </div>
        </div>

        {#if activeRules.size > 0}
          <div class="dg-chips">
            {#each [...activeRules.entries()] as [field]}
              <span class="dg-chip" title="Retirer ce filtre">
                <span class="dg-chip__field">{fieldLabel(field)}</span>
                <button type="button" class="dg-chip__x" onclick={() => removeRule(field)} aria-label="Retirer le filtre">×</button>
              </span>
            {/each}
          </div>
        {/if}

        {#if filterField}
          <FilterEditor
            fields={filterFields}
            field={filterField}
            predicate={undefined as unknown as TPredicate}
            onchange={({ value }) => {
              // Aperçu en direct pendant l'édition.
              if (value.field && value.field !== "*") {
                const prev = activeRules.get(value.field);
                if (value.filter || (value.includes && value.includes.length > 0)) {
                  activeRules.set(value.field, value);
                } else if (prev) {
                  activeRules.delete(value.field);
                }
                filterCount = activeRules.size;
                applyFilters();
              }
            }}
            onapply={handleFilterApply}
            oncancel={handleFilterCancel}
          />
        {/if}
      </div>
    {/if}

    <!-- ── Grille SVAR ── -->
    <div class="dg-grid">
      <Datagrid
        data={svarRows}
        columns={svarColumns}
        undo={true}
        reorder={false}
        onReady={handleReady}
        onUpdateCell={handleUpdateCell}
      />
    </div>
  </div>
{/if}

<style>
  .dg-loading,
  .dg-error,
  .dg-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 24px;
    font-family: var(--font-ui, sans-serif);
    font-size: 14px;
    color: var(--muted, #888);
  }

  .dg-error {
    color: var(--color-error, #e53935);
  }

  .dg-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  /* ── Toolbar ── */
  .dg-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border, #ddd);
    background: var(--surface, #fafafa);
    font-family: var(--font-ui, sans-serif);
    font-size: 12px;
    min-height: 40px;
  }

  .dg-toolbar__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: var(--fg, #222);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dg-toolbar__icon {
    font-size: 17px;
    color: var(--muted, #888);
  }

  .dg-toolbar__linked {
    font-size: 10px;
    font-weight: 500;
    padding: 1px 7px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent, #4a90d9) 14%, transparent);
    color: var(--accent, #4a90d9);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .dg-toolbar__spacer {
    flex: 1;
  }

  .dg-toolbar__sep {
    width: 1px;
    height: 18px;
    background: var(--border, #ddd);
    margin: 0 6px;
  }

  .dg-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 28px;
    height: 26px;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--fg-muted, #666);
    font-family: var(--font-ui, sans-serif);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .dg-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--fg, #222) 8%, transparent);
    color: var(--fg, #222);
  }

  .dg-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .dg-btn .material-symbols-outlined {
    font-size: 17px;
    line-height: 1;
  }

  .dg-btn--active {
    background: color-mix(in srgb, var(--accent, #4a90d9) 14%, transparent);
    color: var(--accent, #4a90d9);
  }

  .dg-btn--text {
    padding: 0 10px;
    border-color: var(--border, #ddd);
    background: var(--bg, #fff);
  }

  .dg-btn--text:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent, #4a90d9) 8%, transparent);
    color: var(--accent, #4a90d9);
    border-color: var(--accent, #4a90d9);
  }

  .dg-btn__badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: var(--accent, #4a90d9);
    color: var(--accent-fg, #fff);
    font-size: 9px;
    font-weight: 700;
    line-height: 14px;
    text-align: center;
    display: inline-block;
  }

  .dg-btn {
    position: relative;
  }

  /* ── Popover filtres ── */
  .dg-filter-pop {
    position: absolute;
    top: 40px;
    right: 10px;
    z-index: 20;
    width: 340px;
    max-height: 70%;
    overflow-y: auto;
    background: var(--surface, #fff);
    border: 1px solid var(--border, #ddd);
    border-radius: 8px;
    box-shadow: 0 8px 28px color-mix(in srgb, var(--fg, #000) 18%, transparent);
    padding: 10px 12px;
    font-family: var(--font-ui, sans-serif);
  }

  .dg-filter-pop__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    color: var(--fg, #222);
    margin-bottom: 8px;
  }

  .dg-filter-pop__head-actions {
    display: flex;
    gap: 8px;
  }

  .dg-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent, #4a90d9);
    font-size: 11px;
    font-family: var(--font-ui, sans-serif);
    cursor: pointer;
  }

  .dg-link:hover {
    text-decoration: underline;
  }

  .dg-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 8px;
  }

  .dg-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent, #4a90d9) 12%, transparent);
    color: var(--accent, #4a90d9);
    font-size: 11px;
  }

  .dg-chip__field {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dg-chip__x {
    background: none;
    border: none;
    padding: 0 2px;
    color: inherit;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
  }

  .dg-chip__x:hover {
    color: var(--fg, #222);
  }

  /* ── Zone grille ── */
  .dg-grid {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  /* ── Fallback lecture seule ── */
  .dg-wrap {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .dg-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border, #ddd);
    flex-shrink: 0;
    font-family: var(--font-ui, sans-serif);
  }

  .dg-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--fg, #222);
  }

  .dg-meta {
    font-size: 12px;
    color: var(--muted, #888);
  }

  .dg-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent, #4a90d9) 15%, transparent);
    color: var(--accent, #4a90d9);
  }

  .dg-scroll {
    flex: 1;
    overflow: auto;
  }

  .dg-table {
    border-collapse: collapse;
    font-family: var(--font-ui, sans-serif);
    font-size: 13px;
    width: 100%;
  }

  .dg-table th {
    position: sticky;
    top: 0;
    background: color-mix(in srgb, var(--surface, #fafafa) 95%, transparent);
    border-bottom: 1px solid var(--border, #ddd);
    text-align: left;
    padding: 6px 10px;
    font-weight: 600;
    color: var(--fg, #222);
    white-space: nowrap;
    z-index: 1;
  }

  .dg-table td {
    border-bottom: 1px solid color-mix(in srgb, var(--border, #ddd) 50%, transparent);
    padding: 5px 10px;
    color: var(--fg, #222);
    white-space: nowrap;
  }

  .dg-table tr:hover td {
    background: color-mix(in srgb, var(--accent, #4a90d9) 4%, transparent);
  }
</style>
