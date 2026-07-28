<script lang="ts">
  import {
    Grid,
    ContextMenu,
    type IApi,
    type IColumnConfig,
    type IRow,
  } from "@svar-ui/svelte-grid";
  import { eleves } from "@/stores/eleves.svelte";
  import type { Eleve } from "@/types/colles";
  import { pickXlsx } from "@/lib/files";
  import { invoke } from "@tauri-apps/api/core";

  let api: IApi | null = $state(null);
  let importing = $state(false);

  // ── Build grid data ──────────────────────────────────────
  const gridData = $derived.by<IRow[]>(() => {
    return eleves.state.eleves.map(e => ({
      id: e.id,
      nom: e.nom,
      prenom: e.prenom,
      classe: e.classe,
      groupe: e.groupe,
      email: e.email ?? "",
    }));
  });

  // ── Columns definition ───────────────────────────────────
  const gridColumns: IColumnConfig[] = [
    { id: "nom", header: "Nom", width: 120, editor: "text", sort: true },
    { id: "prenom", header: "Prénom", width: 120, editor: "text", sort: true },
    { id: "classe", header: "Classe", width: 80, editor: "text", sort: true },
    { id: "groupe", header: "Groupe", width: 80, editor: "text", sort: true },
    { id: "email", header: "Email", width: 200, editor: "text" },
  ];

  // ── Init handler ─────────────────────────────────────────
  function init(a: IApi) {
    api = a;

    a.on("update-cell", ({ id, column, value }: any) => {
      const existing = eleves.state.eleves.find(e => e.id === id);
      if (!existing) return;

      const colId = typeof column === "object" ? column.id : column;
      const field = colId as keyof Eleve;
      if (field && field in existing) {
        eleves.updateEleve(existing.id, { [field]: value });
        eleves.save();
      }
    });
  }

  // ── Context menu ──────────────────────────────────────────
  function insertEleve(ref: any, position: "above" | "below") {
    const newEleve: Eleve = {
      id: `eleve-${Date.now()}`,
      nom: "",
      prenom: "",
      classe: ref?.classe ?? "",
      groupe: ref?.groupe ?? "",
      email: "",
    };
    const idx = eleves.state.eleves.findIndex(e => e.id === ref?.id);
    eleves.state.eleves.splice(
      position === "above" ? Math.max(0, idx) : idx + 1,
      0,
      newEleve,
    );
    eleves.save();
  }

  function handleContextMenu({ action, context }: { action: any; context: any }) {
    const target = context?.row;
    const existing = target ? eleves.state.eleves.find(e => e.id === target.id) : null;

    if (action.id === "insert-row-above") {
      insertEleve(existing, "above");
    } else if (action.id === "insert-row-below") {
      insertEleve(existing, "below");
    } else if (action.id === "delete-row") {
      if (existing) {
        eleves.removeEleve(existing.id);
        eleves.save();
      }
    }
  }

  // ── CSV import ───────────────────────────────────────────
  async function importCsv() {
    const path = await pickXlsx();
    if (!path) return;
    importing = true;
    try {
      const parsed: any = await invoke("parse_eleves_csv", { path });
      const parsedEleves = parsed.eleves.map((e: any, i: number) => ({
        id: `eleve-${i}`,
        nom: e.nom,
        prenom: e.prenom,
        classe: e.classe,
        groupe: e.groupe,
        email: e.email ?? "",
      }));
      eleves.importEleves(parsedEleves);
      await eleves.save();
    } catch (e) {
      console.error("[eleves] import error:", e);
    } finally {
      importing = false;
    }
  }
</script>

<div class="eleves-panel">
  <div class="eleves-panel__header">
    <div class="eleves-panel__stats">
      <span>{eleves.state.eleves.length} élèves</span>
      <span>·</span>
      <span>{eleves.classes.length} classes</span>
    </div>

    <button
      type="button"
      class="eleves-panel__import"
      disabled={importing}
      onclick={importCsv}
    >
      <span>{importing ? "Import…" : "Importer CSV"}</span>
    </button>
  </div>

  <div class="eleves-panel__content">
    <ContextMenu api={api ?? undefined} onclick={handleContextMenu as any}>
        <Grid
          {init}
          data={gridData}
          columns={gridColumns}
          select={true}
          multiselect={true}
        />
      </ContextMenu>
    </div>
</div>

<style>
  .eleves-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
  }
  .eleves-panel__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .eleves-panel__stats {
    display: flex;
    gap: 4px;
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--fg-muted);
    white-space: nowrap;
    margin-left: auto;
  }
  .eleves-panel__import {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg-muted);
    font-family: var(--font-ui);
    font-size: 11px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }
  .eleves-panel__import:hover:not(:disabled) {
    background: color-mix(in srgb, var(--fg) 8%, var(--surface));
    color: var(--fg);
  }
  .eleves-panel__import:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .eleves-panel__content {
    flex: 1;
    overflow: hidden;
  }

  /* ── Grid overrides ────────────────────────────────── */
  .eleves-panel :global(.wx-grid) {
    height: 100%;
    font-family: var(--font-ui, system-ui);
  }

  .eleves-panel :global(.wx-grid-header) {
    background: var(--surface, #2a2a3c);
    border-bottom: 1px solid var(--border, #45475a);
  }

  .eleves-panel :global(.wx-grid-cell) {
    border-right: 1px solid color-mix(in srgb, var(--border, #45475a) 30%, transparent);
    color: var(--fg, #cdd6f4);
    font-size: 12px;
  }

  .eleves-panel :global(.wx-grid-header-cell) {
    color: var(--fg-muted, #a6adc8);
    font-weight: 500;
    font-size: 11px;
  }

  .eleves-panel :global(.wx-selected) {
    background: color-mix(in srgb, var(--accent, #89b4fa) 12%, var(--bg, #1e1e2e)) !important;
  }

  /* ── Context menu ────────────────────────────────────── */
  .eleves-panel :global(.wx-context-menu) {
    background: var(--surface, #2a2a3c);
    border: 1px solid var(--border, #45475a);
    border-radius: 6px;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--fg, #cdd6f4) 15%, transparent);
    padding: 4px;
    font-family: var(--font-ui, system-ui);
    font-size: 13px;
  }

  .eleves-panel :global(.wx-context-menu-item) {
    color: var(--fg, #cdd6f4);
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
  }

  .eleves-panel :global(.wx-context-menu-item:hover) {
    background: color-mix(in srgb, var(--fg, #cdd6f4) 8%, var(--surface, #2a2a3c));
  }
</style>
