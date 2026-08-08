<script lang="ts">
import { journalSettings } from "@/stores/journal-settings.svelte";
import { createJournalState } from "@/stores/journal-store.svelte";
import { ensureDailyNoteWithColles } from "@/colles/daily-note-io";
import { joinPath, type FileEntry } from "@/lib/files";
import JournalCalendar from "./journal-calendar.svelte";
import VirtualTree from "./virtual-tree.svelte";


let {
  rootPath,
  activePath,
  onSelectFile,
  treeVersion = 0,
  onOpenCalendar,
  onDeleteEntry,
}: {
  rootPath: string | null;
  activePath: string | null;
  /** Clic simple : `onSelectFile(path)` — tab actif. Alt+clic (journal,
   *  arbre) : `onSelectFile(path, true)` — nouvel onglet. */
  onSelectFile: (path: string, newTab?: boolean) => void;
  treeVersion?: number;
  onOpenCalendar?: () => void;
  onDeleteEntry?: (entry: FileEntry) => void;
} = $props();

const journal = createJournalState();

let folder = $derived(journalSettings.current.journalFolder);
let dailyPath = $derived(rootPath ? (folder ? joinPath(rootPath, folder) : rootPath) : null);
let scrollToNote = $state<string | null>(null);

// Initialize on mount / rootPath / folder change
$effect(() => {
  void rootPath;
  void folder;
  journal.state.selectedDate = null;
  journal.scanForNotes(rootPath, folder);
});

// Rescan when FS changes (don't touch viewedMonth / selectedDate)
$effect(() => {
  void treeVersion;
  if (treeVersion > 0) journal.scanForNotes(rootPath, folder);
});

async function handleSelectDate(date: string) {
  journal.selectDate(date);
  const exists = await journal.noteExists(date, rootPath, folder);
  if (!exists) {
    const p = await ensureDailyNoteWithColles(date, rootPath, folder);
    if (p) {
      onSelectFile(p);
      scrollToNote = p;
    }
    return;
  }
  const p = journal.notePath(date, rootPath, folder);
  if (p) {
    onSelectFile(p);
    scrollToNote = p;
  }
}

</script>

<div class="mdv-journal">
  <div class="mdv-journal__tree">
    {#if dailyPath}
      <VirtualTree
        noteDates={journal.state.noteDates}
        rootPath={dailyPath}
        {activePath}
        onSelect={(p, newTab) => onSelectFile(p, newTab)}
        onDelete={onDeleteEntry}
        scrollToPath={scrollToNote}
      />
    {/if}
  </div>

  <div class="mdv-journal__bottom">
    <div class="mdv-journal__bottom-header">
      <span class="mdv-journal__bottom-title">Calendar</span>
      {#if onOpenCalendar}
        <button class="mdv-journal__edit-btn" onclick={onOpenCalendar} title="Open full calendar">
          <i class="wxi-pencil" style="font-size:12px"></i>
        </button>
      {/if}
    </div>
    <div class="mdv-journal__calendar">
      <JournalCalendar
        onSelectDate={handleSelectDate}
      />
    </div>
  </div>
</div>

<style>
  .mdv-journal {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .mdv-journal__tree {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .mdv-journal__bottom {
    flex-shrink: 0;
    height: 260px;
    border-top: 1px solid var(--border);
    margin-top: 4px;
    display: flex;
    flex-direction: column;
  }
  .mdv-journal__bottom-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 0;
    flex-shrink: 0;
  }
  .mdv-journal__bottom-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .mdv-journal__calendar {
    flex: 1;
    min-height: 0;
  }
  .mdv-journal__edit-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .mdv-journal__edit-btn:hover {
    background: var(--accent);
    color: var(--bg);
  }
</style>
