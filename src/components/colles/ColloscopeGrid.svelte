<script lang="ts">
  import {
    Grid,
    ContextMenu,
    type IApi,
    type IColumnConfig,
    type IRow,
  } from "@svar-ui/svelte-grid";
  import { colloscope } from "@/stores/colloscope.svelte";
  import { MATIERE_COLORS, MATIERES, JOURS } from "@/types/colles";

  let api: IApi | null = $state(null);

  // ── Groupe options for dropdown editors ─────────────────
  function groupeOptions(): { id: string; label: string }[] {
    const groupes = new Set<string>();
    for (const c of colloscope.state.creneaux) {
      const assign = colloscope.state.assignations[c.id];
      if (assign) {
        for (const g of assign) {
          if (g) groupes.add(g);
        }
      }
    }
    const sorted = [...groupes].sort();
    if (sorted.length === 0) {
      return ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"].map(g => ({ id: g, label: g }));
    }
    return sorted.map(g => ({ id: g, label: g }));
  }

  function materiaColor(matiere: string): string {
    return MATIERE_COLORS[matiere] ?? "#666";
  }

  // ── Fixed columns (creneau metadata) ───────────────────
  const FIXED_COLS = ["matiere", "colleur", "jour", "horaire", "salle", "classe"] as const;
  const FIXED_LABELS: Record<string, string> = {
    matiere: "Matière",
    colleur: "Colleur",
    jour: "Jour",
    horaire: "Créneau",
    salle: "Salle",
    classe: "Classe",
  };

  // ── Build grid data (IRow objects) ─────────────────────
  const gridData = $derived.by<IRow[]>(() => {
    const semaines = colloscope.state.semaines;
    const creneaux = colloscope.creneauxFiltered;
    return creneaux.map(c => {
      const row: IRow = { id: c.id };
      for (const field of FIXED_COLS) {
        row[field] = c[field];
      }
      for (let i = 0; i < semaines.length; i++) {
        row[`semaine-${i}`] = colloscope.getGroupe(c.id, i) ?? "";
      }
      return row;
    });
  });

  // ── Build columns definition ───────────────────────────
  const gridColumns = $derived.by<IColumnConfig[]>(() => {
    const semaines = colloscope.state.semaines;
    const options = groupeOptions();

    const fixedCols: IColumnConfig[] = FIXED_COLS.map(field => ({
      id: field,
      header: FIXED_LABELS[field],
      width: field === "matiere" ? 140 : field === "horaire" ? 90 : field === "classe" ? 80 : 100,
      sort: true,
    }));

    const semaineCols: IColumnConfig[] = semaines.map((s, i) => ({
      id: `semaine-${i}`,
      header: s.label,
      width: 80,
      editor: {
        type: "combo",
        config: { options },
      },
    }));

    return [...fixedCols, ...semaineCols];
  });

  // ── Cell styling callback ──────────────────────────────
  function cellStyle(row: IRow, col: any): string {
    if (col?.id === "matiere" && row.matiere) {
      const color = materiaColor(row.matiere);
      return `background-color: ${color}20`;
    }
    return "";
  }

  // ── Init handler — receives api from Grid ──────────────
  function init(a: IApi) {
    api = a;

    // Listen for cell edits from the Grid
    a.on("update-cell", ({ id, column, value }: any) => {
      const creneaux = colloscope.creneauxFiltered;
      const creneau = creneaux.find(c => c.id === id);
      if (!creneau) return;

      const colId = typeof column === "object" ? column.id : column;
      const colIdx = colId?.startsWith("semaine-")
        ? parseInt(colId.replace("semaine-", ""), 10)
        : -1;

      if (colIdx >= 0) {
        colloscope.setGroupe(creneau.id, colIdx, value || null);
        colloscope.save();
      } else if (FIXED_COLS.includes(colId)) {
        colloscope.updateCreneau(creneau.id, { [colId]: value });
        colloscope.save();
      }
    });

    // Listen for row updates (bulk edit)
    a.on("update-row", ({ id, row }: any) => {
      const creneaux = colloscope.creneauxFiltered;
      const creneau = creneaux.find(c => c.id === id);
      if (!creneau) return;

      for (const field of FIXED_COLS) {
        if (row[field] !== undefined && row[field] !== creneau[field]) {
          colloscope.updateCreneau(creneau.id, { [field]: row[field] });
        }
      }

      for (let i = 0; i < colloscope.state.semaines.length; i++) {
        const key = `semaine-${i}`;
        if (row[key] !== undefined) {
          colloscope.setGroupe(creneau.id, i, row[key] || null);
        }
      }

      colloscope.save();
    });
  }

  // ── Context menu ───────────────────────────────────────
  function insertCreneau(ref: any, position: "above" | "below") {
    const newCreneau = {
      id: `creneau-${Date.now()}`,
      matiere: MATIERES[0],
      colleur: "",
      jour: JOURS[0],
      horaire: "",
      salle: "",
      classe: "",
    };
    const idx = colloscope.state.creneaux.indexOf(ref);
    colloscope.state.creneaux.splice(
      position === "above" ? idx : idx + 1,
      0,
      newCreneau,
    );
    colloscope.state.assignations[newCreneau.id] = new Array(
      colloscope.state.semaines.length,
    ).fill(null);
    colloscope.save();
  }

  function handleContextMenu({ action, context }: { action: any; context: any }) {
    const target = context?.row;
    const creneaux = colloscope.creneauxFiltered;
    const creneau = target ? creneaux.find((c: any) => c.id === target.id) : null;

    if (action.id === "insert-row-above") {
      if (creneau) insertCreneau(creneau, "above");
    } else if (action.id === "insert-row-below") {
      if (creneau) insertCreneau(creneau, "below");
    } else if (action.id === "delete-row") {
      if (creneau) {
        colloscope.removeCreneau(creneau.id);
        colloscope.save();
      }
    }
  }

