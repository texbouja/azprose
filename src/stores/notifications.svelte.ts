export type LoadError = {
  title: string;
  message: string;
};

function createNotifications() {
  let loadError = $state<LoadError | null>(null);
  let saveAsToast = $state<string | null>(null);
  let infoToast = $state<string | null>(null);
  /** Toast en VARIANTE ERREUR — refus passerelle, indiponnibilité… : plus
   *  visible qu'un info-toast et sémantiquement juste. Auto-fermé 6 s. */
  let errorToast = $state<string | null>(null);

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
    get errorToast() { return errorToast; },
    showError(message: string) {
      // Un seul à la fois : le nouveau remplace l'ancien (les timers
      // concurrents ne font que vider une chaîne déjà remplacée).
      errorToast = message;
      setTimeout(() => { if (errorToast === message) errorToast = null; }, 6000);
    },
    dismissError() { errorToast = null; },
  };
}

export const notifications = createNotifications();
