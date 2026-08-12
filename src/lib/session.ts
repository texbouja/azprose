// Session persistence — modèle VSCode hot-exit :
// • session (liste des onglets) : localStorage, écrite sur chaque action utilisateur
// • brouillons (contenu dirty) : localStorage, écrits sur blur/visibilitychange/fermeture
// Tout est synchrone → zéro overhead pendant la frappe, et survit à un crash.
//
// Isolation par projet (Étape 2a) : les clés sont scopées par dossier de projet
// (setSessionScope au boot) → deux fenêtres/projets ne se télescopent plus. La copie
// canonique portable vit dans .azprose/session.json (Étape 2b, voir project-session.ts) ;
// localStorage reste le stockage synchrone primaire (anti-perte), .azprose/ ne sert qu'au
// boot quand le localStorage scopé est vide (projet déplacé/copié).

const SESSION_KEY = "azp:session";
const DRAFT_PREFIX = "azp:draft:";
const LASTFILE_KEY = "azp:lastfile";
const GUESTS_KEY = "azp:guests";

// Per-project scope appended to every key. Empty = no project (global fallback).
let scope = "";
let _projectRoot: string | null = null;

/** Set the project scope for all session keys. Call once at boot, before load*(). */
export function setSessionScope(root: string | null): void {
  scope = root ? "::" + root : "";
  _projectRoot = root;
  if (root && !_draftsPurged) {
    _draftsPurged = true;
    purgeEmptyDrafts();
  }
}

/** Return the current project root path, or null if no project is open. */
export function getProjectRoot(): string | null {
  return _projectRoot;
}

/**
 * Prefix a localStorage key with the current project scope.
 * Anything stored under this key is isolated per vault (Obsidian-style),
 * preventing data leakage between projects sharing the same WebView origin.
 * Empty scope → unscoped (global fallback, e.g. before a project is opened).
 */
export function scopedKey(key: string): string {
  return key + scope;
}

function draftKey(path: string): string {
  return DRAFT_PREFIX + scope + "::" + path;
}

/**
 * Entrée de session (schema v2 — Phase E « pinned tabs ») : le CONTENU d'un
 * onglet et rien d'autre. Ne sont JAMAIS persistés (runtime, R9/R10) :
 * l'espace pinned/libre et son propriétaire, l'historique de montage, le mode
 * navigation, le couplage éditeur↔viewer (`linkedTo`, schema v1 — reconstruit
 * par CONTENU au boot). Les sessions v1 restent lisibles : les clés inconnues
 * sont simplement ignorées (migration one-shot à la première sauvegarde).
 */
export interface SessionTab {
  path: string;
  title: string;
  sourceType?: "latex";
  renderMode?: "raw" | "prose" | "preview" | "presentation" | "colle";
  kind?: "file" | "custom" | "spreadsheet" | "datafilter" | "doc";
}

export interface PanelSessionData {
  tabs: SessionTab[];
  activePath: string | null;
}

export interface SessionSideData extends PanelSessionData {
  visible: boolean;
}

export interface SessionData {
  main: PanelSessionData;
  side: SessionSideData;
}

export function saveSession(data: SessionData): void {
  try {
    localStorage.setItem(SESSION_KEY + scope, JSON.stringify(data));
  } catch { /* storage full — acceptable */ }
}

export function loadSession(): SessionData {
  try {
    const raw = localStorage.getItem(SESSION_KEY + scope);
    if (!raw) return { main: { tabs: [], activePath: null }, side: { tabs: [], activePath: null, visible: false } };
    const parsed = JSON.parse(raw);
    // Old format { tabs, activePath } → migrate
    if (Array.isArray(parsed.tabs)) {
      const migrated: SessionData = {
        main: { tabs: parsed.tabs, activePath: parsed.activePath ?? null },
        side: { tabs: [], activePath: null, visible: false },
      };
      saveSession(migrated);
      return migrated;
    }
    return parsed as SessionData;
  } catch {
    return { main: { tabs: [], activePath: null }, side: { tabs: [], activePath: null, visible: false } };
  }
}

export function saveLastFile(path: string | null): void {
  try {
    if (path) localStorage.setItem(LASTFILE_KEY + scope, path);
    else localStorage.removeItem(LASTFILE_KEY + scope);
  } catch { /* acceptable */ }
}

export function loadLastFile(): string | null {
  return localStorage.getItem(LASTFILE_KEY + scope);
}

// Guest folders (browsed alongside the project, not part of it) — scoped per project
// so they persist across reloads and never telescope into another project's window.
export function saveGuests(paths: string[]): void {
  try {
    localStorage.setItem(GUESTS_KEY + scope, JSON.stringify(paths));
  } catch { /* acceptable */ }
}

export function loadGuests(): string[] {
  try {
    const raw = localStorage.getItem(GUESTS_KEY + scope);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveDraft(path: string, content: string): void {
  try {
    localStorage.setItem(draftKey(path), content);
  } catch { /* storage plein — on perd ce brouillon, acceptable */ }
}

export function loadDraft(path: string): string | null {
  return localStorage.getItem(draftKey(path));
}

export function clearDraft(path: string): void {
  localStorage.removeItem(draftKey(path));
}

// Purge unique par session : nettoie les brouillons VIDE laissés par le bug
// « fichier .md affiché vide » (un buffer "" écrit par le sync value de
// l'éditeur pendant la fenêtre source:"" d'open(), puis parké). Un draft vide
// n'est jamais restauré (ContentStore.load le traite comme absent) — il ne
// sert qu'à polluer le localStorage et à tromper le diagnostic.
let _draftsPurged = false;
function purgeEmptyDrafts(): void {
  try {
    const prefix = DRAFT_PREFIX + scope + "::";
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix) && localStorage.getItem(key) === "") {
        localStorage.removeItem(key);
      }
    }
  } catch { /* non-fatal */ }
}
