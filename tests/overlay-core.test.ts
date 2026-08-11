/**
 * Test de RÉGRESSION du noyau overlay d'impression (printing.md §2.1) —
 * compile `overlay.svelte.ts` avec le compilateur Svelte et l'exécute sous
 * le runtime client réel (sans DOM) pour vérifier la mécanique
 * open→loading→loaded→ready et la réactivité de l'état exposé.
 *
 * Couvre le bug « overlay sans boutons aperçu/export » (les $state retournés
 * par la factory étaient des SNAPSHOTS du montage — le compilateur Svelte les
 * unwrap en `$.get(...)` dans l'objet retourné) : l'état exposé est un objet
 * à GETTERS et doit suivre la machine.
 *
 * Les variables open/source/filePath sont des PROXIES `$.proxy` (comme les
 * props destructurées d'un composant) : l'$effect du noyau peut les tracker.
 */
// @ts-nocheck
import { compileModule } from "svelte/compiler";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import * as $ from "svelte/internal/client";

const COMPILED = new URL("./.__overlay_compiled.mjs", import.meta.url).pathname;

function compileOverlayModule() {
  const source = readFileSync("src/printing/core/overlay.svelte.ts", "utf8");
  // Bun.Transpiler élimine les types (équivalent du transpileur TS de vite) ;
  // le parseur Svelte ne reçoit que du JS standard.
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const { js } = compileModule(code, {
    filename: "overlay.svelte.ts",
    dev: false,
  });
  writeFileSync(COMPILED, js.code);
}

const mkContract = (over = {}) => ({
  id: "test",
  titleKey: "print.title",
  features: { template: false, expandLinks: false },
  defaultRequest: { paper: "a4", margins: { top: 15, bottom: 15, left: 15, right: 15 } },
  loadRequest: async () => ({ paper: "a4", margins: { top: 15, bottom: 15, left: 15, right: 15 } }),
  saveRequest: async () => {},
  countFor: () => 1,
  canExport: (count) => count > 0,
  preview: async () => {},
  export: async () => ({ status: "exported", path: "/tmp/x.pdf" }),
  doneKey: "print.done",
  ...over,
});

/** Sources réactives : proxies $state comme des props de composant. */
function mkSources() {
  const state = $.proxy({ open: false, source: null, filePath: null });
  return {
    state,
    getters: {
      open: () => state.open,
      source: () => state.source,
      filePath: () => state.filePath,
    },
  };
}

const host = { t: (k) => k, notify: () => {}, onClose: () => {} };

function flushAll() {
  $.flush();
  return new Promise((r) => setTimeout(r, 0));
}

/** Évalue un $derived (lazy hors composant) en le connectant à un effet. */
function readDerived(getter) {
  let value;
  const cleanup = $.effect_root(() => {
    $.user_effect(() => {
      value = getter();
    });
  });
  $.flush();
  cleanup();
  return value;
}

compileOverlayModule();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mod: any = await import(COMPILED);

test("noyau overlay : open=true + source fixée → loading → ready (canExport)", async () => {
  const { state, getters } = mkSources();
  const contract = mkContract({});

  let core;
  const cleanup = $.effect_root(() => {
    core = mod.createPrintOverlayCore(contract, host, getters);
  });
  try {
    $.flush();
    expect(core.state.machine.current).toBe("idle");

    // Ouverture : open + source fixés AVANT le flush (même ordre qu'app.svelte).
    state.source = "# Note de test\nContenu";
    state.open = true;
    $.flush();
    expect(core.state.machine.current).toBe("loading");

    await flushAll(); // laisse la promesse loadRequest se résoudre
    $.flush();
    expect(core.state.machine.current).toBe("ready");
    // RÉGRESSION couverte : l'état exposé (getters) doit suivre la machine —
    // avant le fix, l'objet retourné de la factory figeait canExport/count
    // (snapshots du montage) → overlay sans boutons aperçu/export.
    expect(core.state.canExport).toBe(true);
    expect(core.state.count).toBe(1);
  } finally {
    cleanup();
  }
});

test("noyau overlay : open=true + source VIDE → error (repli défensif)", async () => {
  const { state, getters } = mkSources();
  const contract = mkContract({});

  let core;
  const cleanup = $.effect_root(() => {
    core = mod.createPrintOverlayCore(contract, host, getters);
  });
  try {
    state.source = null;
    state.open = true;
    $.flush();
    expect(core.state.machine.current).toBe("loading");
    await flushAll();
    $.flush();
    expect(core.state.machine.current).toBe("error");
  } finally {
    cleanup();
  }
});

test("noyau overlay : réouverture (close→open) recharge et repasse ready", async () => {
  const { state, getters } = mkSources();
  let loads = 0;
  const contract = mkContract({
    loadRequest: async () => {
      loads++;
      return { paper: "a4", margins: { top: 15, bottom: 15, left: 15, right: 15 } };
    },
  });

  let core;
  const cleanup = $.effect_root(() => {
    core = mod.createPrintOverlayCore(contract, host, getters);
  });
  try {
    state.source = "# Note";
    state.open = true;
    $.flush();
    await flushAll();
    $.flush();
    expect(core.state.machine.current).toBe("ready");

    state.open = false;
    $.flush();
    await flushAll();
    $.flush();
    expect(core.state.machine.current).toBe("ready"); // état résiduel (pas de reset à la fermeture)

    state.open = true;
    $.flush();
    await flushAll();
    $.flush();
    expect(loads).toBe(2);
    expect(core.state.machine.current).toBe("ready");
    expect(core.state.canExport).toBe(true);
  } finally {
    cleanup();
  }
});

test("noyau overlay : la SOURCE change pendant que open=true → rechargement ?", async () => {
  // Scénario mode planches : le dispatcher remonte le wrapper AVANT que la
  // source ne soit posée ? Vérifions si l'effet voit la source tardive.
  const { state, getters } = mkSources();
  let loads = 0;
  const contract = mkContract({
    loadRequest: async () => {
      loads++;
      return { paper: "a4", margins: { top: 15, bottom: 15, left: 15, right: 15 } };
    },
  });

  let core;
  const cleanup = $.effect_root(() => {
    core = mod.createPrintOverlayCore(contract, host, getters);
  });
  try {
    // Ordre INVERSE de app.svelte : open posé AVANT source (hypothèse
    // « le branchement échoue »).
    state.open = true;
    $.flush();
    expect(core.state.machine.current).toBe("loading");

    state.source = "# Note tardive";
    $.flush();
    await flushAll();
    $.flush();
    // L'effet ne tracke pas source → la machine reste en "loading" OU l'effet
    // rejoue ? (source non trackée → pas de rejeu → "loading" figé)
    console.log("   machine après source tardive:", core.state.machine.current, "loads:", loads);
    expect(core.state.machine.current).toBe("ready"); // ← si ça échoue, le bug est là
  } finally {
    cleanup();
  }
});

rmSync(COMPILED, { force: true });
