<script lang="ts">
/**
 * CollesImportDialog — single-step import for all colles data.
 *
 * Shows a list of sheets from a parsed xlsx/csv file. Auto-detects
 * colloscope (matrix/flat) and élèves sheets. User can:
 *   - Toggle sheet role (colloscope / élèves / ignore)
 *   - Rename class for colloscope sheets
 *   - Import all in one click
 */
import { notifications } from "@/stores/notifications.svelte";
import { colloscope } from "@/stores/colloscope.svelte";
import { eleves } from "@/stores/eleves.svelte";
import { Overlay } from "@/components/primitives";
import {
  classifySheets,
  parseColloscopeSheet,
  parseElevesSheet,
  type SheetClassification,
} from "./import-config";
import type { Creneau } from "@/types/colles";
import type { ParsedExcelData } from "@svar-ui/excel-import-store";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";

let t = $derived(getT($language));

let {
  open,
  data,
  onclose,
}: {
  open: boolean;
  data: ParsedExcelData | null;
  onclose: () => void;
} = $props();

/** Sheet classifications (editable by user). */
let sheets = $state<SheetClassification[]>([]);

/** Whether import is in progress. */
let importing = $state(false);
$effect(() => {
  if (data) {
    sheets = classifySheets(data);
  } else {
    sheets = [];
  }
});

/** Number of sheets that will actually be imported (not ignored). */
let activeCount = $derived(sheets.filter(s => s.role !== "ignore").length);

function setRole(idx: number, role: SheetClassification["role"]) {
  sheets[idx].role = role;
}

function setClasse(idx: number, value: string) {
  sheets[idx].classe = value;
}

function handleImport() {
  if (!data || activeCount === 0) return;
  importing = true;

  try {
    let totalEleves = 0;
    let totalCreneaux = 0;

    // Parse all colloscope sheets first (each sheet → its own Colloscope)
    const parsedColloscope: Array<{ classe: string; result: ReturnType<typeof parseColloscopeSheet> }> = [];
    const parsedEleves: Array<ReturnType<typeof parseElevesSheet>> = [];

    for (const s of sheets) {
      if (s.role === "ignore") continue;
      const parsed = data.sheets.find(sh => sh.name === s.name);
      if (!parsed) continue;

      if (s.role === "eleves") {
        parsedEleves.push(parseElevesSheet(parsed));
      } else if (s.role === "colloscope") {
        parsedColloscope.push({ classe: s.classe, result: parseColloscopeSheet(parsed, s.classe) });
        totalCreneaux += parsedColloscope[parsedColloscope.length - 1].result.creneaux.length;
      }
    }

    // Import élèves
    if (parsedEleves.length > 0) {
      const allEleves = parsedEleves.flat();
      eleves.importEleves(allEleves);
      eleves.save();
      totalEleves = allEleves.length;
    }

    // Merge colloscope results
    if (parsedColloscope.length > 0) {
      // Union of all semaines by date, sorted
      const semainesMap = new Map<string, { date: string; label: string }>();
      for (const { result } of parsedColloscope) {
        for (const sem of result.semaines) {
          if (!semainesMap.has(sem.date)) {
            semainesMap.set(sem.date, sem);
          }
        }
      }
      const allSemanies = [...semainesMap.values()].sort((a, b) => a.date.localeCompare(b.date));

      // Merge creneaux and remap assignations to unified semaines index
      let nextId = 0;
      const allCreneaux: Creneau[] = [];
      const allAssignations: Record<string, (string | null)[]> = {};

      for (const { result } of parsedColloscope) {
        // Build original date → index map for this sheet
        const origDateIdx = new Map(result.semaines.map((s, i) => [s.date, i]));
        // Map old per-sheet IDs → globally unique IDs
        const idRemap = new Map<string, string>();

        for (const c of result.creneaux) {
          const newId = `creneau-${nextId++}`;
          idRemap.set(c.id, newId);
          allCreneaux.push({ ...c, id: newId });
        }

        // Remap assignations to unified semaines order with new IDs
        for (const c of result.creneaux) {
          const newId = idRemap.get(c.id)!;
          allAssignations[newId] = allSemanies.map(sem => {
            const origIdx = origDateIdx.get(sem.date);
            if (origIdx !== undefined) {
              return result.assignations[c.id]?.[origIdx] ?? null;
            }
            return null;
          });
        }
      }

      colloscope.importColloscope({
        semaines: allSemanies,
        creneaux: allCreneaux,
        assignations: allAssignations,
        startDate: allSemanies[0]?.date ?? null,
        endDate: null,
      });
    }

    colloscope.save();

    const msgs: string[] = [];
    if (totalEleves > 0) msgs.push(`${totalEleves} élèves`);
    if (totalCreneaux > 0) msgs.push(`${totalCreneaux} créneaux`);
    if (msgs.length > 0) {
      notifications.setInfo(`Import: ${msgs.join(", ")}`);
    }
  } catch (e) {
    console.error("[colles] import error:", e);
    notifications.setInfo("Erreur d'import");
  } finally {
    importing = false;
    onclose();
  }
}
</script>

