import { invoke } from "@tauri-apps/api/core";
import type { SessionTab } from "./session";

// Portable copy of the per-project session, mirrored to <project>/.azprose/session.json
// (Étape 2b). The scoped localStorage (src/lib/session.ts) stays the synchronous primary
// for anti-loss; this file is the best-effort portable copy so a project moved/copied to
// another path or machine restores its open tabs. Written atomically on the Rust side.
export interface PortableSession {
  main: { tabs: SessionTab[]; activePath: string | null };
  side: { tabs: SessionTab[]; activePath: string | null; visible: boolean };
  lastFile: string | null;
}

export async function loadProjectSession(root: string): Promise<PortableSession | null> {
  try {
    const raw = await invoke<string | null>("read_project_session", { root });
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data) return null;
    // Old format { tabs, activePath, lastFile } → migrate
    if (Array.isArray(data.tabs)) {
      return {
        main: { tabs: data.tabs, activePath: data.activePath ?? null },
        side: { tabs: [], activePath: null, visible: false },
        lastFile: data.lastFile ?? null,
      };
    }
    if (!data.main || !Array.isArray(data.main.tabs)) return null;
    return data as PortableSession;
  } catch {
    return null;
  }
}

export async function saveProjectSession(root: string, data: PortableSession): Promise<void> {
  const payload = {
    main: data.main,
    side: data.side,
    lastFile: data.lastFile,
  };
  await invoke("write_project_session", {
    root,
    content: JSON.stringify(payload, null, 2) + "\n",
  });
}
