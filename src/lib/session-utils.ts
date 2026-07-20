import type { PanelManager } from "@/lib/panel-manager"
import { saveSession } from "@/lib/session"
import { saveProjectSession, type PortableSession } from "@/lib/project-session"
import { loadLastFile } from "@/lib/session"

export interface SessionDeps {
  pm: PanelManager
  projectRoot: string | null
  onSessionChange?: () => void
}

let sessionMirrorTimer: ReturnType<typeof setTimeout> | null = null

export function findTabByPath(pm: PanelManager, path: string) {
  const norm = (p: string) => p.split("/").filter(s => s !== ".").join("/");
  const target = norm(path);
  return pm.main.tabs.find((t: { path: string }) => norm(t.path) === target);
}

export function saveSessionNow(deps: SessionDeps) {
  const { pm } = deps
  const data = pm.toJSON();
  saveSession({
    main: data.main,
    side: { ...data.side, visible: pm.sideVisible },
  });
  scheduleSessionMirror(deps);
}

export function buildPortableSession(pm: PanelManager): PortableSession {
  const data = pm.toJSON();
  return {
    main: data.main,
    side: { ...data.side, visible: pm.sideVisible },
    lastFile: data.main.activePath ?? loadLastFile(),
  };
}

export async function doSessionMirror(deps: SessionDeps) {
  if (!deps.projectRoot) return;
  try {
    await saveProjectSession(deps.projectRoot, buildPortableSession(deps.pm));
  } catch {
    // Portable copy is best-effort; the scoped localStorage already holds the session.
  }
}

export function scheduleSessionMirror(deps: SessionDeps) {
  if (!deps.projectRoot) return;
  if (sessionMirrorTimer) clearTimeout(sessionMirrorTimer);
  sessionMirrorTimer = setTimeout(() => { void doSessionMirror(deps); }, 400);
}

export function flushSessionMirror(deps: SessionDeps) {
  if (sessionMirrorTimer) {
    clearTimeout(sessionMirrorTimer);
    sessionMirrorTimer = null;
  }
  void doSessionMirror(deps);
}

export function saveAllDirtyDrafts(pm: PanelManager) {
  pm.saveAllDrafts();
}
