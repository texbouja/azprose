<script lang="ts">
import type { SlideMode } from "@/stores/slide-settings.svelte";

let {
  mode = $bindable("16:9" as SlideMode),
  value,
  onchange,
}: {
  mode?: SlideMode;
  value?: SlideMode;
  onchange?: (ev: { value: SlideMode }) => void;
} = $props();

function set() {
  mode = value!;
  onchange?.({ value: value! });
}
</script>

<label class="slide-mode-radio">
  <input type="radio" name="slide-mode" checked={mode === value} onchange={set} />
  <span>{value}</span>
</label>

<style>
  .slide-mode-radio {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--fg-muted);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .slide-mode-radio:hover {
    background: var(--surface-hover);
  }
  .slide-mode-radio input {
    margin: 0;
    accent-color: var(--accent);
  }
</style>
