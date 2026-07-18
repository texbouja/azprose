<script lang="ts">
  import { Icon } from "@/components/primitives";
  import { Maximize2 } from "@/lib/icons";
  import { startPreview, stopPreview, scrollToCursor, unregisterPreview, onPreviewNotification, onShowDocument, onPreviewDispose } from "@/typst/backend";

  let {
    filePath = "",
    onToggleFullscreen,
    onInverseSync,
  }: {
    filePath?: string;
    onToggleFullscreen?: () => void;
    onInverseSync?: (file: string, line: number) => void;
  } = $props();

  let previewUrl = $state<string | null>(null);
  let error = $state<string | null>(null);
  let myTaskId: string | null = null;
  let iframeReady = $state(false);

  // ── Preview lifecycle ──────────────────────────────────────────
  // startPreview sends didOpen + doStartPreview with --refresh-style on-save.
  // tinymist's CompileWatcher only renders when compilation comes from
  // a file-system save event. No SVG re-rendering on keystrokes.

  $effect(() => {
    const path = filePath;
    if (!path) return;

    let cancelled = false;
    iframeReady = false;

    (async () => {
      try {
        const result = await startPreview(path);
        if (!cancelled) {
          myTaskId = result.taskId;
          previewUrl = `http://127.0.0.1:${result.port}/`;
        }
      } catch (err) {
        if (!cancelled) {
          error = String(err);
        }
      }
    })();

    return () => {
      cancelled = true;
      previewUrl = null;
      iframeReady = false;
      if (myTaskId) {
        unregisterPreview(path);
        stopPreview(myTaskId).catch(() => {});
      }
      myTaskId = null;
    };
  });

  // ── Scroll to cursor after preview ready ───────────────────────
  // When iframe loads for the first time, scroll to the editor cursor position.

  $effect(() => {
    const ready = iframeReady;
    const taskId = myTaskId;
    const path = filePath;
    if (!ready || !taskId || !path) return;

    // Small delay to let tinymist finish the first compile
    const timer = setTimeout(() => {
      scrollToCursor(path, taskId).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  });

  // ── Handle external preview dispose ────────────────────────────

  $effect(() => {
    const unsub = onPreviewDispose((taskId) => {
      if (taskId === myTaskId) {
        previewUrl = null;
        error = "Preview was closed";
        myTaskId = null;
      }
    });
    return unsub;
  });

  // ── Inverse sync (preview → editor) ────────────────────────────

  $effect(() => {
    const onSync = onInverseSync;
    if (!onSync) return;

    let inverseTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubShowDoc = onShowDocument((params) => {
      const uri = params.uri;
      const line = params.selection?.start?.line;
      if (uri && line != null) {
        const file = uri.replace(/^file:\/\//, "");
        if (file !== filePath) return;
        if (inverseTimer) clearTimeout(inverseTimer);
        inverseTimer = setTimeout(() => {
          onSync(file, line + 1);
        }, 50);
      }
    });

    const unsubNotif = onPreviewNotification((msg) => {
      if (msg.method === "tinymist/preview/scrollSource" && msg.params) {
        const p = msg.params as { filepath?: string; start?: [number, number] | null };
        if (p.filepath && p.start && p.filepath === filePath) {
          onSync(p.filepath, p.start[0] + 1);
        }
      }
    });

    return () => {
      if (inverseTimer) clearTimeout(inverseTimer);
      unsubShowDoc();
      unsubNotif();
    };
  });
</script>

<div class="typst-preview" tabindex="-1">
  <header class="typst-preview__topbar">
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
      src={previewUrl}
      title="Typst Preview"
      class="typst-preview__iframe"
      class:typst-preview__iframe--visible={iframeReady}
      onload={() => { iframeReady = true; }}
    ></iframe>
    {#if !iframeReady}
      <div class="typst-preview__loading">
        <p>Compiling...</p>
      </div>
    {/if}
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
    opacity: 0;
    transition: opacity 0.3s ease-in;
  }

  .typst-preview__iframe--visible {
    opacity: 1;
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
</style>
