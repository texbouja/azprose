/** Pending editor→preview sync line — set at save time, consumed once by MarkdownPreview after render. */

let _line: number | null = $state(null);

export function setSyncLine(line: number | null): void {
  _line = line;
}

export function consumeSyncLine(): number | null {
  const l = _line;
  _line = null;
  return l;
}
