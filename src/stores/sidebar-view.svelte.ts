import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib/storage";

export type SidebarView = "files" | "journal";

export const sidebarView = persistedState<SidebarView>(
  STORAGE_KEYS.sidebarView, "files",
);
