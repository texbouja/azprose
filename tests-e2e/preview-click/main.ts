import { mount } from "svelte";
import MarkdownPreview from "@/components/markdown/MarkdownPreview.svelte";
import { setRootPath } from "@/stores/root-path.svelte";
import { PanelState } from "@/lib/panel-store";

// ── Tauri internals mock (plugin-fs + plugin-opener) ───────────────────────

const FILES: Record<string, string> = {
  "/vault/index.md": [
    "# Titre",
    "",
    "Lien vers [[fiche]] et [[autre|Alias]].",
    "",
  ].join("\n"),
  "/vault/fiche.md": ["# Fiche", "", "Contenu.", ""].join("\n"),
  "/vault/autre.md": ["# Autre", "", "Contenu.", ""].join("\n"),
};

type InvokeArgs = Record<string, unknown>;

declare global {
  interface Window {
    __nav: { t: string; d: unknown }[];
    __tauriInvoke?: (cmd: string, args: InvokeArgs) => Promise<unknown>;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function readTextImpl(path: string): string {
  const c = FILES[path];
  if (c !== undefined) return c;
  throw new Error(`[mock] no such file: ${path}`);
}

(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args?: InvokeArgs) => {
    if (cmd === "plugin:fs|read_text_file") {
      const p = args?.path ?? "";
      return encoder.encode(readTextImpl(p)); // plugin expects Uint8Array
    }
    if (cmd === "plugin:fs|read_file") {
      const p = args?.path ?? "";
      return encoder.encode(readTextImpl(p)).buffer;
    }
    if (cmd === "plugin:fs|exists") {
      const p = args?.path ?? "";
      return p in FILES;
    }
    if (cmd === "plugin:fs|read_dir") {
      const p = args?.path ?? "";
      const prefix = p.endsWith("/") ? p : p + "/";
      const names = Object.keys(FILES)
        .filter((k) => k.startsWith(prefix) && k.slice(prefix.length).indexOf("/") === -1)
        .map((k) => k.slice(prefix.length));
      return names.map((n) => ({ name: n, isDirectory: false, isFile: true, isSymlink: false }));
    }
    if (cmd === "plugin:opener|open_url") return null;
    throw new Error(`[mock] unhandled invoke: ${cmd}`);
  },
};

// ── Enregistre les événements de navigation dispatchés par le clic ────────

window.__nav = [];
window.addEventListener("azprose:wikilink-navigate", (e) => {
  window.__nav.push({ t: "navigate", d: (e as CustomEvent).detail });
});
window.addEventListener("azprose:wikilink-open-new", (e) => {
  window.__nav.push({ t: "open-new", d: (e as CustomEvent).detail });
});

// ── Scénarios de réutilisation du tab preview (sémantique open) ────────────

declare global {
  interface Window {
    __scenario: {
      inPlace: { tabs: number; activePath: string };
      restorePattern: { tabs: number; activePath: string };
      multiRestore: { tabs: number; activePath: string };
    } | null;
  }
}

async function runScenarios(): Promise<void> {
  // Scénario A : clic Preview puis navigation wikilink (preview:true + fallback).
  const sideA = new PanelState("side");
  await sideA.open("/vault/index.md", { preview: true });
  await sideA.open("/vault/fiche.md", { preview: true, fallbackToActive: true });
  const inPlace = { tabs: sideA.tabs.length, activePath: sideA.activePath ?? "" };

  // Scénario B : tab side restauré de session (preview ABSENT) puis navigation
  // — le BUG d'origine : créait un nouvel onglet (tabs=2). Avec fallback, 1.
  const sideB = new PanelState("side");
  await sideB.open("/vault/index.md"); // session-restore pattern : pas de preview
  await sideB.open("/vault/fiche.md", { preview: true, fallbackToActive: true });
  const restorePattern = { tabs: sideB.tabs.length, activePath: sideB.activePath ?? "" };

  // Scénario C : restore multi-tabs puis navigation — la navigation re-pointe le
  // tab ACTIF (le dernier restauré), aucun onglet supplémentaire.
  const sideC = new PanelState("side");
  await sideC.open("/vault/index.md");
  await sideC.open("/vault/fiche.md");
  sideC.tabs = sideC.tabs.map(t => ({ ...t, preview: true })); // stamp restore
  sideC.activeTabId = sideC.tabs[1].id;
  await sideC.open("/vault/autre.md", { preview: true, fallbackToActive: true });
  const multiRestore = { tabs: sideC.tabs.length, activePath: sideC.activePath ?? "" };

  window.__scenario = { inPlace, restorePattern, multiRestore };
  console.log("[scenario]", JSON.stringify(window.__scenario));
}

runScenarios();

// ── Monte le VRAI MarkdownPreview ─────────────────────────────────────────

setRootPath("/vault");

mount(MarkdownPreview, {
  target: document.getElementById("app")!,
  props: {
    value: FILES["/vault/index.md"],
    filePath: "/vault/index.md",
  },
});
