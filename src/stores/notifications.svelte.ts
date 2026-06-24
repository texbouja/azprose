export type LoadError = {
  title: string;
  message: string;
};

function createNotifications() {
  let loadError = $state<LoadError | null>(null);
  let copyPulse = $state(false);
  let copyToast = $state<string | null>(null);
  let saveAsToast = $state<string | null>(null);

  return {
    get loadError() { return loadError; },
    setLoadError(v: LoadError | null) { loadError = v; },
    dismissLoadError() { loadError = null; },
    get copyPulse() { return copyPulse; },
    get copyToast() { return copyToast; },
    dismissCopyToast() { copyToast = null; },
    get saveAsToast() { return saveAsToast; },
    dismissSaveAsToast() { saveAsToast = null; },
    showSaveAsToast(message: string) {
      saveAsToast = message;
      setTimeout(() => { saveAsToast = null; }, 2400);
    },
    async copyMarkdown(text: string, message = "copied to clipboard · paste anywhere") {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        copyPulse = true;
        copyToast = message;
        setTimeout(() => { copyPulse = false; }, 1200);
        setTimeout(() => { copyToast = null; }, 2200);
      } catch (err) {
        console.error("azprose: copy failed", err);
      }
    },
  };
}

export const notifications = createNotifications();
