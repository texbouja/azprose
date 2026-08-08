// Harnais E2E : monte le VRAI LinksView dans un navigateur, Tauri mocké.
// Les modules Tauri appellent invoke() paresseusement (au call, pas à l'import),
// donc poser __TAURI_INTERNALS__ avant l'import suffit.

const FILES: Record<string, string> = {
  "/vault/index.md": [
    "# Titre principal",
    "",
    "## Section 1",
    "",
    "[[fiche]]",
    "",
    "### Sous-section 1a",
    "Texte.",
    "",
    "### Sous-section 1b",
    "Texte.",
    "",
    "## Section 2",
    "",
    "### Sous-section 2a",
    "",
    "## Section 3",
    "",
  ].join("\n"),
  "/vault/fiche.md": ["# Fiche transcluse", "", "## Sous-partie", "", "### Détail", ""].join("\n"),
};

interface InvokeArgs {
  path?: string;
  [k: string]: unknown;
}

(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args?: InvokeArgs) => {
    console.log("[mock invoke]", cmd, JSON.stringify(args ?? {}));
    if (cmd === "plugin:fs|read_text_file") {
      const p = args?.path ?? "";
      const c = FILES[p];
      if (c !== undefined) return new TextEncoder().encode(c); // plugin expects Uint8Array
      throw new Error(`[mock] no such file: ${p}`);
    }
    if (cmd === "plugin:fs|exists") {
      return args?.path != null && args.path in FILES;
    }
    if (cmd === "plugin:fs|read_dir") return [];
    if (cmd === "plugin:fs|read_file") {
      const p = args?.path ?? "";
      const c = FILES[p];
      if (c !== undefined) return new TextEncoder().encode(c).buffer;
      throw new Error(`[mock] no such file: ${p}`);
    }
    throw new Error(`[mock] unmocked invoke: ${cmd}`);
  },
  metadata: {},
  transformCallback: () => 0,
};

import { mount } from "svelte";
import LinksView from "@/components/links/LinksView.svelte";

const target = document.getElementById("app")!;

const app = mount(LinksView, {
  target,
  props: {
    filePath: "/vault/index.md",
    source: FILES["/vault/index.md"],
    rootPath: "/vault",
  },
});

(window as unknown as Record<string, unknown>).__tocApp = app;

// Export pour le driver CDP
export {};
