import { readTextFile, writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { joinPath } from "@/lib/files";
import type { Eleve } from "@/types/colles";

export interface ElevesState {
  eleves: Eleve[];
}

let _rootPath: string | null = null;

export function createElevesStore() {
  let state = $state<ElevesState>({
    eleves: [],
  });

  return {
    get state() { return state; },

    setRootPath(rootPath: string | null) {
      _rootPath = rootPath;
    },

    async load(): Promise<void> {
      if (!_rootPath) return;
      const dir = joinPath(joinPath(_rootPath, ".azprose"), "colles");
      const filePath = joinPath(dir, "eleves.json");
      if (!(await exists(filePath))) return;
      try {
        const raw = await readTextFile(filePath);
        state.eleves = JSON.parse(raw);
      } catch (e) {
        console.error("[eleves] load error:", e);
      }
    },

    async save(): Promise<void> {
      if (!_rootPath) return;
      const dir = joinPath(joinPath(_rootPath, ".azprose"), "colles");
      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
      }
      const filePath = joinPath(dir, "eleves.json");
      await writeTextFile(filePath, JSON.stringify(state.eleves, null, 2));
    },

    getElevesForGroupe(classe: string, groupe: string): Eleve[] {
      return state.eleves.filter(
        e => e.classe === classe && e.groupe === groupe,
      );
    },

    getElevesForClasse(classe: string): Eleve[] {
      return state.eleves.filter(e => e.classe === classe);
    },

    getGroupesForClasse(classe: string): string[] {
      return [...new Set(
        state.eleves
          .filter(e => e.classe === classe)
          .map(e => e.groupe),
      )].sort();
    },

    get classes(): string[] {
      return [...new Set(state.eleves.map(e => e.classe))].sort();
    },

    addEleve(eleve: Eleve): void {
      state.eleves.push(eleve);
    },

    removeEleve(id: string): void {
      state.eleves = state.eleves.filter(e => e.id !== id);
    },

    updateEleve(id: string, updates: Partial<Eleve>): void {
      const e = state.eleves.find(e => e.id === id);
      if (e) Object.assign(e, updates);
    },

    importEleves(eleves: Eleve[]): void {
      state.eleves = eleves;
    },
  };
}

export const eleves = createElevesStore();
