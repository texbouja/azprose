import { writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { joinPath, walkSupportedTextFiles } from "@/lib/files";
import { extFromPath } from "@/lib/editor-languages";

export interface JournalState {
  viewedMonth: { year: number; month: number };
  noteDates: Set<string>;
  selectedDate: string | null;
}

export function createJournalState() {
  let state = $state<JournalState>({
    viewedMonth: todayYearMonth(),
    noteDates: new Set(),
    selectedDate: null,
  });

  return {
    get state() { return state; },

    async scanForNotes(rootPath: string | null, folder: string): Promise<void> {
      if (!rootPath) return;
      const scanDir = folder ? joinPath(rootPath, folder) : rootPath;
      let files;
      try {
        files = await walkSupportedTextFiles(scanDir);
      } catch { return; }
      const dates = new Set<string>();
      for (const f of files) {
        if (extFromPath(f.path) !== "md") continue;
        const base = f.name.replace(/\.md$/i, "");
        if (/^\d{4}-\d{2}-\d{2}$/.test(base)) dates.add(base);
      }
      state.noteDates = dates;
    },

    notePath(date: string, rootPath: string | null, folder: string): string | null {
      if (!rootPath) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      const dir = folder ? joinPath(rootPath, folder) : rootPath;
      return joinPath(dir, `${date}.md`);
    },

    async noteExists(date: string, rootPath: string | null, folder: string): Promise<boolean> {
      const p = this.notePath(date, rootPath, folder);
      if (!p) return false;
      return exists(p);
    },

    async createNote(
      date: string,
      rootPath: string | null,
      folder: string,
    ): Promise<string | null> {
      if (!rootPath) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      const dir = folder ? joinPath(rootPath, folder) : rootPath;
      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
      }
      const filePath = joinPath(dir, `${date}.md`);
      if (!(await exists(filePath))) {
        await writeTextFile(filePath, `# ${date}\n\n## Travaux en classe\n\n`);
      }
      state.noteDates = new Set(state.noteDates).add(date);
      return filePath;
    },

    prevMonth(): void {
      const { year, month } = state.viewedMonth;
      state.viewedMonth = month === 0
        ? { year: year - 1, month: 11 }
        : { year, month: month - 1 };
    },

    nextMonth(): void {
      const { year, month } = state.viewedMonth;
      state.viewedMonth = month === 11
        ? { year: year + 1, month: 0 }
        : { year, month: month + 1 };
    },

    selectDate(date: string | null): void {
      state.selectedDate = date;
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function todayYearMonth(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}
