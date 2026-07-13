import { invoke } from "@tauri-apps/api/core";
import { joinPath } from "./files";
import type { ProseStyle } from "@/stores/prose-settings.svelte";
import type { SlideMode } from "@/components/markdown/slide-settings.svelte";
import type { DefaultEditorMode } from "@/stores/general-settings.svelte";
import type { WritingFontSize, WritingLineHeight } from "./writing-display";
import type { TypographySettings } from "./typography";
import type { ThemeMode } from "./theme";

export interface ProjectConfig {
  proseStyle?: ProseStyle | null;
  slideMode?: SlideMode | null;
  defaultEditorMode?: DefaultEditorMode | null;
  // Deprecated (superseded by `typography`) — kept so old configs don't warn.
  writingFontSize?: WritingFontSize | null;
  writingLineHeight?: WritingLineHeight | null;
  typography?: TypographySettings | null;
  mathJaxPreamble?: string | null;
  mathJaxPackages?: string[] | null;
  vim?: boolean | null;
  themeMode?: ThemeMode | null;
}

const CONFIG_SCHEMA: Record<string, string> = {
  proseStyle: "string",
  slideMode: "string",
  defaultEditorMode: "string",
  writingFontSize: "string",
  writingLineHeight: "string",
  typography: "object",
  mathJaxPreamble: "string",
  mathJaxPackages: "object",
  vim: "boolean",
  themeMode: "string",
};

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
    if (v != null) cleaned[k] = v;
  }
  await invoke("write_project_config", { root, content: JSON.stringify(cleaned, null, 2) + "\n" });
}
