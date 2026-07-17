import { persistedState } from "./persisted.svelte";
import { STORAGE_KEYS } from "@/lib";

export type CalloutNumbering = "theorems" | "exercises" | "none";
export type CalloutColor =
  | "info" | "tip" | "success" | "warning"
  | "danger" | "bug" | "example" | "quote" | "todo";

export interface CalloutDef {
  name: string;
  label: string;
  numbering: CalloutNumbering;
  color: CalloutColor;
  builtin: boolean;
}

export const CALLOUT_COLORS: { id: CalloutColor; hex: string }[] = [
  { id: "info",    hex: "#6b9eeb" },
  { id: "tip",     hex: "#72b886" },
  { id: "success", hex: "#72b886" },
  { id: "warning", hex: "#e6a94c" },
  { id: "danger",  hex: "#e06464" },
  { id: "bug",     hex: "#e06464" },
  { id: "example", hex: "#b496e6" },
  { id: "quote",   hex: "var(--muted)" },
  { id: "todo",    hex: "#e6a94c" },
];

const CALLOUT_COLOR_HEX: Record<CalloutColor, string> = Object.fromEntries(
  CALLOUT_COLORS.map(c => [c.id, c.hex]),
) as Record<CalloutColor, string>;

const BUILTIN_CALLOUTS: CalloutDef[] = [
  { name: "theorem",     label: "Théorème",    numbering: "theorems",  color: "warning", builtin: true },
  { name: "proposition", label: "Proposition", numbering: "theorems",  color: "warning", builtin: true },
  { name: "definition",  label: "Définition",  numbering: "theorems",  color: "info",    builtin: true },
  { name: "remark",      label: "Remarque",    numbering: "theorems",  color: "tip",     builtin: true },
  { name: "example",     label: "Exemple",     numbering: "theorems",  color: "example", builtin: true },
  { name: "exercise",    label: "Exercice",    numbering: "exercises", color: "danger",  builtin: true },
];

function createCalloutSettings() {
  const stored = persistedState<CalloutDef[]>(STORAGE_KEYS.callouts, BUILTIN_CALLOUTS);

  // Ensure built-in callouts are always present (in case of version bumps)
  const merged = $derived.by(() => {
    const user = stored.current.filter(c => !c.builtin);
    const builtins = BUILTIN_CALLOUTS.map(b => {
      const saved = stored.current.find(c => c.builtin && c.name === b.name);
      return saved ? { ...b, label: saved.label, numbering: saved.numbering, color: saved.color } : b;
    });
    return [...builtins, ...user];
  });

  return {
    get current() { return merged; },
    updateBuiltin(name: string, patch: Partial<Pick<CalloutDef, "label" | "numbering" | "color">>) {
      stored.current = stored.current.map(c =>
        c.name === name ? { ...c, ...patch } : c
      );
    },
    addUser(def: Omit<CalloutDef, "builtin">) {
      if (stored.current.some(c => c.name === def.name)) return;
      stored.current = [...stored.current, { ...def, builtin: false }];
    },
    updateUser(name: string, patch: Partial<Pick<CalloutDef, "label" | "numbering" | "color">>) {
      stored.current = stored.current.map(c =>
        c.name === name && !c.builtin ? { ...c, ...patch } : c
      );
    },
    removeUser(name: string) {
      stored.current = stored.current.filter(c => c.builtin || c.name !== name);
    },
    reset() { stored.current = [...BUILTIN_CALLOUTS]; },
    load(defs: CalloutDef[]) { stored.current = defs; },
  };
}

export const calloutSettings = createCalloutSettings();

/** Generate CSS rules for custom callout types — border color, counters, diamonds. */
export function generateCalloutCss(defs: CalloutDef[]): string {
  const sel = (s: string) => `.mdv-prose ${s}, .azp-slide__content ${s}`;
  const rules: string[] = [];

  for (const def of defs) {
    const s = `.callout[data-callout="${def.name}"]`;
    const hex = CALLOUT_COLOR_HEX[def.color];

    rules.push(`${sel(s)} { border-left: 3px solid ${hex}; }`);

    if (def.numbering !== "none") {
      rules.push(`${sel(s)} { counter-increment: callout-${def.numbering}; }`);
      rules.push(`${sel(`${s} .callout-type-label::after`)} { content: " " counter(callout-${def.numbering}); }`);
    }

    rules.push(`${sel(`${s} .callout-diamond`)} { color: ${hex}; }`);
  }

  return rules.join("\n");
}
