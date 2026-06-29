// Line number (0-based, matching data-sline) preserved when switching between
// editor and preview modes. The component that unmounts writes here; the one
// that mounts reads and consumes it. Plain object — no Svelte reactivity needed.
export const syncLine: { current: number | null } = { current: null };
