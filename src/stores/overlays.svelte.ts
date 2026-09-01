import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

function createOverlays() {
  let paletteOpen = $state(false);
  let aboutOpen = $state(false);
  // Notes de version — modale propre, ouverte par le bouton « À propos » de la
  // barre d'état (distincte de `aboutOpen`, la carte d'identité du palette).
  let releaseNotesOpen = $state(false);
  let settingsOpen = $state(false);
  const welcomed = persistedState<boolean>(STORAGE_KEYS.welcomed, false);
  let welcomeOpen = $state(!welcomed.current);

  return {
    get paletteOpen() { return paletteOpen; },
    setPaletteOpen(v: boolean) { paletteOpen = v; },
    get aboutOpen() { return aboutOpen; },
    setAboutOpen(v: boolean) { aboutOpen = v; },
    get releaseNotesOpen() { return releaseNotesOpen; },
    setReleaseNotesOpen(v: boolean) { releaseNotesOpen = v; },
    showReleaseNotes() { releaseNotesOpen = true; },
    get settingsOpen() { return settingsOpen; },
    setSettingsOpen(v: boolean) { settingsOpen = v; },
    showSettings() { settingsOpen = true; },
    openSettings(_section?: string) { settingsOpen = true; },
    get welcomeOpen() { return welcomeOpen; },
    dismissWelcome() { welcomeOpen = false; welcomed.current = true; },
    showWelcome() { welcomeOpen = true; },
    showAbout() { aboutOpen = true; },
  };
}

export const overlays = createOverlays();
