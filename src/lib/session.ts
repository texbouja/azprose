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

/** Set the project scope for all session keys. Call once at boot, before load*(). */
export function setSessionScope(root: string | null): void {
  scope = root ? "::" + root : "";
}

function draftKey(path: string): string {
  return DRAFT_PREFIX + scope + "::" + path;
}

export interface SessionTab {
  path: string;
  title: string;
}

export interface SessionData {
  tabs: SessionTab[];
  activePath: string | null;
}

export function saveSession(data: SessionData): void {
  try {
    localStorage.setItem(SESSION_KEY + scope, JSON.stringify(data));
  } catch { /* storage full — acceptable */ }
}

export function loadSession(): SessionData {
  try {
    const raw = localStorage.getItem(SESSION_KEY + scope);
    if (!raw) return { tabs: [], activePath: null };
    return JSON.parse(raw) as SessionData;
  } catch {
    return { tabs: [], activePath: null };
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
