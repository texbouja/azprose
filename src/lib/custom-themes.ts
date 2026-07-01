import { invoke } from "@tauri-apps/api/core";

export interface CustomThemeEntry {
  name: string;
  css: string;
}

// Crafted themes are per-project (Étape 4): stored in <project>/.azprose/themes/.
// All ops take the project root; without a project there are no crafted themes.

export async function listCustomThemes(root: string | null): Promise<CustomThemeEntry[]> {
  if (!root) return [];
  try {
    return await invoke<CustomThemeEntry[]>("list_project_themes", { root });
  } catch {
    return [];
  }
}

export async function installCustomTheme(root: string, name: string, css: string): Promise<void> {
  await invoke("install_project_theme", { root, name, css });
}

export async function deleteCustomTheme(root: string, name: string): Promise<void> {
  await invoke("remove_project_theme", { root, name });
}

export function injectThemeCSS(name: string, css: string): void {
  const id = `azp-custom-theme-${name}`;
  const existing = document.getElementById(id);
  if (existing) existing.textContent = css;
  else {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }
}

export function removeThemeCSS(name: string): void {
  const el = document.getElementById(`azp-custom-theme-${name}`);
  el?.remove();
}

/**
 * Inject every crafted theme of a project. Call before applying a crafted `data-theme`
 * (parity with builtins: their CSS must exist first, else it falls back to `:root`).
 */
export async function loadProjectThemes(root: string | null): Promise<void> {
  const themes = await listCustomThemes(root);
  for (const t of themes) injectThemeCSS(t.name, t.css);
}
