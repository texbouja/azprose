import { getCurrentWindow } from "@tauri-apps/api/window";

const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, [role='button'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [contenteditable='true'], .mdv-titlebar__theme, .mdv-tooltip";

export function startWindowDrag(e: MouseEvent): void {
  // Only primary (left) button
  if (e.button !== 0) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest(INTERACTIVE_SELECTOR)) return;
  // Fire-and-forget — don't await, mousedown shouldn't be async-blocked.
  void getCurrentWindow()
    .startDragging()
    .catch((err) => {
      console.warn("azprose: startDragging failed", err);
    });
}
