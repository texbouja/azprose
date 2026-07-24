<script lang="ts">
import { journalSettings } from "@/stores/journal-settings.svelte";
import { createJournalState } from "@/stores/journal-store.svelte";
import { joinPath } from "@/lib/files";
import CalendarWidget from "./calendar-widget.svelte";
import VirtualTree from "./virtual-tree.svelte";

let {
  rootPath,
  activePath,
  onSelectFile,
  treeVersion = 0,
}: {
  rootPath: string | null;
  activePath: string | null;
  onSelectFile: (path: string) => void;
  treeVersion?: number;
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
  journal.state.viewedMonth = { year: new Date().getFullYear(), month: new Date().getMonth() };
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
    const p = await journal.createNote(date, rootPath, folder);
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
        onSelect={onSelectFile}
        scrollToPath={scrollToNote}
      />
    {/if}
  </div>

  <div class="mdv-journal__bottom">
    <CalendarWidget
      viewedMonth={journal.state.viewedMonth}
      noteDates={journal.state.noteDates}
      selectedDate={journal.state.selectedDate}
      onPrevMonth={() => journal.prevMonth()}
      onNextMonth={() => journal.nextMonth()}
      onSelectDate={handleSelectDate}
    />
  </div>
</div>
