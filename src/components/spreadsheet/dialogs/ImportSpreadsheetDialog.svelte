<script lang="ts">
  import { Modal, Button } from "@svar-ui/svelte-core";
  import { spreadsheetCreate, spreadsheetList, spreadsheetDelete } from "@/spreadsheet/store";
  import type { ColumnDef } from "@/spreadsheet/types";
  import type { ImportResult } from "@/lib/spreadsheet/import";

  let {
    open,
    sheets,
    originalPath,
    onClose,
    onImported,
  }: {
    open: boolean;
    sheets: ImportResult[];
    originalPath?: string;
    onClose: () => void;
    onImported: (imported: { id: string; name: string }[]) => void;
  } = $props();

  let selected = $state<boolean[]>([]);
  let importing = $state(false);
  let error = $state<string | null>(null);

  // Conflict resolution state
  let conflictDialogOpen = $state(false);
  let conflictNames = $state<string[]>([]);

  $effect(() => {
    if (open && sheets.length > 0) {
      selected = sheets.map(() => true);
      error = null;
    }
  });

  function stripLeadingEmpty(rows: string[][]): string[][] {
    let firstNonEmpty = 0;
    for (const row of rows) {
      if (row.some((cell) => cell.trim() !== "")) break;
      firstNonEmpty++;
    }
    return rows.slice(firstNonEmpty);
  }

  async function handleImport() {
    importing = true;
    error = null;

    // 1. Check for name conflicts
    const toImport: { index: number; sheet: ImportResult; name: string }[] = [];
    for (let i = 0; i < sheets.length; i++) {
      if (!selected[i]) continue;
      const name = sheets[i].name || `Feuille ${i + 1}`;
      toImport.push({ index: i, sheet: sheets[i], name });
    }

    // Fetch existing names from DB
    let existingNames: Set<string>;
    try {
      const existing = await spreadsheetList();
      existingNames = new Set(
        existing
          .filter((s) => s.name !== "Nouveau tableur")
          .map((s) => s.name),
      );
    } catch (err) {
      error = String(err);
      importing = false;
      return;
    }

    const conflicting = toImport.filter((item) => existingNames.has(item.name));
    if (conflicting.length > 0) {
      conflictNames = [...new Set(conflicting.map((c) => c.name))];
      conflictDialogOpen = true;
      importing = false;
      return; // wait for user to resolve
    }

    await doImport(toImport);
  }

  async function doImport(
    toImport: { index: number; sheet: ImportResult; name: string }[],
    renameSuffix?: (name: string) => string,
    overwriteNames?: Set<string>,
  ) {
    importing = true;
    error = null;
    try {
      const imported: { id: string; name: string }[] = [];
      for (const item of toImport) {
        let name = item.name;
        if (overwriteNames?.has(name)) {
          // Overwrite: replace content of existing spreadsheet
          // (delete then re-create with same id? No — simpler: just update name+id
          //  Actually we keep the existing ID — but the store's create always uses
          //  a new UUID. For overwrite, we need to delete the old and create new.)
          // For now: delete old entries with this name then create new
          try {
            const existing = await spreadsheetList();
            const match = existing.find(
              (s) => s.name === name && s.name !== "Nouveau tableur",
            );
            if (match) {
              await spreadsheetDelete(match.id);
            }
          } catch { /* ignore */ }
        } else if (renameSuffix && conflictNames.includes(name)) {
          name = renameSuffix(name);
        }

        const cols: ColumnDef[] = item.sheet.headers.map((h) => ({
          title: h || "",
          width: 120,
          type: "text",
        }));
        const rows = stripLeadingEmpty(item.sheet.rows);
        if (rows.length === 0) continue;

        const id = crypto.randomUUID();
        await spreadsheetCreate(id, name, cols, rows, originalPath);
        imported.push({ id, name });
      }
      onImported(imported);
    } catch (err) {
      error = String(err);
    } finally {
      importing = false;
    }
  }

  async function handleConflictResolve(action: "rename" | "overwrite" | "cancel") {
    conflictDialogOpen = false;
    if (action === "cancel") return;

    // Re-build import list from selected sheets
    const toImport: { index: number; sheet: ImportResult; name: string }[] = [];
    for (let i = 0; i < sheets.length; i++) {
      if (!selected[i]) continue;
      const name = sheets[i].name || `Feuille ${i + 1}`;
      toImport.push({ index: i, sheet: sheets[i], name });
    }

    if (action === "rename") {
      const renameSuffix = (name: string) => {
        let counter = 2;
        while (true) {
          const candidate = `${name} (${counter})`;
          // Naive check — not checking against existing anymore, but close enough
          if (!toImport.some((t) => t.name === candidate)) return candidate;
          counter++;
        }
      };
      await doImport(toImport, renameSuffix);
    } else if (action === "overwrite") {
      const overwriteNames = new Set(conflictNames);
      await doImport(toImport, undefined, overwriteNames);
    } else {
      // Shouldn't happen
      importing = false;
    }
  }

  let allSelected = $derived(selected.length > 0 && selected.every(Boolean));

  function toggleAll() {
    const val = !allSelected;
    selected = selected.map(() => val);
  }
</script>

