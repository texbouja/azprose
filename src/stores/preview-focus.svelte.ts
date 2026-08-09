/**
 * Store du FOCUS des previews md (règle non-état : ctrl+s au focus d'un
 * preview enregistre LE .md affiché par ce preview, pas le tab main actif).
 *
 * Le focus est rapporté par MarkdownPreview via un écouteur `focusin`
 * document-level : dès qu'un élément focusable DANS un preview ([data-file-path])
 * reçoit le focus, `path` = fichier rendu ; tout autre focus le remet à null.
 * Le chemin est normalisé (le rendu affiche le tab side actif, mais le focus
 * peut vivre dans un preview d'un autre tab si plusieurs sont empilés).
 */
export interface PreviewFocusStore {
  /** Version réactive (bump à chaque changement de focus). */
  get version(): number;
  /** Chemin du preview md ayant le focus, null sinon. */
  get path(): string | null;
  setFocus(path: string | null): void;
}

let focusPath: string | null = null;
let version = $state(0);

export function getPreviewFocusStore(): PreviewFocusStore {
  return {
    get version() {
      return version;
    },
    get path() {
      return focusPath;
    },
    setFocus(path: string | null): void {
      if (focusPath === path) return;
      focusPath = path;
      version++;
    },
  };
}
