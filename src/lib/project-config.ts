import { invoke } from "@tauri-apps/api/core";
import { joinPath } from "./files";
import type { ProseMarkStyle, PreviewStyle, PresentationStyle } from "@/stores/markdown-settings.svelte";
import type { SlideMode } from "@/stores/slide-settings.svelte";
import type { DefaultEditorMode } from "@/stores/general-settings.svelte";
import type { TypographySettings } from "./typography";
import type { ThemeMode } from "./theme";
import type { CalloutDef } from "@/stores/callout-settings.svelte";
import type { LatexSettings } from "@/stores/latex-settings.svelte";
import type { TypstSettings } from "@/stores/typst-settings.svelte";

// ── Nested config sections (mirror Settings Overlay hierarchy) ──────────────

export interface EditorConfig {
  defaultMode?: DefaultEditorMode | null;
  vim?: boolean | null;
  theme?: ThemeMode | null;
  typography?: TypographySettings | null;
}

export interface ProseMarkConfig {
  style?: ProseMarkStyle | null;
}

export interface PreviewConfig {
  style?: PreviewStyle | null;
}

export interface PresentationConfig {
  style?: PresentationStyle | null;
  slideMode?: SlideMode | null;
}

export interface MathConfig {
  preamble?: string | null;
  packages?: string[] | null;
}

export interface ProjectConfig {
  editor?: EditorConfig;
  proseMark?: ProseMarkConfig;
  preview?: PreviewConfig;
  presentation?: PresentationConfig;
  math?: MathConfig;
  callouts?: CalloutDef[] | null;
  favorites?: string[] | null;
  latex?: LatexSettings | null;
  typst?: TypstSettings | null;
}

// ── Schema — validates nested sections ──────────────────────────────────────

const SECTION_SCHEMAS: Record<string, Record<string, string>> = {
  editor: { defaultMode: "string", vim: "boolean", theme: "string", typography: "object" },
  proseMark: { style: "object" },
  preview: { style: "object" },
  presentation: { style: "object", slideMode: "string" },
  math: { preamble: "string", packages: "object" },
};

const CONFIG_SCHEMA: Record<string, string> = {
  editor: "object",
  proseMark: "object",
  preview: "object",
  presentation: "object",
  math: "object",
  callouts: "object",
  favorites: "object",
  latex: "object",
  typst: "object",
};

function validateSection(obj: Record<string, unknown>, schema: Record<string, string>): boolean {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const expected = schema[k];
    if (!expected) return false;
    if (Array.isArray(v) ? expected !== "object" : typeof v !== expected) return false;
  }
  return true;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function configPath(root: string): string {
  return joinPath(root, ".azprose/config.json");
}

export type ConfigLoadResult = { config: ProjectConfig; warnings: string[] };

export async function loadProjectConfig(root: string): Promise<ConfigLoadResult> {
  const warnings: string[] = [];
  try {
    const raw = await invoke<string>("read_project_config", { root });
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      warnings.push("config.parseError");
      return { config: {}, warnings };
    }

    const cleaned: ProjectConfig = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v == null) continue;
      const expected = CONFIG_SCHEMA[k];
      if (!expected) {
        warnings.push(`config.unknownKey:${k}`);
        continue;
      }
      if (Array.isArray(v) ? expected !== "object" : typeof v !== expected) {
        warnings.push(`config.invalidType:${k}`);
        continue;
      }
      if (SECTION_SCHEMAS[k] && typeof v === "object" && v !== null && !Array.isArray(v)) {
        if (!validateSection(v as Record<string, unknown>, SECTION_SCHEMAS[k])) {
          warnings.push(`config.invalidSection:${k}`);
          continue;
        }
      }
      (cleaned as Record<string, unknown>)[k] = v;
    }
    return { config: cleaned, warnings };
  } catch {
    return { config: {}, warnings };
  }
}

export async function saveProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (v == null) continue;
    if (typeof v === "object" && !Array.isArray(v) && v !== null) {
      const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) => val != null);
      if (entries.length === 0) continue;
      cleaned[k] = Object.fromEntries(entries);
    } else {
      cleaned[k] = v;
    }
  }
  await invoke("write_project_config", { root, content: JSON.stringify(cleaned, null, 2) + "\n" });
}
