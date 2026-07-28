import { readTextFile, writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { joinPath } from "@/lib/files";
import type { Colloscope, Creneau, Semaine } from "@/types/colles";

export interface ColloscopeState {
  semaines: Semaine[];
  creneaux: Creneau[];
  assignations: Record<string, (string | null)[]>;
  selectedClasse: string | null;
  selectedColleur: string | null;
  startDate: string | null;
  endDate: string | null;
}

let _rootPath: string | null = null;

export function createColloscopeStore() {
  let state = $state<ColloscopeState>({
    semaines: [],
    creneaux: [],
    assignations: {},
    selectedClasse: null,
    selectedColleur: null,
    startDate: null,
    endDate: null,
  });

  return {
    get state() { return state; },

    get creneauxFiltered(): Creneau[] {
      return state.creneaux.filter(c => {
        if (state.selectedClasse && c.classe !== state.selectedClasse) return false;
        if (state.selectedColleur && c.colleur !== state.selectedColleur) return false;
        return true;
      });
    },

    setRootPath(rootPath: string | null) {
      _rootPath = rootPath;
    },

    async load(): Promise<void> {
      if (!_rootPath) return;
      const dir = joinPath(joinPath(_rootPath, ".azprose"), "colles");
      const filePath = joinPath(dir, "colloscope.json");
      if (!(await exists(filePath))) return;
      try {
        const raw = await readTextFile(filePath);
        const data: Colloscope = JSON.parse(raw);
        state.semaines = data.semaines ?? [];
        state.creneaux = deduplicateCreneaux(data.creneaux ?? []);
        state.assignations = remapAssignations(state.creneaux, data.assignations ?? {}, data.semaines?.length ?? 0);
        state.startDate = data.startDate ?? (data.semaines?.length ? data.semaines[0].date : null);
        state.endDate = data.endDate ?? null;
      } catch (e) {
        console.error("[colloscope] load error:", e);
      }
    },

    async save(): Promise<void> {
      if (!_rootPath) return;
      const dir = joinPath(joinPath(_rootPath, ".azprose"), "colles");
      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
      }
      const filePath = joinPath(dir, "colloscope.json");
      const data: Colloscope = {
        semaines: state.semaines,
        creneaux: state.creneaux,
        assignations: state.assignations,
        startDate: state.startDate,
        endDate: state.endDate,
      };
      await writeTextFile(filePath, JSON.stringify(data, null, 2));
    },

    getGroupe(creneauId: string, semaineIndex: number): string | null {
      return state.assignations[creneauId]?.[semaineIndex] ?? null;
    },

    setGroupe(creneauId: string, semaineIndex: number, groupe: string | null): void {
      if (!state.assignations[creneauId]) {
        state.assignations[creneauId] = new Array(state.semaines.length).fill(null);
      }
      state.assignations[creneauId][semaineIndex] = groupe;
    },

    addCreneau(creneau: Creneau): void {
      state.creneaux.push(creneau);
      state.assignations[creneau.id] = new Array(state.semaines.length).fill(null);
    },

    removeCreneau(id: string): void {
      state.creneaux = state.creneaux.filter(c => c.id !== id);
      delete state.assignations[id];
    },

    updateCreneau(id: string, updates: Partial<Creneau>): void {
      const c = state.creneaux.find(c => c.id === id);
      if (c) Object.assign(c, updates);
    },

    setSemaines(semaines: Semaine[]): void {
      state.semaines = semaines;
      for (const id of Object.keys(state.assignations)) {
        const old = state.assignations[id];
        state.assignations[id] = semaines.map((_, i) => old[i] ?? null);
      }
    },

    selectClasse(classe: string | null): void {
      state.selectedClasse = classe;
    },

    selectColleur(colleur: string | null): void {
      state.selectedColleur = colleur;
    },

    get classes(): string[] {
      return [...new Set(state.creneaux.map(c => c.classe))].sort();
    },

    get colleurs(): string[] {
      return [...new Set(state.creneaux.map(c => c.colleur))].sort();
    },

    getCreneauxForJour(jour: string): Creneau[] {
      return this.creneauxFiltered.filter(c => c.jour === jour);
    },

    importColloscope(data: Colloscope): void {
      state.semaines = data.semaines;
      state.creneaux = data.creneaux;
      state.assignations = data.assignations;
      state.startDate = data.startDate ?? (data.semaines.length ? data.semaines[0].date : null);
      state.endDate = data.endDate ?? null;
    },
  };
}

export const colloscope = createColloscopeStore();

/**
 * Deduplicate creneau IDs. When multiple sheets were imported independently,
 * each generated `creneau-0..15`. On merge, IDs may collide.
 * This renumbers all creneaux to ensure unique IDs.
 */
function deduplicateCreneaux(creneaux: Creneau[]): Creneau[] {
  const seen = new Map<string, number>();
  return creneaux.map(c => {
    const count = seen.get(c.id) ?? 0;
    if (count === 0) {
      seen.set(c.id, 1);
      return c;
    }
    seen.set(c.id, count + 1);
    const newId = `${c.id}__${count}`;
    return { ...c, id: newId };
  });
}

/**
 * Remap assignations keys to match deduplicated creneau IDs.
 */
function remapAssignations(
  creneaux: Creneau[],
  assignations: Record<string, (string | null)[]>,
  semainesCount: number,
): Record<string, (string | null)[]> {
  // Build oldId → newId map from the original keys in assignations
  const oldKeys = Object.keys(assignations);
  const idMap = new Map<string, string>();
  const seen = new Map<string, number>();

  for (const key of oldKeys) {
    const count = seen.get(key) ?? 0;
    idMap.set(key, count === 0 ? key : `${key}__${count}`);
    seen.set(key, count + 1);
  }

  const result: Record<string, (string | null)[]> = {};
  for (const c of creneaux) {
    // Find original key that maps to this creneau's current ID
    const origKey = [...idMap.entries()].find(([, v]) => v === c.id)?.[0] ?? c.id;
    result[c.id] = assignations[origKey] ?? new Array(semainesCount).fill(null);
  }
  return result;
}
