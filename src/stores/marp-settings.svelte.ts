import { persistedState } from "./persisted.svelte";
import type { MarpTheme, MarpSize } from "@/lib/marp-render";

export interface MarpSettings {
  theme: MarpTheme;
  size:  MarpSize;
}

const DEFAULT: MarpSettings = { theme: "default", size: "16:9" };

export const marpSettings = persistedState<MarpSettings>("azp:marp:settings", DEFAULT);
