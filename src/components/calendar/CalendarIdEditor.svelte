<script lang="ts">
  import { CALENDARS } from "@/lib/calendar-categories";

  let {
    value = "perso",
    onchange,
  }: {
    value: string;
    onchange: (ev: { value: string }) => void;
    // Accept but ignore extra props spread by the Editor (...editor)
    [key: string]: any;
  } = $props();
</script>

<select
  class="calendar-id-editor"
  {value}
  onchange={(e) => onchange({ value: (e.target as HTMLSelectElement).value })}
>
  {#each CALENDARS as cal (cal.id)}
    <option value={cal.id}>{cal.label}</option>
  {/each}
</select>

<style>
  .calendar-id-editor {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--border, #45475a);
    border-radius: 4px;
    background: var(--bg, #1e1e2e);
    color: var(--fg, #cdd6f4);
    font-family: var(--font-ui, system-ui);
    font-size: 13px;
    cursor: pointer;
  }

  .calendar-id-editor:focus {
    border-color: var(--accent, #89b4fa);
    outline: none;
  }
</style>
