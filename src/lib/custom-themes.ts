import { invoke } from "@tauri-apps/api/core";

export interface CustomThemeEntry {
  name: string;
  css: string;
}

let loaded = false;

export async function listCustomThemes(): Promise<CustomThemeEntry[]> {
  return invoke<CustomThemeEntry[]>("list_custom_themes");
}

export async function installCustomTheme(name: string, css: string): Promise<void> {
  await invoke("install_custom_theme", { name, css });
  loaded = false;
}

export async function deleteCustomTheme(name: string): Promise<void> {
  await invoke("remove_custom_theme", { name });
  loaded = false;
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

export async function ensureCustomThemesLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const themes = await listCustomThemes();
  for (const t of themes) {
    injectThemeCSS(t.name, t.css);
  }
}
