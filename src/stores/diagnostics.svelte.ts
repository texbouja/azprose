// Workspace-level diagnostics bus — the "Problems" feed behind the Diagnostics
// console. Any subsystem (Typst compile, MathJax, image resolution, crashes…)
// publishes Diagnostics tagged with a `source`; the console shows the union with
// per-source badges. Replacing by source keeps each producer independent.

import { untrack } from "svelte";
import type { Diagnostic } from "@/lib/diagnostics";

let items = $state<Diagnostic[]>([]);

// NB: mutations read the current `items` to compute the next value. When a method
// is called synchronously from inside an $effect, an untracked read is required —
// otherwise the effect would depend on `items`, and the write would re-trigger it
// forever (effect_update_depth_exceeded). `get all()` stays tracked so consumers
// (e.g. `consoleDiags = $derived(...)`) react to changes.

export const diagnosticsStore = {
  get all(): Diagnostic[] {
    return items;
  },

  /** Replace every diagnostic coming from `source` (e.g. a fresh render/compile). */
  set(source: string, list: Diagnostic[]): void {
    const tagged = list.map((d) => ({ ...d, source }));
    items = [...untrack(() => items).filter((d) => d.source !== source), ...tagged];
  },

  /** Prepend a single diagnostic (e.g. a crash). */
  push(d: Diagnostic): void {
    items = [d, ...untrack(() => items)];
  },

  /** Remove diagnostics from `source`, or all of them when omitted. */
  clear(source?: string): void {
    items = source ? untrack(() => items).filter((d) => d.source !== source) : [];
  },
};
