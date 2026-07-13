/**
 * Shared vault file index — maps basenames (sans ext) to full paths.
 * Used by wikilinks and transclusion for name→path resolution.
 */

import { walkSupportedTextFiles } from "./files";

let _cache: { rootPath: string; index: Map<string, string>; ts: number } | null = null;
const TTL_MS = 30_000;

export async function getFileIndex(rootPath: string): Promise<Map<string, string>> {
  const now = Date.now();
  if (_cache && _cache.rootPath === rootPath && now - _cache.ts < TTL_MS) {
    return _cache.index;
  }
  const files = await walkSupportedTextFiles(rootPath);
  const index = new Map<string, string>();
  for (const f of files) {
    const dot = f.name.lastIndexOf(".");
    const base = dot > 0 ? f.name.slice(0, dot) : f.name;
    if (!index.has(base)) index.set(base, f.path);
  }
  _cache = { rootPath, index, ts: now };
  return index;
}
