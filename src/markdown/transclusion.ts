import { readFile } from "@tauri-apps/plugin-fs";
import { getFileIndex } from "@/lib/vault-index";

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/ /g, "-")
    .replace(/^-|-$/g, "");
}

function dirname(filePath: string): string {
  const last = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return last >= 0 ? filePath.slice(0, last) : ".";
}

function resolveRelative(baseDir: string, target: string, sep: string): string {
  const parts = (baseDir + sep + target).split(sep).filter(Boolean);
  const resolved: string[] = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") { resolved.pop(); continue; }
    resolved.push(p);
  }
  return resolved.join(sep);
}

function ensureMdExtension(target: string): string {
  return target.includes(".") ? target : `${target}.md`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, { encoding: "utf-8" as never });
    return true;
  } catch {
    return false;
  }
}

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
): Promise<string> {
  if (depth >= MAX_DEPTH) return src;

  const sep = filePath.includes("\\") ? "\\" : "/";
  const baseDir = dirname(filePath);

  // Check for cycles
  const resolved = new Set<string>();

  // Collect all transclusion matches
  const matches: Array<{ full: string; target: string }> = [];
  TRANSLUDE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TRANSLUDE_RE.exec(src)) !== null) {
    matches.push({ full: m[0], target: m[1].trim() });
  }
  if (matches.length === 0) return src;

  let result = src;
  for (const { full, target } of matches) {
    // Parse target: file#section or file#^block
    const hashIdx = target.indexOf("#");
    const fileName = hashIdx >= 0 ? target.slice(0, hashIdx) : target;
    const fragment = hashIdx >= 0 ? target.slice(hashIdx + 1) : null;

    if (!fileName) continue;

    // Resolve absolute path — first try relative to current file
    let absTarget = resolveRelative(baseDir, ensureMdExtension(fileName), sep);
    if (!(await fileExists(absTarget)) && rootPath) {
      // Vault fallback: find file by basename
      const index = await getFileIndex(rootPath);
      const vaultPath = index.get(fileName) ?? index.get(ensureMdExtension(fileName));
      if (vaultPath) {
        absTarget = vaultPath;
      }
    }
    if (resolved.has(absTarget)) continue; // already included in this pass
    resolved.add(absTarget);

    // Cycle detection
    if (ancestors.has(absTarget)) {
      result = result.replace(full, `<span class="transclusion-placeholder">cycle: ${fileName}</span>`);
      continue;
    }

    try {
      const content = await readFile(absTarget, { encoding: "utf-8" as never });
      let included = typeof content === "string" ? content : new TextDecoder().decode(content as Uint8Array);

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
      included = await resolveTransclusions(included, absTarget, depth + 1, childAncestors, rootPath);

      // Track transclusion range (only at depth 0 = top-level)
      if (depth === 0 && ranges) {
        const matchIdx = result.indexOf(full);
        if (matchIdx >= 0) {
          const startLine = result.slice(0, matchIdx).split("\n").length - 1;
          const endLine = startLine + included.split("\n").length;
          ranges.push({ startLine, endLine, filePath: absTarget });
        }
      }

      result = result.replace(full, included);
    } catch {
      // File not found — leave a visible placeholder
      result = result.replace(full, `<!-- transclusion: ${fileName} not found -->`);
    }
  }

  return result;
}
