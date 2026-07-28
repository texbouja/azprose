import { writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { joinPath, walkSupportedTextFiles } from "@/lib/files";
import { extFromPath } from "@/lib/editor-languages";
import { colloscope } from "@/stores/colloscope.svelte";
import { eleves } from "@/stores/eleves.svelte";

export interface JournalState {
  viewedMonth: { year: number; month: number };
  noteDates: Set<string>;
  selectedDate: string | null;
}

const JOUR_TO_WEEKDAY: Record<string, number> = {
  Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3, Vendredi: 4, Samedi: 5, Dimanche: 6,
};

function generateCollesSection(date: string): string {
  if (!colloscope.state.semaines.length || !colloscope.state.creneaux.length) return "";

  const noteDate = new Date(date + "T00:00:00");
  const noteDow = noteDate.getDay();
  const noteDowIdx = (noteDow + 6) % 7;

  const matchingSemaines: number[] = [];
  for (let i = 0; i < colloscope.state.semaines.length; i++) {
    const sDate = new Date(colloscope.state.semaines[i].date + "T00:00:00");
    const sEnd = new Date(sDate);
    sEnd.setDate(sEnd.getDate() + 7);
    if (noteDate >= sDate && noteDate < sEnd) {
      matchingSemaines.push(i);
    }
  }

  if (!matchingSemaines.length) return "";

  const blocks: string[] = [];
  for (const semIdx of matchingSemaines) {
    for (const c of colloscope.state.creneaux) {
      const cDow = JOUR_TO_WEEKDAY[c.jour];
      if (cDow === undefined || cDow !== noteDowIdx) continue;

      const groupe = colloscope.getGroupe(c.id, semIdx);
      if (!groupe) continue;

      const groupEleves = eleves.getElevesForGroupe(c.classe, groupe);
      if (!groupEleves.length) continue;

      for (const el of groupEleves) {
        blocks.push(
          "```colle",
          `date: ${date}`,
          `eleve: ${el.nom} ${el.prenom}`,
          `groupe: ${groupe}`,
          `classe: ${c.classe}`,
          `matiere: ${c.matiere}`,
          `colleur: ${c.colleur}`,
          `salle: ${c.salle}`,
          `horaire: ${c.horaire}`,
          "note:",
          "- ",
          "- ",
          "- ",
          "```",
          "",
        );
      }
    }
  }

  if (!blocks.length) return "";
  return "\n## Colles\n\n" + blocks.join("\n");
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
        const collesSection = generateCollesSection(date);
        await writeTextFile(filePath, `# ${date}\n\n## Travaux en classe\n\n${collesSection}`);
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