<Overlay {open} onClose={onclose} ariaLabel="Import colles" variant="modal">
  <div class="cid">
    <header class="cid__header">
      <h2 class="cid__title">{t("settings.collesImport")}</h2>
      <p class="cid__subtitle">{data?.fileName ?? ""}</p>
    </header>

    <div class="cid__sheets">
      {#each sheets as sheet, i}
        <div class="cid__sheet" class:cid__sheet--active={sheet.role !== "ignore"}>
          <div class="cid__sheet-header">
            <span class="cid__sheet-name">{sheet.name}</span>
            <span class="cid__sheet-meta">{sheet.rowCount} lignes · {sheet.headers.length} colonnes</span>
          </div>

          <div class="cid__sheet-preview">
            {sheet.headers.slice(0, 8).join(" · ")}
            {#if sheet.headers.length > 8}
              <span class="cid__sheet-more">+{sheet.headers.length - 8}</span>
            {/if}
          </div>

          <div class="cid__sheet-controls">
            <div class="cid__role-group">
              <button
                type="button"
                class="cid__role-btn"
                class:cid__role-btn--active={sheet.role === "colloscope"}
                onclick={() => setRole(i, "colloscope")}
              >
                Colloscope
              </button>
              <button
                type="button"
                class="cid__role-btn"
                class:cid__role-btn--active={sheet.role === "eleves"}
                onclick={() => setRole(i, "eleves")}
              >
                Élèves
              </button>
              <button
                type="button"
                class="cid__role-btn"
                class:cid__role-btn--active={sheet.role === "ignore"}
                onclick={() => setRole(i, "ignore")}
              >
                Ignorer
              </button>
            </div>

            {#if sheet.role === "colloscope"}
              <input
                type="text"
                class="cid__classe-input"
                value={sheet.classe}
                oninput={(e) => setClasse(i, (e.target as HTMLInputElement).value)}
                placeholder="Nom de la classe"
              />
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <footer class="cid__footer">
      <button type="button" class="cid__cancel" onclick={onclose}>
        Annuler
      </button>
      <button
        type="button"
        class="cid__import"
        disabled={activeCount === 0 || importing}
        onclick={handleImport}
      >
        {importing ? "…" : `Importer (${activeCount})`}
      </button>
    </footer>
  </div>
</Overlay>

<style>
  .cid {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 68vh;
    overflow: hidden;
  }

  .cid__header {
    flex-shrink: 0;
  }

  .cid__title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }

  .cid__subtitle {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cid__sheets {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cid__sheet {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    opacity: 0.55;
    transition: opacity 0.15s;
  }

  .cid__sheet--active {
    opacity: 1;
  }

  .cid__sheet-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .cid__sheet-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
  }

  .cid__sheet-meta {
    font-size: 11px;
    color: var(--text-faint);
  }

  .cid__sheet-preview {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cid__sheet-more {
    color: var(--text-faint);
    font-style: italic;
  }

  .cid__sheet-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .cid__role-group {
    display: flex;
    gap: 2px;
    background: var(--bg);
    border-radius: var(--radius);
    padding: 2px;
  }

  .cid__role-btn {
    border: none;
    background: transparent;
    padding: 3px 10px;
    font-size: 11px;
    border-radius: calc(var(--radius) - 2px);
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.12s;
  }

  .cid__role-btn:hover {
    color: var(--text);
    background: var(--surface-hover);
  }

  .cid__role-btn--active {
    background: var(--wx-color-primary, var(--accent));
    color: #fff;
  }

  .cid__role-btn--active:hover {
    background: var(--wx-color-primary, var(--accent));
    color: #fff;
  }

  .cid__classe-input {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3px 8px;
    font-size: 12px;
    color: var(--text);
    background: var(--surface);
    width: 140px;
    outline: none;
  }

  .cid__classe-input:focus {
    border-color: var(--wx-color-primary, var(--accent));
  }

  .cid__footer {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .cid__cancel {
    border: 1px solid var(--border);
    background: transparent;
    padding: 6px 14px;
    font-size: 12px;
    border-radius: var(--radius);
    cursor: pointer;
    color: var(--text-muted);
  }

  .cid__cancel:hover {
    color: var(--text);
    background: var(--surface-hover);
  }

  .cid__import {
    border: none;
    background: var(--wx-color-primary, var(--accent));
    color: #fff;
    padding: 6px 18px;
    font-size: 12px;
    border-radius: var(--radius);
    cursor: pointer;
    font-weight: 500;
  }

  .cid__import:hover {
    opacity: 0.9;
  }

  .cid__import:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
