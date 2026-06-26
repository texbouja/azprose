import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

function createOverlays() {
  let paletteOpen = $state(false);
  let helpOpen = $state(false);
  let aboutOpen = $state(false);
  let settingsOpen = $state(false);
  const welcomed = persistedState<boolean>(STORAGE_KEYS.welcomed, false);
  let welcomeOpen = $state(!welcomed.current);

  return {
    get paletteOpen() { return paletteOpen; },
    setPaletteOpen(v: boolean) { paletteOpen = v; },
    get helpOpen() { return helpOpen; },
    setHelpOpen(v: boolean) { helpOpen = v; },
    get aboutOpen() { return aboutOpen; },
    setAboutOpen(v: boolean) { aboutOpen = v; },
    get settingsOpen() { return settingsOpen; },
    setSettingsOpen(v: boolean) { settingsOpen = v; },
    showSettings() { settingsOpen = true; },
    get welcomeOpen() { return welcomeOpen; },
    dismissWelcome() { welcomeOpen = false; welcomed.current = true; },
    showWelcome() { welcomeOpen = true; },
    showHelp() { helpOpen = true; },
    showAbout() { aboutOpen = true; },
  };
}

export const overlays = createOverlays();
