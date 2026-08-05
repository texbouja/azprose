/**
 * Pending preview sync line — set when a TOC/backlinks/tags jump targets a file,
 * consumed once by MarkdownPreview after the next render.
 *
 * Conventions: the line is 0-BASED (matches `data-sline` stamped by the
 * `source_lines` core rule). The pending line is bound to a file path so a
 * render of an UNRELATED file never consumes it (a stale line must not scroll
 * the wrong document). A null/empty path matches any file (legacy callers).
 */

let _pending: { line: number; path: string | null } | null = $state(null);

function norm(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter((s) => s !== ".").join("/");
}

export function setSyncLine(line: number | null, path?: string | null): void {
  _pending = line == null ? null : { line, path: path ?? null };
}

/** Returns the pending line only when it belongs to `filePath` (or was set pathless). */
export function consumeSyncLine(filePath?: string | null): number | null {
  if (!_pending) return null;
  if (_pending.path != null && filePath != null && norm(_pending.path) !== norm(filePath)) {
    return null;
  }
  const l = _pending.line;
  _pending = null;
  return l;
}
