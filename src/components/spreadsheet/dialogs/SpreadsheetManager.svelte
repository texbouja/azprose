<script lang="ts">
  import { Modal, Button } from "@svar-ui/svelte-core";
  import {
    spreadsheetList, spreadsheetDelete, spreadsheetRename,
  } from "@/spreadsheet/store";
  import type { SpreadsheetMeta } from "@/spreadsheet/types";
  import { getOpenSheetIds } from "@/spreadsheet/open-tabs.svelte";

  let {
    open,
    currentId,
    onClose,
    onOpenSheet,
    onCurrentDeleted,
  }: {
    open: boolean;
    /** ID of the spreadsheet shown in this viewer (to close tab if deleted) */
    currentId?: string;
    onClose: () => void;
    /** Called when user wants to open a sheet — receives its id and the "new tab" flag */
    onOpenSheet: (id: string, openInNewTab: boolean) => void;
    /** Called when the currently open sheet is deleted — parent should close tab */
    onCurrentDeleted?: () => void;
  } = $props();

  let sheets = $state<SpreadsheetMeta[]>([]);
  let selected = $state<Set<string>>(new Set());
  let loading = $state(false);
  let error = $state<string | null>(null);
  let filter = $state("");
  let openInNewTab = $state(false);

  // Inline rename state
  let renamingId = $state<string | null>(null);
  let renameValue = $state("");

  // Never show unsaved "Nouveau tableur" entries in the list
  let visibleSheets = $derived(
    sheets.filter((s) => s.name !== "Nouveau tableur"),
  );

  let filteredSheets = $derived(
    filter
      ? visibleSheets.filter((s) =>
          s.name.toLowerCase().includes(filter.toLowerCase()) ||
          (s.original_path ?? "").toLowerCase().includes(filter.toLowerCase()),
        )
      : visibleSheets,
  );

  // If a sheet is already open and "new tab" is checked, show a helper message
  let selectedAlreadyOpen = $derived(
    openInNewTab && selected.size === 1 && getOpenSheetIds().includes([...selected][0]),
  );

  $effect(() => {
    if (open) refresh();
  });

  async function refresh() {
    loading = true;
    error = null;
    selected = new Set();
    try {
      sheets = await spreadsheetList();
    } catch (err) {
      error = String(err);
    } finally {
      loading = false;
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selected = next;
  }

  async function handleOpen() {
    if (selected.size === 0) return;
    const id = [...selected][0];
    onOpenSheet(id, openInNewTab);
  }

  async function handleDeleteOne(sheet: SpreadsheetMeta) {
    loading = true;
    error = null;
    try {
      const hadCurrent = currentId && currentId === sheet.id;
      await spreadsheetDelete(sheet.id);
      selected = new Set([...selected].filter((id) => id !== sheet.id));
      await refresh();
      if (hadCurrent) {
        onCurrentDeleted?.();
      }
    } catch (err) {
      error = String(err);
    } finally {
      loading = false;
    }
  }

  function startRename(sheet: SpreadsheetMeta) {
    renamingId = sheet.id;
    renameValue = sheet.name;
  }

  function cancelRename() {
    renamingId = null;
  }

  async function commitRename() {
    if (!renamingId) return;
    const id = renamingId;
    const trimmed = renameValue.trim();
    const prev = sheets.find((s) => s.id === id)?.name;
    renamingId = null;
    if (!trimmed || trimmed === prev) return;
    try {
      await spreadsheetRename(id, trimmed);
      await refresh();
      // Notify open tabs so they update their title
      window.dispatchEvent(new CustomEvent("azprose:spreadsheet-title-change", {
        detail: { spreadsheetId: id, title: trimmed },
      }));
    } catch (err) {
      console.error("Rename failed:", err);
    }
  }

  /** Svelte action: focus + select all text in the inline rename input */
  function focusRename(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  let allSelected = $derived(
    filteredSheets.length > 0 && filteredSheets.every((s) => selected.has(s.id)),
  );

  function toggleAll() {
    if (allSelected) {
      const ids = new Set(filteredSheets.map((s) => s.id));
      selected = new Set([...selected].filter((id) => !ids.has(id)));
    } else {
      const next = new Set(selected);
      for (const s of filteredSheets) next.add(s.id);
      selected = next;
    }
  }
</script>

{#if open}
  <Modal
    title="Gérer les tableurs"
    onconfirm={handleOpen}
    oncancel={onClose}
    buttons={[]}
  >
    {#snippet children()}
      {#if error}
        <div class="mgr-error">{error}</div>
      {/if}

      {#if loading && sheets.length === 0}
        <div class="mgr-loading">Chargement…</div>
      {:else}
        <div class="mgr-filter">
          <input
            type="text"
            class="mgr-filter__input"
            placeholder="Filtrer par nom ou chemin…"
            bind:value={filter}
          />
        </div>

        {#if filteredSheets.length === 0}
          <p class="mgr-empty">
            {visibleSheets.length === 0 ? "Aucun tableur enregistré." : "Aucun résultat."}
          </p>
        {:else}
          <div class="mgr-toolbar">
            <label class="mgr-select-all">
              <input type="checkbox" checked={allSelected} onchange={toggleAll} />
              <span>{filteredSheets.length} tableur{filteredSheets.length > 1 ? "s" : ""}</span>
            </label>
            <span class="mgr-count">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
          </div>

          <div class="mgr-list">
            {#each filteredSheets as sheet}
              <div
                class="mgr-row"
                class:mgr-row--selected={selected.has(sheet.id)}
                class:mgr-row--current={sheet.id === currentId}
                role="option"
                aria-selected={selected.has(sheet.id)}
                tabindex="0"
                onclick={() => toggle(sheet.id)}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(sheet.id);
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(sheet.id)}
                  onclick={(e) => e.stopPropagation()}
                  onchange={() => toggle(sheet.id)}
                />
                <i class="wxi-database mgr-row__icon" aria-hidden="true"></i>
                <div class="mgr-row__info">
                  {#if renamingId === sheet.id}
                    <input
                      type="text"
                      class="mgr-row__rename-input"
                      bind:value={renameValue}
                      onkeydown={(e) => {
                        if (e.key === "Enter") commitRename();
                        else if (e.key === "Escape") cancelRename();
                      }}
                      onblur={commitRename}
                      use:focusRename
                      onclick={(e) => e.stopPropagation()}
                    />
                  {:else}
                    <span
                      class="mgr-row__name"
                      title="Cliquer pour renommer"
                      role="button"
                      tabindex="0"
                      onclick={(e) => { e.stopPropagation(); startRename(sheet); }}
                      onkeydown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          startRename(sheet);
                        }
                      }}
                    >{sheet.name}</span>
                  {/if}
                  <span class="mgr-row__meta">
                    {sheet.original_path
                      ? sheet.original_path.split("/").pop()
                      : "créé localement"}
                    · {formatDate(sheet.updated_at)}
                  </span>
                </div>
                {#if getOpenSheetIds().includes(sheet.id)}
                  <span class="mgr-row__badge">ouvert</span>
                {/if}
                <button
                  type="button"
                  class="mgr-row__delete"
                  title="Supprimer"
                  aria-label="Supprimer {sheet.name}"
                  onclick={(e) => { e.stopPropagation(); handleDeleteOne(sheet); }}
                >
                  <i class="wxi-trash-2"></i>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      <div class="mgr-footer">
        <label class="mgr-newtab">
          <input type="checkbox" bind:checked={openInNewTab} />
          Ouvrir dans un nouvel onglet
          {#if selectedAlreadyOpen}
            <span class="mgr-newtab__warn">(déjà ouvert)</span>
          {/if}
        </label>
        <div class="mgr-footer__buttons">
          <Button
            type="secondary"
            disabled={loading}
            onclick={onClose}
          >
            Annuler
          </Button>
          <Button
            type="primary"
            disabled={selected.size !== 1 || loading || selectedAlreadyOpen}
            onclick={handleOpen}
          >
            {selectedAlreadyOpen ? "Déjà ouvert" : "Ouvrir"}
          </Button>
        </div>
      </div>
    {/snippet}
  </Modal>
{/if}

<style>
  :global(.wx-window) {
    min-width: 520px !important;
  }

  .mgr-error {
    background: color-mix(in srgb, var(--wx-color-danger, var(--red)) 15%, transparent);
    color: var(--wx-color-danger, var(--red));
    padding: 8px 12px;
    border-radius: 6px;
    margin-bottom: 12px;
    font-size: 13px;
  }

  .mgr-loading,
  .mgr-empty {
    margin: 0;
    font-size: 13px;
    color: var(--wx-color-font-muted, var(--muted));
    padding: 24px 0;
    text-align: center;
  }

  .mgr-filter {
    margin-bottom: 8px;
  }

  .mgr-filter__input {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    border: 1px solid var(--wx-color-border, var(--border));
    border-radius: 6px;
    background: var(--wx-background-alt, var(--bg));
    color: var(--wx-color-font, var(--fg));
    font-family: var(--wx-font-family, var(--font-ui));
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  .mgr-filter__input:focus {
    border-color: var(--wx-color-primary, var(--accent));
  }

  .mgr-filter__input::placeholder {
    color: var(--wx-color-font-muted, var(--muted));
  }

  .mgr-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid var(--wx-color-border, var(--border));
    margin-bottom: 6px;
  }

  .mgr-select-all {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .mgr-select-all input[type="checkbox"] {
    margin: 0;
  }

  .mgr-count {
    font-size: 11px;
    color: var(--wx-color-font-muted, var(--muted));
  }

  .mgr-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 320px;
    overflow-y: auto;
  }

  .mgr-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: border-color 0.15s, background 0.15s;
  }

  .mgr-row:hover {
    background: color-mix(in srgb, var(--wx-color-primary, var(--accent)) 5%, var(--wx-background, var(--surface)));
    border-color: var(--wx-color-primary, var(--accent));
  }

  .mgr-row--selected {
    background: color-mix(in srgb, var(--wx-color-primary, var(--accent)) 8%, var(--wx-background, var(--surface)));
    border-color: var(--wx-color-primary, var(--accent));
  }

  .mgr-row--current {
    border-color: var(--wx-color-primary, var(--accent));
  }

  .mgr-row input[type="checkbox"] {
    margin: 0;
    flex-shrink: 0;
  }

  .mgr-row__icon {
    font-size: 16px;
    color: var(--wx-color-font-muted, var(--muted));
    flex-shrink: 0;
  }

  .mgr-row__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .mgr-row__name {
    font-weight: 500;
    font-size: 14px;
    cursor: pointer;
    border-radius: 4px;
    padding: 1px 4px;
    margin: -1px -4px;
    transition: background 0.15s;
  }

  .mgr-row__name:hover {
    background: color-mix(in srgb, var(--wx-color-primary, var(--accent)) 12%, transparent);
  }

  .mgr-row__rename-input {
    font-family: var(--wx-font-family, var(--font-ui));
    font-size: 14px;
    font-weight: 500;
    padding: 1px 4px;
    margin: -1px -4px;
    border: 1px solid var(--wx-color-primary, var(--accent));
    border-radius: 4px;
    background: var(--wx-background-alt, var(--bg));
    color: var(--wx-color-font, var(--fg));
    outline: none;
    box-sizing: border-box;
  }

  .mgr-row__meta {
    font-size: 11px;
    color: var(--wx-color-font-muted, var(--muted));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mgr-row__badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--wx-color-primary, var(--accent));
    color: var(--wx-color-primary-font, var(--accent-fg, #fff));
    white-space: nowrap;
    flex-shrink: 0;
  }

  .mgr-row__delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--wx-color-font-muted, var(--muted));
    cursor: pointer;
    flex-shrink: 0;
    font-size: 14px;
    transition: background 0.15s, color 0.15s;
  }

  .mgr-row__delete:hover {
    background: color-mix(in srgb, var(--wx-color-danger, var(--red, #e53935)) 12%, transparent);
    color: var(--wx-color-danger, var(--red, #e53935));
  }

  .mgr-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--wx-color-border, var(--border));
  }

  .mgr-newtab {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--wx-color-font-muted, var(--muted));
    cursor: pointer;
    user-select: none;
  }

  .mgr-newtab input[type="checkbox"] {
    margin: 0;
  }

  .mgr-newtab__warn {
    font-size: 11px;
    color: var(--wx-color-danger, var(--red, #e53935));
    opacity: 0.75;
    white-space: nowrap;
  }

  .mgr-footer__buttons {
    display: flex;
    gap: 8px;
  }
</style>
