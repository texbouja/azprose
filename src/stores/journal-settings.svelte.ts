import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib/storage";

export interface JournalSettings {
  dailyNoteFormat: string;
  journalFolder: string;
  weekStartsOnMonday: boolean;
}

const DEFAULTS: JournalSettings = {
  dailyNoteFormat: "%Y-%m-%d",
  journalFolder: "daily",
  weekStartsOnMonday: true,
};

export const journalSettings = persistedState<JournalSettings>(
  STORAGE_KEYS.journalSettings, DEFAULTS,
);
