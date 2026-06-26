// Session persistence — modèle VSCode hot-exit :
// • session (liste des onglets) : localStorage, écrite sur chaque action utilisateur
// • brouillons (contenu dirty) : localStorage, écrits sur blur/visibilitychange/fermeture
// Tout est synchrone → zéro overhead pendant la frappe.

const SESSION_KEY = "azp:session";
const DRAFT_PREFIX = "azp:draft:";

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
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch { /* storage full — acceptable */ }
}

export function loadSession(): SessionData {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { tabs: [], activePath: null };
    return JSON.parse(raw) as SessionData;
  } catch {
    return { tabs: [], activePath: null };
  }
}

export function saveDraft(path: string, content: string): void {
  try {
    localStorage.setItem(DRAFT_PREFIX + path, content);
  } catch { /* storage plein — on perd ce brouillon, acceptable */ }
}

export function loadDraft(path: string): string | null {
  return localStorage.getItem(DRAFT_PREFIX + path);
}

export function clearDraft(path: string): void {
  localStorage.removeItem(DRAFT_PREFIX + path);
}
