<script lang="ts">
  import { Icon } from "@/components/primitives";
  import { Maximize2 } from "@/lib/icons";
  import { startPreview, stopPreview, onPreviewNotification } from "@/typst/backend";
  import { getTinymistClient, startTinymist } from "@/lib/lsp/tinymist";

  let {
    value = "",
    filePath = "",
    onToggleFullscreen,
    onInverseSync,
  }: {
    value?: string;
    filePath?: string;
    onToggleFullscreen?: () => void;
    onInverseSync?: (file: string, line: number) => void;
  } = $props();

  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let previewUrl = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let compiling = $state(false);

  // Start preview via LSP on mount, stop on unmount
  $effect(() => {
    const path = filePath;
    if (!path) return;

    let cancelled = false;

    (async () => {
      try {
        const port = await startPreview(path, value);
        if (!cancelled) {
          previewUrl = `http://127.0.0.1:${port}/`;
          loading = false;
        }
      } catch (err) {
        if (!cancelled) {
          error = String(err);
          loading = false;
        }
      }
    })();

    return () => {
      cancelled = true;
      stopPreview().catch(() => {});
    };
  });

  // Listen for preview notifications (inverse sync)
  $effect(() => {
    const onSync = onInverseSync;
    if (!onSync) return;

    // Debounced inverse sync — collapses rapid window/showDocument bursts from
    // tinymist's initial outline analysis into a single jump.
    let inverseTimer: ReturnType<typeof setTimeout> | null = null;

    const unsub = onPreviewNotification((msg) => {
      if (msg.method === "tinymist/preview/scrollSource" && msg.params) {
        const p = msg.params as { filepath?: string; start?: [number, number] | null };
        if (p.filepath && p.start) {
          onSync(p.filepath, p.start[0] + 1);
        }
      }
      if (msg.method === "window/showDocument" && msg.params) {
        const p = msg.params as { uri?: string; selection?: { start?: { line?: number } } };
        if (p.uri && p.selection?.start?.line != null) {
          if (inverseTimer) clearTimeout(inverseTimer);
          inverseTimer = setTimeout(() => {
            const file = p.uri!.replace(/^file:\/\//, "");
            onSync(file, p.selection!.start!.line! + 1);
          }, 200);
        }
      }
    });

    return () => {
      if (inverseTimer) clearTimeout(inverseTimer);
      unsub();
    };
  });

  // Sync content to tinymist LSP on edit (debounced 150ms)
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let syncVersion = 1;
  $effect(() => {
    const text = value;
    const path = filePath;
    if (!path) return;

    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      compiling = true;
      try {
        const client = getTinymistClient();
        await startTinymist();
        syncVersion++;
        await client.changeFile(text, syncVersion);
      } finally {
        compiling = false;
      }
    }, 150);
    return () => {
      if (syncTimer) clearTimeout(syncTimer);
    };
  });
</script>

<div class="typst-preview" tabindex="-1">
  <header class="typst-preview__topbar">
    {#if compiling}
      <span class="typst-preview__compiling">compiling…</span>
    {/if}
    <div class="typst-preview__topbar-section typst-preview__topbar-right">
      <button
        class="typst-preview__btn"
        title="Fullscreen"
        onclick={() => onToggleFullscreen?.()}
      >
        <Icon icon={Maximize2} size={14} strokeWidth={1.6} />
      </button>
    </div>
  </header>

  {#if error}
    <div class="typst-preview__error">
      <p>Preview unavailable: {error}</p>
    </div>
  {:else if previewUrl}
    <iframe
      bind:this={iframeEl}
      src={previewUrl}
      title="Typst Preview"
      class="typst-preview__iframe"
    ></iframe>
  {:else}
    <div class="typst-preview__loading">
      <p>Starting preview...</p>
    </div>
  {/if}
</div>

<style>
  .typst-preview {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--color-bg, #fff);
    position: relative;
  }

  .typst-preview__topbar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 8px;
    gap: 4px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font-family: var(--font-ui);
    pointer-events: auto;
  }

  .typst-preview__topbar-section {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .typst-preview__topbar-right {
    margin-left: auto;
  }

  .typst-preview__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--dur-fast) var(--easing), color var(--dur-fast) var(--easing);
  }

  .typst-preview__btn:hover {
    background: color-mix(in srgb, var(--fg) 12%, transparent);
    color: var(--fg);
  }

  .typst-preview__btn:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .typst-preview__iframe {
    flex: 1;
    min-height: 0;
    width: 100%;
    border: none;
    background: #fff;
  }

  .typst-preview__loading,
  .typst-preview__error {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted, #888);
    font-size: 0.875rem;
  }

  .typst-preview__error {
    color: #c00;
  }

  .typst-preview__compiling {
    font-size: 0.7rem;
    font-family: var(--font-ui);
    color: var(--muted);
    opacity: 0.7;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }
</style>
