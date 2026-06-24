<script lang="ts">
import { ChevronRight, FileText, Folder } from "lucide-svelte";
import Icon from "@/components/primitives/Icon.svelte";

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

let Glyph = $derived(kind === "folder" ? Folder : FileText);
let padLeft = $derived(8 + depth * 12 + (kind === "file" ? 4 : 0));
</script>

<li class="mdv-tree__item">
  <div
    class="mdv-tree__row mdv-tree__row--editing mdv-tree__row--{kind}"
    style="padding-left:{padLeft}px"
  >
    {#if kind === "folder"}
      <span class="mdv-tree__chevron" aria-hidden="true">
        <Icon icon={ChevronRight} size={12} strokeWidth={2} />
      </span>
    {/if}
    <span class="mdv-tree__icon">
      <Icon icon={Glyph} size={13} strokeWidth={1.5} />
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
