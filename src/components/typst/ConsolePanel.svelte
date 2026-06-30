<script lang="ts">
  import type { Diagnostic } from "@/lib/diagnostics";
  import Terminal from "./Terminal.svelte";
  import { Icon } from "@/components/primitives";
  import { Trash2 } from "@/lib/icons";

  let {
    diagnostics = [] as Diagnostic[],
    height = 160,
    activeTab = "diagnostics",
    terminalCwd = null,
    hidden = false,
    onClose,
    onHeightChange,
    onJumpToLine,
    onTabChange,
  }: {
    diagnostics?: Diagnostic[];
    height?: number;
    activeTab?: "diagnostics" | "terminal";
    terminalCwd?: string | null;
    /** Kept mounted but visually hidden (closed) so the terminal session survives. */
    hidden?: boolean;
    onClose?: () => void;
    onHeightChange?: (h: number) => void;
    onJumpToLine?: (line: number, col?: number | null) => void;
    onTabChange?: (tab: "diagnostics" | "terminal") => void;
  } = $props();

  // Mount the terminal lazily (first time its tab is shown) and keep it alive
  // afterwards so the shell survives tab switches.
  let terminalStarted = $state(false);
  $effect(() => {
    if (activeTab === "terminal") terminalStarted = true;
  });

  // Explicit "close terminal": unmounting the Terminal triggers its onDestroy →
  // terminal_kill (PTY closed). Re-selecting the Terminal tab spawns a fresh shell.
  function killTerminal() {
    terminalStarted = false;
  }

  let dragStartY = 0;
  let dragStartH = 0;

  function onHandleDown(e: PointerEvent) {
    dragStartY = e.clientY;
    dragStartH = height;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onHandleMove(e: PointerEvent) {
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const delta = dragStartY - e.clientY;
    onHeightChange?.(Math.max(80, Math.min(600, dragStartH + delta)));
  }

  function jump(d: Diagnostic) {
    if (d.line != null) onJumpToLine?.(d.line, d.col);
  }

  let errorCount = $derived(diagnostics.filter((d) => d.severity === "error").length);
  let warnCount = $derived(diagnostics.filter((d) => d.severity === "warning").length);
</script>

<div class="diag-console" class:is-hidden={hidden} style="height: {height}px">
  <div
    class="diag-console__handle"
    onpointerdown={onHandleDown}
    onpointermove={onHandleMove}
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize console"
  ></div>
  <div class="diag-console__header">
    <div class="diag-console__tabs">
      <button
        type="button"
        class="diag-console__tab"
        class:is-active={activeTab === "diagnostics"}
        onclick={() => onTabChange?.("diagnostics")}
      >
        Diagnostics
        {#if errorCount > 0}
          <span class="diag-console__badge" data-severity="error">{errorCount}</span>
        {/if}
        {#if warnCount > 0}
          <span class="diag-console__badge" data-severity="warning">{warnCount}</span>
        {/if}
      </button>
      <button
        type="button"
        class="diag-console__tab"
        class:is-active={activeTab === "terminal"}
        onclick={() => onTabChange?.("terminal")}
      >
        Terminal
      </button>
    </div>
    {#if activeTab === "terminal" && terminalStarted}
      <button
        type="button"
        class="diag-console__kill"
        title="Fermer le terminal"
        aria-label="Fermer le terminal"
        onclick={killTerminal}
      >
        <Icon icon={Trash2} size={13} strokeWidth={1.6} />
      </button>
    {/if}
    <button
      type="button"
      class="diag-console__close"
      aria-label="Close console"
      onclick={onClose}
    >×</button>
  </div>
  <div class="diag-console__body">
    <div class="diag-console__pane" class:is-hidden={activeTab !== "diagnostics"}>
      {#if diagnostics.length === 0}
        <div class="diag-console__empty">No diagnostics</div>
      {:else}
        {#each diagnostics as diag}
          {@const located = diag.line != null}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="diag-console__diag"
            class:is-clickable={located}
            data-severity={diag.severity}
            role={located ? "button" : undefined}
            tabindex={located ? 0 : undefined}
            title={located ? "Aller à la ligne" : undefined}
            onclick={() => jump(diag)}
            onkeydown={(e) => { if (located && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); jump(diag); } }}
          >
            <span class="diag-console__diag-badge">{diag.severity}</span>
            {#if diag.source}
              <span class="diag-console__diag-source">{diag.source}</span>
            {/if}
            {#if located}
              <span class="diag-console__diag-loc">{diag.line}:{diag.col ?? 1}</span>
            {/if}
            <div class="diag-console__diag-body">
              <pre class="diag-console__diag-msg">{diag.message}</pre>
              {#if diag.hints && diag.hints.length > 0}
                {#each diag.hints as hint}
                  <pre class="diag-console__diag-hint">hint: {hint}</pre>
                {/each}
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
    {#if terminalStarted}
      <div class="diag-console__pane diag-console__pane--term" class:is-hidden={activeTab !== "terminal"}>
        <Terminal id="main" cwd={terminalCwd} active={activeTab === "terminal"} />
      </div>
    {/if}
  </div>
</div>

<style>
  .diag-console {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border);
    background: var(--surface, #f9fafb);
    min-height: 80px;
    max-height: 600px;
    overflow: hidden;
  }

  /* Closed: hidden but still mounted, so the terminal/shell session survives. */
  .diag-console.is-hidden {
    display: none;
  }

  .diag-console__handle {
    height: 4px;
    flex-shrink: 0;
    cursor: row-resize;
    background: transparent;
    transition: background var(--dur-fast, 0.1s);
  }

  .diag-console__handle:hover,
  .diag-console__handle:active {
    background: var(--accent);
  }

  .diag-console__header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    background: var(--surface);
  }

  .diag-console__tabs {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .diag-console__tab {
    padding: 0 12px;
    height: 30px;
    border: none;
    border-right: 1px solid var(--border);
    background: transparent;
    color: var(--muted);
    font-size: 11px;
    font-family: var(--font-ui, sans-serif);
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: color var(--dur-fast, 0.1s), background var(--dur-fast, 0.1s);
    white-space: nowrap;
  }

  .diag-console__tab:hover:not(:disabled) {
    color: var(--fg);
    background: var(--surface-hover);
  }

  .diag-console__tab.is-active {
    color: var(--fg);
    border-bottom: 2px solid var(--accent);
  }

  .diag-console__tab:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .diag-console__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 14px;
    padding: 0 4px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    font-family: var(--font-mono, monospace);
    line-height: 1;
  }

  .diag-console__badge[data-severity="error"] {
    background: var(--color-error-bg, #fee2e2);
    color: var(--color-error, #b91c1c);
  }

  .diag-console__badge[data-severity="warning"] {
    background: var(--color-warning-bg, #fef3c7);
    color: var(--color-warning, #92400e);
  }

  .diag-console__close,
  .diag-console__kill {
    width: 28px;
    height: 30px;
    border: none;
    background: transparent;
    color: var(--muted);
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: color var(--dur-fast, 0.1s), background var(--dur-fast, 0.1s);
  }

  .diag-console__close:hover {
    color: var(--fg);
    background: var(--surface-hover);
  }

  .diag-console__kill:hover {
    color: var(--color-error, #b91c1c);
    background: var(--surface-hover);
  }

  .diag-console__body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .diag-console__pane {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0;
  }

  .diag-console__pane--term {
    overflow: hidden;
    padding: 0;
  }

  .diag-console__pane.is-hidden {
    display: none;
  }

  .diag-console__empty {
    padding: 8px 12px;
    font-size: 12px;
    color: var(--muted);
    font-family: var(--font-ui, sans-serif);
  }

  .diag-console__diag {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 3px 12px;
    border-bottom: 1px solid transparent;
    width: 100%;
    text-align: left;
  }

  .diag-console__diag.is-clickable {
    cursor: pointer;
  }

  .diag-console__diag:hover {
    background: var(--surface-hover);
  }

  .diag-console__diag:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }

  .diag-console__diag[data-severity="error"] {
    border-left: 2px solid var(--color-error, #b91c1c);
  }

  .diag-console__diag[data-severity="warning"] {
    border-left: 2px solid var(--color-warning, #92400e);
  }

  .diag-console__diag-badge {
    flex-shrink: 0;
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding-top: 2px;
    opacity: 0.7;
  }

  .diag-console__diag[data-severity="error"] .diag-console__diag-badge {
    color: var(--color-error, #b91c1c);
  }

  .diag-console__diag[data-severity="warning"] .diag-console__diag-badge {
    color: var(--color-warning, #92400e);
  }

  .diag-console__diag-source {
    flex-shrink: 0;
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 3px;
    margin-top: 1px;
    line-height: 1.5;
  }

  .diag-console__diag-loc {
    flex-shrink: 0;
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    color: var(--muted);
    padding-top: 2px;
    white-space: nowrap;
  }

  .diag-console__diag.is-clickable:hover .diag-console__diag-loc {
    color: var(--accent);
    text-decoration: underline;
  }

  .diag-console__diag-body {
    flex: 1;
    min-width: 0;
  }

  .diag-console__diag-msg {
    margin: 0;
    font-family: var(--font-mono, monospace);
    font-size: 11.5px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--fg);
    line-height: 1.5;
  }

  .diag-console__diag-hint {
    margin: 1px 0 0;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--muted);
    line-height: 1.4;
  }
</style>
