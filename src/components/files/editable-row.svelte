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
  onCancel: () => void;
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

function submit() {
  const trimmed = value.trim();
  if (!trimmed || trimmed === initialValue) {
    onCancel();
    return;
  }
  onSubmit(trimmed);
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    submit();
  } else if (e.key === "Escape") {
    e.preventDefault();
    onCancel();
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
      onblur={submit}
      onkeydown={onKey}
      aria-label="{kind} name"
      spellcheck={false}
      autocorrect="off"
      autocapitalize="off"
    />
  </div>
</li>
