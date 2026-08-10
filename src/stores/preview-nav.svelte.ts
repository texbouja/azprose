/**
 * Store du MODE NAVIGATION des tabs preview (décision utilisateur, matrice de
 * navigation) : en mode nav, les clics wikilink du preview naviguent IN-PLACE
 * (l'éditeur lié ne suit plus) ; hors mode nav, ils ouvrent un onglet éditeur.
 *
 * État PAR TAB preview (clé = tabId du side panel) — JAMAIS persisté en
 * session (à la différence des préférences UI) : le mode est un état
 * d'interaction éphémère qui meurt avec l'onglet. La taille du Map est bornée
 * par le nombre d'onglets side de la session.
 */
export interface PreviewNavStore {
  /** Version réactive (bump à chaque changement) — pour les dérivés $state. */
  get version(): number;
  /** Mode navigation du tab `tabId`, false si inconnu. */
  isNavMode(tabId: string | null | undefined): boolean;
  /** Pose/retire le mode navigation du tab `tabId` (no-op si inchangé). */
  setNavMode(tabId: string | null | undefined, on: boolean): void;
  /** Purge du tab `tabId` — appelé à la fermeture de l'onglet (matrice cas 3 :
   *  le mode est un état d'interaction qui meurt avec l'onglet). */
  clearTab(tabId: string | null | undefined): void;
  /** Purge complète (aucun tab en mode nav). */
  reset(): void;
}

const modes = new Map<string, boolean>();
let version = $state(0);

export function getPreviewNavStore(): PreviewNavStore {
  return {
    get version() {
      return version;
    },
    isNavMode(tabId: string | null | undefined): boolean {
      return tabId ? (modes.get(tabId) ?? false) : false;
    },
    setNavMode(tabId: string | null | undefined, on: boolean): void {
      if (!tabId) return;
      const cur = modes.get(tabId) ?? false;
      if (cur === on) return;
      if (on) modes.set(tabId, true);
      else modes.delete(tabId);
      version++;
    },
    clearTab(tabId: string | null | undefined): void {
      if (!tabId) return;
      if (modes.delete(tabId)) version++;
    },
    reset(): void {
      if (modes.size > 0) {
        modes.clear();
        version++;
      }
    },
  };
}
