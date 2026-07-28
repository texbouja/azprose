<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import Terminal from "@/components/console/Terminal.svelte";
  // icons migrated to wxi-lucide.css
  import { getRootPath } from "@/stores/root-path.svelte";
  import { getActivePath } from "@/stores/active-path.svelte";
  import { basename } from "@/lib/paths-utils";

  const cwd = getRootPath();
  const SHELL_READY_MS = 400;

  function readColorScheme(): "dark" | "light" {
    const cs = getComputedStyle(document.documentElement).getPropertyValue("color-scheme").trim();
    return cs === "light" ? "light" : "dark";
  }

  function buildEnv(): Record<string, string> {
    const dark = readColorScheme() === "dark";
    const env: Record<string, string> = { COLORFGBG: dark ? "15;0" : "0;15" };
    // Isolate opencode session data per project — prevents history leaking
    // between projects and from external tools (VS Code, standalone terminal).
    if (cwd) env.XDG_DATA_HOME = `${cwd}/.azprose/opencode/data`;
    return env;
  }

  let terminalRef: Terminal | null = $state(null);
  let launched = $state(false);
  let exited = $state(false);

  let activeFile = $derived(getActivePath());
  let activeFileName = $derived(activeFile ? basename(activeFile) : null);

  function addFileToPrompt() {
    const p = getActivePath();
    if (!p || exited) return;
    const ref = getRootPath();
    const rel = ref ? p.replace(ref + "/", "") : p;
    void invoke("terminal_write", { id: "opencode", data: `@${rel}\n` });
  }

  $effect(() => {
    if (terminalRef && !launched) {
      launched = true;
      setTimeout(() => {
        void invoke("terminal_write", { id: "opencode", data: "opencode\n" });
      }, SHELL_READY_MS);
    }
  });

  let unlistenExit: UnlistenFn | null = null;
  $effect(() => {
    void listen<string>("terminal://exit", (e) => {
      if (e.payload === "opencode") exited = true;
    }).then(fn => { unlistenExit = fn; });
    return () => { unlistenExit?.(); };
  });
</script>

<div class="opencode-panel">
  <div class="opencode-panel__toolbar">
    <button
      type="button"
      class="opencode-panel__btn"
      disabled={!activeFile || exited}
      title={activeFile ? `Add ${activeFileName} to prompt` : "No active file"}
      onclick={addFileToPrompt}
    >
      <i class="wxi-paperclip" style="font-size:14px"></i>
      <span>{activeFileName ?? "No file"}</span>
    </button>
    <div class="opencode-panel__spacer" />
    <div class="opencode-panel__status" class:is-exited={exited} title={exited ? "Process exited" : "Running"}>
      <i class="wxi-sparkles" style="font-size:14px"></i>
    </div>
  </div>
  <div class="opencode-panel__terminal">
    <Terminal bind:this={terminalRef} id="opencode" {cwd} env={buildEnv()} />
  </div>
</div>

<style>
  .opencode-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .opencode-panel__toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .opencode-panel__btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg-muted);
    font-family: var(--font-ui);
    font-size: 11px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }
  .opencode-panel__btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--fg) 8%, var(--surface));
    color: var(--fg);
  }
  .opencode-panel__btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .opencode-panel__spacer {
    flex: 1;
  }
  .opencode-panel__status {
    color: var(--color-success, #40a02b);
    display: flex;
    align-items: center;
    opacity: 0.7;
  }
  .opencode-panel__status.is-exited {
    color: var(--color-error, #d20f39);
  }
  .opencode-panel__terminal {
    flex: 1;
    overflow: hidden;
  }
</style>
