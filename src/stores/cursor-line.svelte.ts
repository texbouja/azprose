/** Current editor cursor line (0-based) — written by Editor, read by app.svelte at save time. */

let _line = $state<number | null>(null);

export function setCursorLine(line: number | null): void {
  _line = line;
}

export function getCursorLine(): number | null {
  return _line;
}

/** Reactive getter for use in $effect(). */
export function cursorLine(): number | null {
  return _line;
}
