import { invoke } from "@tauri-apps/api/core";
import { joinPath } from "./files";
import type { PreviewStyle, PrintStyle, PresentationStyle } from "@/stores/markdown-settings.svelte";
import type { SlideMode } from "@/stores/slide-settings.svelte";
import type { TypographySettings } from "./typography";
import type { CalloutDef } from "@/stores/callout-settings.svelte";
import type { LatexSettings } from "@/stores/latex-settings.svelte";
import type { EditorFontFamily } from "@/stores/editor-settings.svelte";
import type { CollesSettings } from "@/stores/colles-settings.svelte";

// ── Nested config sections (mirror Settings Overlay hierarchy) ──────────────

export interface ApplicationConfig {
  vim?: boolean | null;
  typography?: TypographySettings | null;
  uiFontFamily?: string | null;
  uiMonoFamily?: string | null;
}

export interface EditorConfig {
  fontFamily?: EditorFontFamily | null;
  customFontName?: string | null;
  fontSize?: number | null;
  tabSize?: number | null;
  lineNumbers?: boolean | null;
  lineWrapping?: boolean | null;
}

export interface PreviewConfig {
  style?: PreviewStyle | null;
}

export interface PrintConfig {
  style?: PrintStyle | null;
}

export interface PresentationConfig {
  style?: PresentationStyle | null;
  slideMode?: SlideMode | null;
}

export interface MathConfig {
  preamble?: string | null;
  packages?: string[] | null;
  /** Police mathématique : `newcm` (défaut) ou `fira`. Le moteur la lit à son
   *  chargement — un changement ne prend effet qu'au redémarrage. */
  font?: string | null;
  /** Espace vertical autour des formules hors texte : `small`, `medium` ou
   *  `large` (défaut). Effet immédiat — c'est du CSS. */
  spacing?: string | null;
}

export interface ProjectConfig {
  application?: ApplicationConfig;
  editor?: EditorConfig;
  preview?: PreviewConfig;
  print?: PrintConfig;
  presentation?: PresentationConfig;
  math?: MathConfig;
  callouts?: CalloutDef[] | null;
  /** Identifiants des programmes officiels concernant ce projet ; l'ORDRE
   *  compte, la première entrée est le défaut (rectificatif §4.4). */
  programmes?: string[] | null;
  favorites?: string[] | null;
  latex?: LatexSettings | null;
  colles?: CollesSettings | null;
}

// ── Schema — validates nested sections ──────────────────────────────────────

const SECTION_SCHEMAS: Record<string, Record<string, string>> = {
  // `defaultMode` et la section `proseMark` sont des RESTES du mode WYSIWYM
  // (retiré le 2026-08-19) : ils restent tolérés pour qu'un fichier de projet
  // écrit avant ne déclenche pas d'avertissement à l'ouverture. Leur contenu
  // est simplement ignoré.
  application: { defaultMode: "string", vim: "boolean", typography: "object", uiFontFamily: "string", uiMonoFamily: "string" },
  editor: { fontFamily: "string", customFontName: "string", fontSize: "number", tabSize: "number", lineNumbers: "boolean", lineWrapping: "boolean" },
  proseMark: { style: "object" },  // toléré, ignoré (voir plus haut)
  preview: { style: "object" },
  print: { style: "object" },
  presentation: { style: "object", slideMode: "string" },
  // ⚠️ Une clé absente de ce schéma fait rejeter la SECTION ENTIÈRE
  // (`config.invalidSection:math`) : ajouter un réglage au store sans l'ajouter
  // ici ferait perdre en silence le préambule et les paquets du projet.
  math: { preamble: "string", packages: "object", font: "string", spacing: "string" },
  colles: { dateDebut: "string", dateFin: "string", vacances: "object", rubriques: "object", colloscope: "object", layout: "object" },
};

const CONFIG_SCHEMA: Record<string, string> = {
  application: "object",
  editor: "object",
  proseMark: "object",
  preview: "object",
  print: "object",
  presentation: "object",
  math: "object",
  callouts: "object",
  programmes: "object",
  favorites: "object",
  latex: "object",
  colles: "object",
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

/**
 * Section `math` du fichier de projet — TOUJOURS COMPLÈTE.
 *
 * Aucune clé n'est omise, pas même à sa valeur par défaut ou vide. La règle
 * inverse (« n'écrire que ce qui diffère du défaut ») rend le retour au défaut
 * IMPOSSIBLE : le fichier conserve l'ancienne valeur et `loadConfig` la
 * réimpose à chaque ouverture du projet. Constaté le 2026-08-19 — après un
 * passage à Fira Math, revenir à New Computer Modern ne tenait ni au
 * redémarrage ni au relancement complet.
 */
export function sectionMath(
  preamble: string,
  packages: string[],
  font: string,
  spacing: string,
): MathConfig {
  return { preamble, packages, font, spacing };
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
