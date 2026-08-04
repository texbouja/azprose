<script lang="ts">
  import { Modal, Button } from "@svar-ui/svelte-core";
  import { getT, language } from "@/lib/i18n";
  import { classifySheet } from "@/colles/colloscope";
  import type { ImportResult } from "@/lib/spreadsheet/import";

  let {
    open,
    sheets,
    onClose,
    onImport,
  }: {
    open: boolean;
    /** TOUTES les feuilles du fichier (mortes incluses — elles sont exclues d'office). */
    sheets: ImportResult[];
    onClose: () => void;
    onImport: (sheets: ImportResult[]) => void;
  } = $props();

  let t = $derived(getT($language));

  /** Feuilles exploitables (élèves + classes) — les mortes ne sont jamais proposées. */
  let candidates = $derived(sheets.filter((s) => classifySheet(s) !== "morte"));
  let excludedCount = $derived(sheets.length - candidates.length);

  let selected = $state<boolean[]>([]);

  $effect(() => {
    if (open && candidates.length > 0) {
      selected = candidates.map(() => true);
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

  let allSelected = $derived(selected.length > 0 && selected.every(Boolean));

  function toggleAll() {
    const val = !allSelected;
    selected = selected.map(() => val);
  }

  function handleImport() {
    const chosen = candidates.filter((_, i) => selected[i]);
    if (chosen.length > 0) onImport(chosen);
  }
</script>

{#if open}
  <Modal
    title={t("settings.colloscopeImportTitle")}
    onconfirm={handleImport}
    oncancel={onClose}
    buttons={[]}
  >
    {#snippet children()}
      <p class="cs-import__hint">
        {t("settings.colloscopeImportFound", { count: candidates.length })}
        {#if excludedCount > 0}
          <br />
          {t("settings.colloscopeImportExcluded", { count: excludedCount })}
        {/if}
      </p>

      <div class="cs-import__list">
        {#if candidates.length > 1}
          <label class="cs-import__select-all">
            <input type="checkbox" checked={allSelected} onchange={toggleAll} />
            <span>{t("settings.colloscopeSelectAll")}</span>
          </label>
        {/if}

        {#each candidates as sheet, i}
          <label
            class="cs-import__sheet"
            class:cs-import__sheet--selected={selected[i]}
          >
            <div class="cs-import__sheet-row">
              <input type="checkbox" bind:checked={selected[i]} />
              <div class="cs-import__sheet-info">
                <span class="cs-import__sheet-name">{sheet.name || `Feuille ${i + 1}`}</span>
                <span class="cs-import__sheet-meta">
                  {t("settings.colloscopeRowsCols", { rows: sheet.rows.length, cols: sheet.headers.length })}
                </span>
              </div>
            </div>
            {#if selected[i] && sheet.rows.length > 0}
              <div class="cs-import__preview">
                {#each stripLeadingEmpty(sheet.rows).slice(0, 3) as row}
                  <div class="cs-import__preview-row">
                    {#each row.slice(0, 4) as cell}
                      <span class="cs-import__preview-cell">{cell || "—"}</span>
                    {/each}
                  </div>
                {/each}
              </div>
            {/if}
          </label>
        {/each}
      </div>

      <div class="cs-import__footer">
        <Button type="secondary" onclick={onClose}>
          {t("settings.colloscopeCancel")}
        </Button>
        <Button
          type="primary"
          disabled={!selected.some(Boolean)}
          onclick={handleImport}
        >
          {t("settings.colloscopeImportAction", { count: selected.filter(Boolean).length })}
        </Button>
      </div>
    {/snippet}
  </Modal>
{/if}

<style>
  .cs-import__hint {
    margin: 0 0 16px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--wx-color-font-muted, var(--muted));
  }

  .cs-import__list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
    max-height: 360px;
    overflow-y: auto;
  }

  .cs-import__select-all {
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

  .cs-import__select-all input[type="checkbox"] {
    margin: 0;
  }

  .cs-import__sheet {
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

  .cs-import__sheet:hover {
    border-color: var(--wx-color-primary, var(--accent));
    background: color-mix(in srgb, var(--wx-color-primary, var(--accent)) 5%, var(--wx-background, var(--surface)));
  }

  .cs-import__sheet--selected {
    border-color: var(--wx-color-primary, var(--accent));
    background: color-mix(in srgb, var(--wx-color-primary, var(--accent)) 8%, var(--wx-background, var(--surface)));
  }

  .cs-import__sheet-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cs-import__sheet-row input[type="checkbox"] {
    margin: 0;
    flex-shrink: 0;
  }

  .cs-import__sheet-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }

  .cs-import__sheet-name {
    font-weight: 500;
    font-size: 14px;
  }

  .cs-import__sheet-meta {
    font-size: 11px;
    color: var(--wx-color-font-muted, var(--muted));
  }

  .cs-import__preview {
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

  .cs-import__preview-row {
    display: flex;
    gap: 8px;
  }

  .cs-import__preview-cell {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--wx-color-font-muted, var(--fg-muted));
  }

  .cs-import__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--wx-color-border, var(--border));
  }
</style>
