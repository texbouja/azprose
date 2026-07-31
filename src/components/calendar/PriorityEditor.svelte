<script lang="ts">
  let {
    value = null,
    onchange,
  }: {
    value: string | null;
    onchange: (ev: { value: string | null }) => void;
  } = $props();

  const OPTIONS = [
    { id: "high", label: "Haute", css: "priority-high" },
    { id: "medium", label: "Moyenne", css: "priority-medium" },
    { id: "low", label: "Basse", css: "priority-low" },
  ];
</script>

<div class="priority-editor">
  {#each OPTIONS as opt}
    <button
      type="button"
      class="priority-btn {opt.css}"
      class:active={value === opt.id}
      onclick={() => onchange({ value: value === opt.id ? null : opt.id })}
    >
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .priority-editor {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .priority-btn {
    padding: 3px 10px;
    border-radius: 10px;
    border: 1px solid var(--border, #45475a);
    background: var(--bg, #1e1e2e);
    color: var(--fg-muted, #a6adc8);
    font-family: var(--font-ui, system-ui);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .priority-btn:hover {
    opacity: 0.85;
  }

  .priority-btn.active {
    color: white;
    border-color: transparent;
  }

  .priority-btn.priority-high.active {
    background: var(--color-danger, #f38ba8);
  }

  .priority-btn.priority-medium.active {
    background: var(--color-warning, #f9e2af);
    color: var(--bg, #1e1e2e);
  }

  .priority-btn.priority-low.active {
    background: var(--color-success, #a6e3a1);
    color: var(--bg, #1e1e2e);
  }
</style>