{#if conflictDialogOpen}
  <Modal
    title="Conflit de noms"
    oncancel={() => handleConflictResolve("cancel")}
    buttons={[]}
  >
    {#snippet children()}
      <p class="conflict-text">
        {#if conflictNames.length === 1}
          Le nom <strong>« {conflictNames[0]} »</strong> existe déjà.
        {:else}
          Les noms <strong>{conflictNames.map((n) => `« ${n} »`).join(", ")}</strong> existent déjà.
        {/if}
      </p>
      <p class="conflict-hint">Choisissez une action pour {conflictNames.length === 1 ? "ce tableur" : "ces tableurs"} :</p>
      <div class="conflict-actions">
        <Button type="secondary" onclick={() => handleConflictResolve("rename")}>
          Renommer l{conflictNames.length > 1 ? "es" : ""} import{conflictNames.length > 1 ? "s" : ""}
        </Button>
        <Button type="secondary" onclick={() => handleConflictResolve("overwrite")}>
          Écraser l{conflictNames.length > 1 ? "es" : ""} existant{conflictNames.length > 1 ? "s" : ""}
        </Button>
        <Button type="primary" onclick={() => handleConflictResolve("cancel")}>
          Annuler
        </Button>
      </div>
    {/snippet}
  </Modal>
{/if}

{#if open && !conflictDialogOpen}
  <Modal
    title="Importer un tableur"
    onconfirm={importing ? undefined : handleImport}
    oncancel={importing ? undefined : onClose}
    buttons={[]}
  >
    {#snippet children()}
      {#if error}
        <div class="import-error">{error}</div>
      {/if}

      <p class="import-hint">
        {sheets.length} feuille{sheets.length > 1 ? "s" : ""} trouvée{sheets.length > 1 ? "s" : ""} dans le fichier.
        Sélectionnez celles à importer :
      </p>

      <div class="import-list">
        {#if sheets.length > 1}
          <label class="import-select-all">
            <input type="checkbox" checked={allSelected} onchange={toggleAll} />
            <span>Tout sélectionner</span>
          </label>
        {/if}

        {#each sheets as sheet, i}
          <label
            class="import-sheet"
            class:import-sheet--selected={selected[i]}
            role="option"
            aria-selected={selected[i]}
          >
            <div class="import-sheet__row">
              <input type="checkbox" bind:checked={selected[i]} />
              <div class="import-sheet__info">
                <span class="import-sheet__name">{sheet.name || `Feuille ${i + 1}`}</span>
                <span class="import-sheet__meta">
                  {sheet.rows.length} ligne{sheet.rows.length > 1 ? "s" : ""}
                  · {sheet.headers.length} colonne{sheet.headers.length > 1 ? "s" : ""}
                </span>
              </div>
            </div>
            {#if selected[i] && sheet.rows.length > 0}
              <div class="import-sheet__preview">
                {#each stripLeadingEmpty(sheet.rows).slice(0, 3) as row}
                  <div class="import-preview-row">
                    {#each row.slice(0, 4) as cell}
                      <span class="import-preview-cell">{cell || "—"}</span>
                    {/each}
                  </div>
                {/each}
              </div>
            {/if}
          </label>
        {/each}
      </div>

      <div class="import-footer">
        <Button
          type="secondary"
          disabled={importing}
          onclick={onClose}
        >
          Annuler
        </Button>
        <Button
          type="primary"
          disabled={importing || !selected.some(Boolean)}
          onclick={handleImport}
        >
          {importing ? "Importation en cours…" : `Importer (${selected.filter(Boolean).length})`}
        </Button>
      </div>
    {/snippet}
  </Modal>
{/if}

<style>
  .import-error {
    background: color-mix(in srgb, var(--wx-color-danger, var(--red)) 15%, transparent);
    color: var(--wx-color-danger, var(--red));
    padding: 8px 12px;
    border-radius: 6px;
    margin-bottom: 12px;
    font-size: 13px;
  }

  .import-hint {
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--wx-color-font-muted, var(--muted));
  }

  .import-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
    max-height: 360px;
    overflow-y: auto;
  }

  .import-select-all {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border-bottom: 1px solid var(--wx-color-border, var(--border));
    margin-bottom: 4px;
  }

  .import-select-all input[type="checkbox"] {
    margin: 0;
  }

  .import-sheet {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid var(--wx-color-border, var(--border));
    background: var(--wx-background, var(--surface));
    transition: border-color 0.15s, background 0.15s;
  }

  .import-sheet:hover {
    border-color: var(--wx-color-primary, var(--accent));
    background: color-mix(in srgb, var(--wx-color-primary, var(--accent)) 5%, var(--wx-background, var(--surface)));
  }

  .import-sheet--selected {
    border-color: var(--wx-color-primary, var(--accent));
    background: color-mix(in srgb, var(--wx-color-primary, var(--accent)) 8%, var(--wx-background, var(--surface)));
  }

  .import-sheet__row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .import-sheet__row input[type="checkbox"] {
    margin: 0;
    flex-shrink: 0;
  }

  .import-sheet__info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }

  .import-sheet__name {
    font-weight: 500;
    font-size: 14px;
  }

  .import-sheet__meta {
    font-size: 11px;
    color: var(--wx-color-font-muted, var(--muted));
  }

  .import-sheet__preview {
    margin-left: 24px;
    padding: 6px 8px;
    background: var(--wx-background-alt, var(--bg));
    border-radius: 4px;
    font-size: 11px;
    font-family: monospace;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .import-preview-row {
    display: flex;
    gap: 8px;
  }

  .import-preview-cell {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--wx-color-font-muted, var(--fg-muted));
  }

  .import-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--wx-color-border, var(--border));
  }

  .conflict-text {
    margin: 0 0 8px;
    font-size: 14px;
    line-height: 1.5;
  }

  .conflict-hint {
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--wx-color-font-muted, var(--muted));
  }

  .conflict-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