</script>

<div class="colloscope-grid">
    <div class="colloscope-grid__header">
      <button
        type="button"
        class="colloscope-grid__btn"
        onclick={() => colloscope.save()}
        title="Save"
      >
        <i class="wxi-check"></i>
      </button>
      <button
        type="button"
        class="colloscope-grid__btn"
        onclick={() => {
          if (!api) return;
          const state = api.getState();
          for (const col of state.columns) {
            if (col.hidden && col.id != null) api.exec("hide-column", { id: col.id, mode: false });
          }
        }}
        title="Show all"
      >
        <i class="wxi-eye"></i>
      </button>
    </div>

    <div class="colloscope-grid__body">
      <ContextMenu api={api ?? undefined} onclick={handleContextMenu as any}>
        <Grid
          {init}
          data={gridData}
          columns={gridColumns}
          {cellStyle}
          select={true}
          multiselect={true}
        />
      </ContextMenu>
    </div>
</div>

<style>
  .colloscope-grid {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .colloscope-grid__header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--surface, #2a2a3c);
    border-bottom: 1px solid var(--border, #45475a);
    flex-shrink: 0;
  }

  .colloscope-grid__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    border: 1px solid var(--border, #45475a);
    background: var(--surface, #2a2a3c);
    color: var(--fg-muted, #a6adc8);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .colloscope-grid__btn:hover {
    background: color-mix(in srgb, var(--fg, #cdd6f4) 8%, var(--surface, #2a2a3c));
    color: var(--fg, #cdd6f4);
  }

  .colloscope-grid__btn :global(i) {
    font-size: 16px;
  }

  .colloscope-grid__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  /* ── Grid overrides ────────────────────────────────── */
  .colloscope-grid :global(.wx-grid) {
    height: 100%;
    font-family: var(--font-ui, system-ui);
  }

  .colloscope-grid :global(.wx-grid-header) {
    background: var(--surface, #2a2a3c);
    border-bottom: 1px solid var(--border, #45475a);
  }

  .colloscope-grid :global(.wx-grid-row) {
    border-bottom: 1px solid color-mix(in srgb, var(--border, #45475a) 50%, transparent);
  }

  .colloscope-grid :global(.wx-grid-row:hover) {
    background: color-mix(in srgb, var(--fg, #cdd6f4) 5%, var(--bg, #1e1e2e));
  }

  .colloscope-grid :global(.wx-grid-cell) {
    border-right: 1px solid color-mix(in srgb, var(--border, #45475a) 30%, transparent);
    color: var(--fg, #cdd6f4);
    font-size: 12px;
  }

  .colloscope-grid :global(.wx-grid-header-cell) {
    color: var(--fg-muted, #a6adc8);
    font-weight: 500;
    font-size: 11px;
  }

  .colloscope-grid :global(.wx-selected) {
    background: color-mix(in srgb, var(--accent, #89b4fa) 12%, var(--bg, #1e1e2e)) !important;
  }

  /* ── Context menu ────────────────────────────────────── */
  .colloscope-grid :global(.wx-context-menu) {
    background: var(--surface, #2a2a3c);
    border: 1px solid var(--border, #45475a);
    border-radius: 6px;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--fg, #cdd6f4) 15%, transparent);
    padding: 4px;
    font-family: var(--font-ui, system-ui);
    font-size: 13px;
  }

  .colloscope-grid :global(.wx-context-menu-item) {
    color: var(--fg, #cdd6f4);
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
  }

  .colloscope-grid :global(.wx-context-menu-item:hover) {
    background: color-mix(in srgb, var(--fg, #cdd6f4) 8%, var(--surface, #2a2a3c));
  }
</style>
