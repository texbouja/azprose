/**
 * Store réactif des réglages colles (project-scoped via config.json, cache
 * localStorage). Le modèle PUR (types + défauts + normalisation de
 * migration) vit dans `src/colles/settings-model.ts` — ce fichier ne
 * contient que le store avec runes Svelte.
 */
import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib/storage";
import {
  DEFAULT_COLLES_SETTINGS,
  normalizeCollesSettings,
  type CollesSettings,
} from "@/colles/settings-model";

export type { CollesSettings, ColleVacances } from "@/colles/settings-model";
export { DEFAULT_COLLES_SETTINGS, normalizeCollesSettings } from "@/colles/settings-model";

export const collesSettings = persistedState<CollesSettings>(
  STORAGE_KEYS.collesSettings,
  DEFAULT_COLLES_SETTINGS,
  normalizeCollesSettings,
);
