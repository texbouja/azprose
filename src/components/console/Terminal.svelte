<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke, Channel } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { Terminal, FitAddon, init } from "ghostty-web";
  import { readXtermTheme } from "@/lib/terminal-theme";
  import { envTexmf } from "@/latex/texmf-trees";

  let {
    id = "main",
    cwd = null as string | null,
    active = true,
    env = null as Record<string, string> | null,
    onExit,
  }: {
    id?: string;
    cwd?: string | null;
    active?: boolean;
    env?: Record<string, string> | null;
    onExit?: () => void;
  } = $props();

  let hostEl: HTMLDivElement;
  let term: Terminal | null = null;
  let fit: FitAddon | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let themeObserver: MutationObserver | null = null;
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

  async function spawnShell() {
    if (!term) return;
    const onData = new Channel();
    onData.onmessage = (bytes: unknown) => {
      term?.write(bytes as Uint8Array);
    };
    // Le shell voit les mêmes arbres texmf que le bouton de compilation : un
    // `latexmk` lancé à la main doit trouver le kit azkit et le `user.def` du
    // projet. Sans cela la compilation marcherait depuis le bouton et pas
    // depuis la console, sans que rien ne l'explique.
    // Ce qui est passé en prop l'emporte : l'appelant sait ce qu'il fait.
    const envFinal = { ...(await envTexmf()), ...(env ?? {}) };
    try {
      await invoke("terminal_spawn", {
        id,
        cwd,
        rows: term.rows,
        cols: term.cols,
        env: envFinal,
        onData,
      });
      term.focus();
    } catch (err) {
      term.write(`\x1b[31m${err}\x1b[0m\r\n`);
    }
  }

  async function restart() {
    await invoke("terminal_kill", { id });
    exited = false;
    if (term) {
      term.clear();
    }
    await spawnShell();
  }

  onMount(() => {
    void (async () => {
      await init();

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

      themeObserver = new MutationObserver(() => applyTheme());
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

      term.onData((data) => {
        if (!exited) void invoke("terminal_write", { id, data });
      });

      unlistenExit = await listen<string>("terminal://exit", (e) => {
        if (e.payload === id) {
          exited = true;
          term?.write("\r\n\x1b[2m[process exited]\x1b[0m\r\n");
          onExit?.();
        }
      });

      await spawnShell();

      resizeObserver = new ResizeObserver(() => doFit());
      resizeObserver.observe(hostEl);
    })();
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    themeObserver?.disconnect();
    unlistenExit?.();
    void invoke("terminal_kill", { id });
    term?.dispose();
  });
</script>

<div class="terminal" class:is-exited={exited} bind:this={hostEl}>
  {#if exited}
    <div class="terminal__overlay">
      <button type="button" class="terminal__restart" onclick={restart}>
        <i class="wxi-rotate-ccw" style="font-size:14px"></i>
        Restart shell
      </button>
    </div>
  {/if}
</div>

<style>
  .terminal {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 4px 6px;
    box-sizing: border-box;
    background: var(--surface, #1e1e1e);
    overflow: hidden;
  }

  .terminal :global(canvas) {
    display: block;
  }

  .terminal__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--bg, #1e1e1e) 60%, transparent);
    backdrop-filter: blur(2px);
    z-index: 10;
    animation: fadeIn 0.2s ease;
  }

  .terminal__restart {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 18px;
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    background: var(--surface, #2a2a2a);
    color: var(--fg, #ccc);
    font-family: var(--font-ui, sans-serif);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .terminal__restart:hover {
    background: var(--surface-hover, #363636);
    border-color: var(--accent, #5b9bd5);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
