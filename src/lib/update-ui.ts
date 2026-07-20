import { checkForUpdate, applyUpdate } from "@/lib/updater";

export interface UpdateUIState {
  updateInstalling: boolean
  updateAvail: { version: string } | null
  updateUpToDate: boolean
  setUpdateInstalling: (v: boolean) => void
  setUpdateAvail: (v: { version: string } | null) => void
  setUpdateUpToDate: (v: boolean) => void
  notify: { setLoadError: (err: { title: string; message: string }) => void }
}

export async function handleApplyUpdate(state: UpdateUIState) {
  if (state.updateInstalling) return;
  state.setUpdateInstalling(true);
  try {
    await applyUpdate();
  } catch (err) {
    console.error("azprose: update install failed", err);
    state.notify.setLoadError({
      title: "Update error",
      message: `couldn't install update — ${err instanceof Error ? err.message : err}`,
    });
    state.setUpdateInstalling(false);
  }
}

export async function handleManualUpdateCheck(state: UpdateUIState) {
  const result = await checkForUpdate();
  if (result.status === "available") {
    state.setUpdateAvail({ version: result.version });
  } else if (result.status === "none") {
    state.setUpdateUpToDate(true);
  } else {
    state.notify.setLoadError({
      title: "Update check failed",
      message: `update check failed — ${result.message}`,
    });
  }
}
