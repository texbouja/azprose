import { persistedState } from "@/stores/persisted.svelte";
import { STORAGE_KEYS } from "@/lib/storage";

/**
 * État de repli des sections de la sidebar (folding VSCode-like), persisté
 * globalement (UI pref, non scoped) par `id` de section. Store PARTAGÉ :
 * SidebarSection le lit en mode autonome, la vue hôte (LinksView) le réécrit
 * en mode accordéon (contrôlé) — les deux doivent voir la même instance.
 */
export const sidebarSections = persistedState<Record<string, boolean>>(
  STORAGE_KEYS.sidebarSections,
  {},
);
