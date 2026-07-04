<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import "@xterm/xterm/css/xterm.css";
  import { readXtermTheme } from "@/lib/terminal-theme";

  let {
    id = "main",
    cwd = null as string | null,
    active = true,
  }: {
    id?: string;
    cwd?: string | null;
    active?: boolean;
  } = $props();

  let hostEl: HTMLDivElement;
  let term: Terminal | null = null;
  let fit: FitAddon | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let themeObserver: MutationObserver | null = null;
  let unlistenOutput: UnlistenFn | null = null;
  let unlistenExit: UnlistenFn | null = null;
  let exited = $state(false);

  function doFit() {
    if (!fit || !term) return;
    try {
      fit.fit();
      void invoke("terminal_resize", { id, rows: term.rows, cols: term.cols });
    } catch {
      /* container not measurable yet */
    }
  }

  function applyTheme() {
    if (!term) return;
    term.options.theme = readXtermTheme();
  }

  // Refit when the tab becomes visible again (container had 0 size while hidden).
  $effect(() => {
    if (active && term) requestAnimationFrame(doFit);
  });

  onMount(() => {
    const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";
    term = new Terminal({
      fontFamily: mono,
      fontSize: 13,
      cursorBlink: true,
      theme: readXtermTheme(),
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostEl);
    doFit();

    // Follow theme changes (hover preview + click commit).
    themeObserver = new MutationObserver(() => applyTheme());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    term.onData((data) => {
      if (!exited) void invoke("terminal_write", { id, data });
    });

    void (async () => {
      unlistenOutput = await listen<{ id: string; data: string }>("terminal://output", (e) => {
        if (e.payload.id === id) term?.write(e.payload.data);
      });
      unlistenExit = await listen<string>("terminal://exit", (e) => {
        if (e.payload === id) {
          exited = true;
          term?.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n");
        }
      });

      try {
        await invoke("terminal_spawn", {
          id,
          cwd,
          rows: term?.rows ?? 24,
          cols: term?.cols ?? 80,
        });
        term?.focus();
      } catch (err) {
        term?.write(`\x1b[31m${err}\x1b[0m\r\n`);
      }
    })();

    resizeObserver = new ResizeObserver(() => doFit());
    resizeObserver.observe(hostEl);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    themeObserver?.disconnect();
    unlistenOutput?.();
    unlistenExit?.();
    void invoke("terminal_kill", { id });
    term?.dispose();
  });
</script>

<div class="terminal" bind:this={hostEl}></div>

<style>
  .terminal {
    width: 100%;
    height: 100%;
    padding: 4px 6px;
    box-sizing: border-box;
    background: var(--surface, #1e1e1e);
    overflow: hidden;
  }

  /* xterm internals fill the host */
  .terminal :global(.xterm) {
    height: 100%;
  }

  .terminal :global(.xterm-viewport) {
    overflow-y: auto;
  }
</style>
