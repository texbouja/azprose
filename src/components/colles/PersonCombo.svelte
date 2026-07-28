<script lang="ts">
  import { getAllNames } from "@/stores/names.svelte";

  let {
    value = [],
    onchange,
  }: {
    value: (string | number)[];
    onchange: (ev: { value: (string | number)[] }) => void;
  } = $props();

  let text = $state("");
  let open = $state(false);
  let highlightIdx = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();
  let containerEl: HTMLDivElement | undefined = $state();

  const allNames = $derived(getAllNames());
  const selectedSet = $derived(new Set(value.map(String)));

  // Filter suggestions: exclude already-selected, match by substring
  const suggestions = $derived.by(() => {
    const q = text.trim().toLowerCase();
    return allNames
      .filter((n) => !selectedSet.has(n.name))
      .filter((n) => !q || n.name.toLowerCase().includes(q))
      .slice(0, 20); // cap at 20 visible
  });

  function add(name: string) {
    if (!name || selectedSet.has(name)) return;
    const next = [...value, name];
    onchange({ value: next });
    text = "";
    highlightIdx = 0;
  }

  function remove(name: string) {
    onchange({ value: value.filter((v) => String(v) !== name) });
  }

  function onInput() {
    open = true;
    highlightIdx = 0;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, suggestions.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && suggestions.length > 0) {
        const pick = suggestions[highlightIdx] ?? suggestions[0];
        add(pick.name);
      } else if (text.trim()) {
        // Allow freeform if no suggestion matches
        add(text.trim());
      }
    } else if (e.key === "Escape") {
      open = false;
    } else if (e.key === "Backspace" && !text && value.length > 0) {
      // Remove last tag when input is empty
      remove(String(value[value.length - 1]));
    }
  }

  function selectSuggestion(name: string) {
    add(name);
    inputEl?.focus();
  }

  // Close dropdown on outside click
  function onDocClick(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      open = false;
    }
  }

  $effect(() => {
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  });

</script>

<div class="person-combo" bind:this={containerEl}>
  <div class="person-combo__field">
    {#each value as v (v)}
      <span class="person-combo__tag">
        <span class="person-combo__tag-text">{v}</span>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <i class="wxi-close person-combo__tag-remove" onclick={() => remove(String(v))}></i>
      </span>
    {/each}
    <input
      bind:this={inputEl}
      bind:value={text}
      type="text"
      class="person-combo__input"
      placeholder={value.length ? "" : "Assigner à..."}
      oninput={onInput}
      onkeydown={onKeyDown}
      onfocus={() => { if (text.trim()) open = true; }}
    />
  </div>

  {#if open && suggestions.length > 0}
    <div class="person-combo__dropdown">
      {#each suggestions as s, i (s.name)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="person-combo__item"
          class:is-highlighted={i === highlightIdx}
          class:role--colleur={s.role === "colleur"}
          onclick={() => selectSuggestion(s.name)}
          onmouseenter={() => { highlightIdx = i; }}
        >
          <span class="person-combo__item-name">{s.name}</span>
          {#if s.role === "colleur"}
            <span class="person-combo__item-badge">colleur</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .person-combo {
    position: relative;
    width: 100%;
  }

  /* ── Field container (tags + input) ── */
  .person-combo__field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-height: 28px;
    padding: 3px 6px;
    background: var(--wx-input-background, var(--bg, #1e1e2e));
    border: 1px solid var(--wx-input-border, var(--border, #45475a));
    border-radius: var(--wx-input-border-radius, 4px);
    cursor: text;
    transition: border-color 0.15s;
  }

  .person-combo__field:focus-within {
    border-color: var(--wx-input-border-focus, var(--accent, #89b4fa));
  }

  /* ── Tag chip ── */
  .person-combo__tag {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 4px 1px 8px;
    border-radius: 3px;
    background: var(--wx-multicombo-tag-background, var(--surface, #2a2a3c));
    font-family: var(--font-ui, system-ui);
    font-size: 11px;
    color: var(--fg, #cdd6f4);
    line-height: 18px;
    white-space: nowrap;
  }

  .person-combo__tag-remove {
    font-size: 10px;
    cursor: pointer;
    opacity: 0.5;
    padding: 2px;
    border-radius: 2px;
  }

  .person-combo__tag-remove:hover {
    opacity: 1;
    background: var(--wx-background-hover, rgba(255, 255, 255, 0.08));
  }

  /* ── Input ── */
  .person-combo__input {
    flex: 1;
    min-width: 80px;
    border: none;
    outline: none;
    background: transparent;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    color: var(--fg, #cdd6f4);
    padding: 2px 0;
    line-height: 20px;
  }

  .person-combo__input::placeholder {
    color: var(--fg-muted, #a6adc8);
  }

  /* ── Dropdown ── */
  .person-combo__dropdown {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    max-height: 240px;
    overflow-y: auto;
    background: var(--wx-popup-background, var(--surface, #2a2a3c));
    border: 1px solid var(--wx-popup-border, var(--border, #45475a));
    border-radius: var(--wx-popup-border-radius, 6px);
    box-shadow: var(--wx-popup-shadow, 0 4px 20px rgba(0, 0, 0, 0.3));
    z-index: 1000;
    padding: 2px;
  }

  .person-combo__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    color: var(--fg, #cdd6f4);
    transition: background 0.1s;
  }

  .person-combo__item:hover,
  .person-combo__item.is-highlighted {
    background: var(--wx-background-hover, rgba(255, 255, 255, 0.08));
  }

  .person-combo__item-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .person-combo__item-badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--fg-muted, #a6adc8);
    background: var(--wx-background-alt, var(--surface, #2a2a3c));
    padding: 1px 4px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .person-combo__item.role--colleur .person-combo__item-name {
    color: var(--accent, #89b4fa);
  }
</style>
