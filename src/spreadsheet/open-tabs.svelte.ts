// ── Reactive store of currently-open spreadsheet IDs (both panels) ──────────
//
// app.svelte updates this set whenever tabs change.
// SpreadsheetManager consumes it to show which sheets are open in any tab.

let ids = $state<string[]>([]);

export function getOpenSheetIds(): string[] {
  return ids;
}

export function setOpenSheetIds(next: string[]): void {
  ids = next;
}
