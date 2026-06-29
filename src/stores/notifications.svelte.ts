export type LoadError = {
  title: string;
  message: string;
};

function createNotifications() {
  let loadError = $state<LoadError | null>(null);
  let saveAsToast = $state<string | null>(null);
  let infoToast = $state<string | null>(null);

  return {
    get loadError() { return loadError; },
    setLoadError(v: LoadError | null) { loadError = v; },
    dismissLoadError() { loadError = null; },
    get saveAsToast() { return saveAsToast; },
    dismissSaveAsToast() { saveAsToast = null; },
    showSaveAsToast(message: string) {
      saveAsToast = message;
      setTimeout(() => { saveAsToast = null; }, 2400);
    },
    get infoToast() { return infoToast; },
    setInfo(message: string) {
      infoToast = message;
      setTimeout(() => { infoToast = null; }, 4000);
    },
    dismissInfoToast() { infoToast = null; },
  };
}

export const notifications = createNotifications();
