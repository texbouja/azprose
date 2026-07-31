<script lang="ts">
  // ── Minimal SVAR datagrid viewer (test/read-only) ────────────────────────
  // Loads a datagrid snapshot from SQLite and renders it as a plain HTML
  // table. Temporary scaffold used to validate the spreadsheet→datagrid live
  // bridge; a real SVAR grid component will replace this later.

  import { datagridGet } from "@/datagrid/store";
  import type { DatagridData, DatagridColumnDef } from "@/datagrid/types";

  let {
    datagridId = "",
  }: {
    datagridId?: string;
  } = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let grid = $state<DatagridData | null>(null);
  let loadGen = -1;

  async function load() {
    if (!datagridId) return;
    loading = true;
    error = null;
    const gen = ++loadGen;
    try {
      const data = await datagridGet(datagridId);
      if (gen !== loadGen) return;
      grid = data;
      window.dispatchEvent(new CustomEvent("azprose:datagrid-title-change", {
        detail: { datagridId, title: data.name },
      }));
    } catch (err) {
      if (gen === loadGen) {
        error = String(err);
        grid = null;
      }
    } finally {
      if (gen === loadGen) loading = false;
    }
  }

  $effect(() => {
    const id = datagridId;
    if (id) load();
  });

  /** Parse a DataHash blob `{"c0":"x","c1":"y"}` into a row map. */
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
</script>

{#if loading}
  <div class="dg-loading">Chargement…</div>
{:else if error}
  <div class="dg-error">{error}</div>
{:else if !grid}
  <div class="dg-empty">Aucune datagrid.</div>
{:else if grid.columns.length === 0}
  <div class="dg-empty">Cette datagrid n'a pas de colonnes.</div>
{:else}
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
