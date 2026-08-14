import { invoke } from "@tauri-apps/api/core";
import type { ThemeMode } from "./theme";

// Préférences d'INTERFACE du projet, mirroir portable de <project>/.azprose/ui.json
// (vague 4, phase 4.2). Distinct de project-config.ts (configuration DU DOCUMENT —
// LaTeX, styles d'impression, callouts) et de project-session.ts (travail de
// l'utilisateur — onglets ouverts) : une préférence de présentation n'a ni la
// même nature ni la même durée de vie (R6). Contenu initial : le thème seul —
// pas de schéma extensible spéculatif, une clé de plus le jour où elle existe.
export interface ProjectUi {
  theme?: ThemeMode | null;
}

export async function loadProjectUi(root: string): Promise<ProjectUi | null> {
  try {
    const raw = await invoke<string | null>("read_project_ui", { root });
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== "object") return null;
    return { theme: (data.theme as ThemeMode | undefined) ?? null };
  } catch {
    return null;
  }
}

export async function saveProjectUi(root: string, data: ProjectUi): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.theme != null) payload.theme = data.theme;
  await invoke("write_project_ui", {
    root,
    content: JSON.stringify(payload, null, 2) + "\n",
  });
}
