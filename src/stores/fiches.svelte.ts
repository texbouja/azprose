import { readTextFile, writeTextFile, exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { joinPath } from "@/lib/files";
import type { Fiche } from "@/types/colles";

let _rootPath: string | null = null;

function collesDir(): string {
  return joinPath(joinPath(joinPath(_rootPath!, ".azprose"), "colles"), "fiches");
}

export function createFichesStore() {
  let state = $state<{ fiches: Fiche[] }>({
    fiches: [],
  });

  return {
    get state() { return state; },

    setRootPath(rootPath: string | null) {
      _rootPath = rootPath;
    },

    async load(): Promise<void> {
      if (!_rootPath) return;
      const dir = collesDir();
      if (!(await exists(dir))) return;
      try {
        const { readDir } = await import("@tauri-apps/plugin-fs");
        const entries = await readDir(dir);
        const fiches: Fiche[] = [];
        for (const entry of entries) {
          if (!entry.name?.endsWith(".json")) continue;
          const raw = await readTextFile(joinPath(dir, entry.name));
          fiches.push(JSON.parse(raw));
        }
        state.fiches = fiches;
      } catch (e) {
        console.error("[fiches] load error:", e);
      }
    },

    async saveFiche(fiche: Fiche): Promise<void> {
      if (!_rootPath) return;
      const dir = collesDir();
      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
      }
      const filePath = joinPath(dir, `${fiche.id}.json`);
      await writeTextFile(filePath, JSON.stringify(fiche, null, 2));
      const idx = state.fiches.findIndex(f => f.id === fiche.id);
      if (idx >= 0) {
        state.fiches[idx] = fiche;
      } else {
        state.fiches.push(fiche);
      }
    },

    async deleteFiche(id: string): Promise<void> {
      if (!_rootPath) return;
      const dir = collesDir();
      const filePath = joinPath(dir, `${id}.json`);
      if (await exists(filePath)) {
        await remove(filePath);
      }
      state.fiches = state.fiches.filter(f => f.id !== id);
    },

    getFichesForCreneau(creneauId: string, semaineIndex: number): Fiche[] {
      return state.fiches.filter(
        f => f.creneau === creneauId && f.semaine === semaineIndex,
      );
    },

    getFichesForColleur(colleur: string): Fiche[] {
      return state.fiches.filter(f => f.colleur === colleur);
    },

    getFichesForSemaine(semaineIndex: number): Fiche[] {
      return state.fiches.filter(f => f.semaine === semaineIndex);
    },

    createFicheId(matiere: string, colleur: string, classe: string, groupe: string, semaine: number): string {
      const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return `${slug(matiere)}-${slug(colleur)}-${slug(classe)}-${slug(groupe)}-S${semaine}`;
    },
  };
}

export const fiches = createFichesStore();
