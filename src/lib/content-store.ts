/**
 * ContentStore — source unique du contenu des fichiers par CHEMIN (phase 7,
 * idée E du rapport architecture-review).
 *
 * Le rapport l'énonce comme l'autorité finale : « le contenu courant d'un
 * fichier est défini comme le disque, plus les brouillons, plus le buffer de
 * l'onglet actif ». Trois écrivains concurrents existaient (l'éditeur via
 * `setSource`, le save, `syncSideTabFromDisk`) — ce store les unifie : un
 * chemin a UN contenu, quel que soit l'onglet qui l'affiche (main ou side).
 *
 * Couches par chemin :
 * - `buffer` — édition en cours (onglet éditeur ouvert dessus) ; l'écrivain
 *   unique (setBuffer, appelé par l'`onChange` de l'éditeur).
 * - `draft`  — overlay de brouillon parké (politique A : navigation/fermeture
 *   avec edits non sauvegardés). Le draft vit AUSSI dans le session store
 *   (hot-exit) — le store est le miroir du dernier park.
 * - `saved`  — disque au dernier load/persist.
 *
 * `get(path)` = buffer ?? draft ?? saved ?? "".
 *
 * Réactivité : le store lui-même est PUR (testable sans Svelte/Tauri — DI
 * `ContentFs`). La réactivité est portée par `ContentHooks.onVersion` : le
 * store réactif (`src/stores/content.svelte.ts`) maintient un miroir $state
 * des versions, et les dérivés (`contentFor`, `contentVersionOf`) trackent ce
 * miroir. Tout bump (load, persist, setBuffer, park) relance les dérivés qui
 * lisent le chemin — c'est le remplacement direct de `_panelVersion++` +
 * `azprose:preview-force-rerender` pour le CONTENU (les mutations de panel —
 * tabs, activeTabId — restent portées par `_panelVersion`).
 */
export interface ContentFs {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  saveDraft(path: string, text: string): void;
  loadDraft(path: string): string | null;
  clearDraft(path: string): void;
}

export interface ContentHooks {
  /** Appelé à CHAQUE bump de version (même idempotent). */
  onVersion?: (path: string, version: number) => void;
}

export interface ContentEntry {
  /** Édition en cours (onglet éditeur ouvert dessus). */
  buffer?: string;
  /** Brouillon parké (politique A / hot-exit). */
  draft?: string;
  /** Disque au dernier load/persist. */
  saved?: string;
}

export class ContentStore {
  private entries = new Map<string, ContentEntry>();
  private versions = new Map<string, number>();
  private seq = 0;

  constructor(private fs: ContentFs, private hooks: ContentHooks = {}) {}

  /** Normalisation des chemins — identique à open/repoint (filtre `.` et `..`,
   *  jamais de dé-normalisation `a/../b` — les chemins de l'app sont absolus). */
  norm(path: string): string {
    return path.split("/").filter((s) => s !== "." && s !== "..").join("/");
  }

  /** Version de contenu (0 = jamais lu/écrit). */
  versionOf(path: string): number {
    return this.versions.get(this.norm(path)) ?? 0;
  }

  /** Le chemin a-t-il déjà été lu ou écrit ? */
  has(path: string): boolean {
    return this.entries.has(this.norm(path));
  }

  /** Contenu courant : buffer ?? draft ?? saved ?? "". */
  get(path: string): string {
    const e = this.entries.get(this.norm(path));
    return e?.buffer ?? e?.draft ?? e?.saved ?? "";
  }

  /** Contenu disque (dernier load/persist). */
  getSaved(path: string): string {
    return this.entries.get(this.norm(path))?.saved ?? "";
  }

  /** Brouillon parké, s'il existe. */
  getDraft(path: string): string | null {
    return this.entries.get(this.norm(path))?.draft ?? null;
  }

  /** L'ÉCRIVAIN UNIQUE de l'édition (onChange de l'éditeur). Idempotent : un
   *  texte identique au buffer courant ne bump pas. */
  setBuffer(path: string, text: string): void {
    const k = this.norm(path);
    const e = this.entries.get(k);
    if (e?.buffer === text) return;
    this.entries.set(k, { ...e, buffer: text });
    this.bump(k);
  }

  /** Lecture disque : `saved` = disque. Le buffer EXISTANT est préservé (un
   *  éditeur ouvert dessus garde son édition) SAUF `forceBuffer: true`
   *  (reload externe / conflit — l'utilisateur a choisi de recharger le
   *  disque). Sans buffer : `preferDraft ? draft ?? disque : disque`
   *  (politique A au retour d'une navigation). Un draft VIDE est traité
   *  comme absent : il ne peut être qu'un artefact (buffer "" écrit par le
   *  sync value de l'éditeur pendant la fenêtre source:"" d'open()), et
   *  restaurer "" par-dessus un disque non vide afficherait un fichier vidé. */
  async load(
    path: string,
    opts?: { preferDraft?: boolean; forceBuffer?: boolean },
  ): Promise<string> {
    const k = this.norm(path);
    const text = await this.fs.readText(path);
    const e = this.entries.get(k) ?? {};
    e.saved = text;
    if (e.buffer === undefined || opts?.forceBuffer) {
      const draft = opts?.preferDraft ? this.fs.loadDraft(path) : null;
      e.buffer = draft !== null && draft !== "" && draft !== text ? draft : text;
    }
    this.entries.set(k, e);
    this.bump(k);
    return e.buffer ?? text;
  }

  /** Écriture disque du contenu courant (buffer ?? draft ?? saved) ;
   *  clearDraft ; `saved` = écrit. No-op sans entrée (rien à persister). */
  async persist(path: string): Promise<void> {
    const k = this.norm(path);
    const e = this.entries.get(k);
    if (!e) return;
    const text = e.buffer ?? e.draft ?? e.saved;
    if (text === undefined) return;
    await this.fs.writeText(path, text);
    e.saved = text;
    this.entries.set(k, e);
    this.fs.clearDraft(path);
    this.bump(k);
  }

  /** Park (politique A) : le buffer quitte la scène (onglet fermé/repointé),
   *  le draft le conserve. Sans edits (buffer === saved) : libère juste le
   *  buffer. No-op sans buffer (tab side reflet / kind data — jamais parké). */
  park(path: string): void {
    const k = this.norm(path);
    const e = this.entries.get(k);
    if (!e || e.buffer === undefined) return;
    if (e.buffer === e.saved) {
      e.buffer = undefined;
      this.entries.set(k, e);
      this.bump(k);
      return;
    }
    this.fs.saveDraft(path, e.buffer);
    e.draft = e.buffer;
    e.buffer = undefined;
    this.entries.set(k, e);
    this.bump(k);
  }

  private bump(k: string): void {
    this.seq++;
    this.versions.set(k, this.seq);
    this.hooks.onVersion?.(k, this.seq);
  }
}
