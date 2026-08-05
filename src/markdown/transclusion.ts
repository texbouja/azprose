import { readFile, exists } from "@tauri-apps/plugin-fs";
import { getFileIndex } from "@/lib/vault-index";
import { slugify } from "./slugify";

/**
 * Pre-processes ![[file]] transclusion syntax before markdown-it rendering.
 * Resolves included files from the filesystem and inlines their content.
 *
 * Supports:
 *   ![[file]]           — full file inclusion
 *   ![[file#heading]]   — section up to next same-level heading
 *   ![[file#^block]]    — block reference (until next heading or EOF)
 *
 * Cycle detection prevents infinite recursion. Depth cap at 10.
 */

/** Maps a line range in the combined source to the original transcluded file. */
export interface TransclusionRange {
  startLine: number;  // 0-based line in combined source (inclusive)
  endLine: number;    // 0-based line in combined source (exclusive)
  filePath: string;   // absolute path of the transcluded file
}

const TRANSLUDE_RE = /^[ \t]*!\[\[([^\[\]]+?)\]\]/gm;
const MAX_DEPTH = 10;

function dirname(filePath: string): string {
  const last = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return last >= 0 ? filePath.slice(0, last) : ".";
}

function resolveRelative(baseDir: string, target: string, sep: string): string {
  const isAbs = baseDir.startsWith(sep);
  const parts = (baseDir + sep + target).split(sep).filter(s => s !== "");
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") { resolved.pop(); continue; }
    resolved.push(p);
  }
  return (isAbs ? sep : "") + resolved.join(sep);
}

function ensureMdExtension(target: string): string {
  return target.includes(".") ? target : `${target}.md`;
}

async function fileExists(fs: TransclusionFs, path: string): Promise<boolean> {
  try {
    return await fs.exists(path);
  } catch {
    return false;
  }
}

/**
 * Surface fs minimale injectable — les tests bun n'ont pas Tauri : ils passent
 * un faux fs (Map en mémoire) au lieu de `mock.module` (process-global dans
 * bun < 1.4, il empoisonne les autres fichiers de test qui importent
 * `@tauri-apps/plugin-fs`).
 */
export interface TransclusionFs {
  /** Lit un fichier texte (UTF-8). Doit rejeter si le fichier n'existe pas. */
  readText(path: string): Promise<string>;
  /** True si le fichier existe. */
  exists(path: string): Promise<boolean>;
}

/** Implémentation réelle par défaut (plugin Tauri). */
export const tauriTransclusionFs: TransclusionFs = {
  async readText(path) {
    const content = await readFile(path, { encoding: "utf-8" as never });
    return typeof content === "string" ? content : new TextDecoder().decode(content as Uint8Array);
  },
  exists,
};

function extractSection(content: string, heading: string): string {
  const slug = slugify(heading);
  const lines = content.split("\n");

  // Find the heading line
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (m && slugify(m[2]) === slug) {
      start = i;
      level = m[1].length;
      break;
    }
  }
  if (start < 0) return `<!-- transclusion: heading "${heading}" not found -->`;

  // Find end: next heading at same or higher level
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= level) {
      return lines.slice(start, i).join("\n");
    }
  }
  return lines.slice(start).join("\n");
}

function extractBlock(content: string, blockId: string): string {
  const lines = content.split("\n");
  const anchor = `^${blockId}`;

  // Find the block marker
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(anchor)) {
      // Return from this line (minus the anchor) until next heading or EOF
      const text = lines[i].replace(new RegExp(`\\s*\\S*${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "").trimEnd();
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{1,6}\s+/.test(lines[j])) {
          return text + "\n" + lines.slice(i + 1, j).join("\n");
        }
      }
      return text + "\n" + lines.slice(i + 1).join("\n");
    }
  }
  return `<!-- transclusion: block ^${blockId} not found -->`;
}

export async function resolveTransclusions(
  src: string,
  filePath: string,
  depth: number = 0,
  ancestors: Set<string> = new Set(),
  rootPath?: string,
  ranges?: TransclusionRange[],
  fs: TransclusionFs = tauriTransclusionFs,
  getIndex: (rootPath: string) => Promise<Map<string, string>> = getFileIndex,
): Promise<string> {
  if (depth >= MAX_DEPTH) return src;

  const sep = filePath.includes("\\") ? "\\" : "/";
  const baseDir = dirname(filePath);

  // Collect all transclusion matches WITH their exact position in `src`.
  // Le remplacement est POSITIONNEL (jamais `String.replace(pattern, …)`) :
  // `replace` sur une chaîne touche la PREMIÈRE occurrence, ce qui cassait les
  // documents transcluant le MÊME fichier plusieurs fois (sections différentes
  // ou non) — seule la première était incluse, les suivantes restaient
  // verbatim dans le HTML. L'ancien dedup `resolved` (par absTarget) est
  // SUPPRIMÉ : la prévention des cycles est assurée par `ancestors` + MAX_DEPTH.
  const matches: Array<{ full: string; target: string; index: number }> = [];
  TRANSLUDE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TRANSLUDE_RE.exec(src)) !== null) {
    matches.push({ full: m[0], target: m[1].trim(), index: m.index });
  }
  if (matches.length === 0) return src;

  let result = "";
  let cursor = 0;
  for (const { full, target, index } of matches) {
    result += src.slice(cursor, index);
    cursor = index + full.length;

    // Parse target: file#section or file#^block
    const hashIdx = target.indexOf("#");
    const fileName = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
    const fragment = hashIdx >= 0 ? target.slice(hashIdx + 1) : null;

    if (!fileName || fileName.toLowerCase().endsWith(".pdf")) {
      result += full; // PDF géré par pdf-rect-embed — laissé tel quel
      continue;
    }

    // Resolve absolute path — first try relative to current file
    let absTarget = resolveRelative(baseDir, ensureMdExtension(fileName), sep);
    if (!(await fileExists(fs, absTarget)) && rootPath) {
      // Vault fallback: find file by basename
      const index = await getIndex(rootPath);
      // Index keys are basenames without extension ("reduc2"), strip ext for lookup
      const baseName = fileName.replace(/\.[^.]+$/, "");
      const vaultPath = index.get(baseName) ?? index.get(fileName) ?? index.get(ensureMdExtension(fileName));
      if (vaultPath) {
        absTarget = vaultPath;
      }
    }

    // Cycle detection
    if (ancestors.has(absTarget)) {
      result += `<span class="transclusion-placeholder">cycle: ${fileName}</span>`;
      continue;
    }

    try {
      let included = await fs.readText(absTarget);

      // Extract section if fragment specified
      if (fragment) {
        if (fragment.startsWith("^")) {
          included = extractBlock(included, fragment.slice(1));
        } else {
          included = extractSection(included, fragment);
        }
      }

      // Recurse into nested transclusions
      const childAncestors = new Set(ancestors);
      childAncestors.add(absTarget);
      included = await resolveTransclusions(included, absTarget, depth + 1, childAncestors, rootPath, undefined, fs, getIndex);

      // Track transclusion range (only at depth 0 = top-level) — la position
      // du marqueur est `result.length` AVANT d'ajouter le contenu.
      if (depth === 0 && ranges) {
        const startLine = result.split("\n").length - 1;
        const endLine = startLine + included.split("\n").length;
        ranges.push({ startLine, endLine, filePath: absTarget });
      }

      result += included;
    } catch {
      // File not found — leave a visible placeholder
      result += `<!-- transclusion: ${fileName} not found -->`;
    }
  }
  result += src.slice(cursor);

  return result;
}
