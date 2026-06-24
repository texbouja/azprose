<script lang="ts">
let {
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
} = $props();

let Cmp = $state<typeof import("./ProseMarkEditor.svelte").default | null>(null);
let loading = $state(true);

$effect(() => {
  let cancelled = false;
  import("./ProseMarkEditor.svelte")
    .then((mod) => {
      if (cancelled) return;
      loading = false;
      Cmp = mod.default;
    })
    .catch((err) => {
      if (cancelled) return;
      console.error("azprose: failed to load ProseMark editor", err);
    });
  return () => { cancelled = true; };
});
</script>

{#if loading}
  <div class="mdv-editor" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.85rem;border:0">loading prose editor…</div>
{:else if Cmp}
  <Cmp {value} {onChange} />
{/if}
