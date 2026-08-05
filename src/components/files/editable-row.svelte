<script lang="ts">
import FileIcon from "./FileIcon.svelte";

let {
  depth,
  kind,
  initialValue,
  onSubmit,
  onCancel,
}: {
  depth: number;
  kind: "file" | "folder";
  initialValue: string;
  onSubmit: (name: string) => void;
  /** Cancels the pending create/rename. `viaKeyboard` is true when the cancel
      is initiated from the keyboard (Escape, or Enter on an empty/unchanged
      value) and false when the input blurred because the user clicked away.
      The tree uses the distinction to restore the keyboard focus to its last
      row on a keyboard cancel, and to leave the focus where the user put it
      after a blur. */
  onCancel: (viaKeyboard: boolean) => void;
} = $props();

let value = $state(initialValue);
let inputRef: HTMLInputElement;

$effect(() => {
  const input = inputRef;
  if (!input) return;
  input.focus();
  const dot = initialValue.lastIndexOf(".");
  if (dot > 0) input.setSelectionRange(0, dot);
  else input.select();
});

function submit(viaKeyboard: boolean) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === initialValue) {
    onCancel(viaKeyboard);
    return;
  }
  onSubmit(trimmed);
}

function onBlur() {
  // The wrapper's {#key version} teardown destroys this row's input while it
  // is focused (any tree state change re-renders ALL rows). The browser
  // fires blur on the detached element, but that is NOT a user action — the
  // row is re-created by the same re-render with newEntry/editingPath still
  // pending. Cancelling here would silently drop the new-entry row right
  // after clicking the toolbar button. Skip the submit/cancel when the input
  // is no longer connected to the document.
  if (!inputRef?.isConnected) return;
  submit(false);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    submit(true);
  } else if (e.key === "Escape") {
    e.preventDefault();
    onCancel(true);
  }
}

let padLeft = $derived(8 + depth * 12 + (kind === "file" ? 4 : 0));
</script>

<li class="mdv-tree__item">
  <div
    class="mdv-tree__row mdv-tree__row--editing mdv-tree__row--{kind}"
    style="padding-left:{padLeft}px"
  >
    {#if kind === "folder"}
      <span class="mdv-tree__chevron" aria-hidden="true">
        <i class="wxi-chevron-right" style="font-size:12px"></i>
      </span>
    {/if}
    <span class="mdv-tree__icon">
      {#if kind === "folder"}
        <i class="wxi-folder" style="font-size:13px"></i>
      {:else}
        <FileIcon path={initialValue} size={13} />
      {/if}
    </span>
    <input
      bind:this={inputRef}
      class="mdv-tree__edit-input"
      bind:value={value}
      onblur={onBlur}
      onkeydown={onKey}
      aria-label="{kind} name"
      spellcheck={false}
      autocorrect="off"
      autocapitalize="off"
    />
  </div>
</li>
