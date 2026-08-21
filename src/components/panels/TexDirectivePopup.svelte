<script lang="ts">
/**
 * Liste déroulante d'une directive azkit, rendue dans `document.body` (portal,
 * montée par `TexDirectiveSelect`) pour échapper au `overflow` + `backdrop-filter`
 * de la barre d'actions — un `position: fixed` posé DANS la barre y serait
 * reclipé (le backdrop-filter crée un containing block). C'est ce qui remplace
 * le menu NATIF du `<select>`, que WebKitGTK peint lui-même et qu'aucun CSS ne
 * peut thèmer : ici la liste est du DOM normal, thémée par les tokens.
 */
let {
  rect = null as DOMRect | null,
  options = [] as readonly string[],
  value = null as string | null,
  triggerEl = null as HTMLElement | null,
  onSelect,
  onClose,
}: {
  rect?: DOMRect | null;
  options?: readonly string[];
  value?: string | null;
  triggerEl?: HTMLElement | null;
  onSelect?: (value: string) => void;
  onClose?: () => void;
} = $props();

let ref = $state<HTMLDivElement | null>(null);
let pos = $state({ left: 8, top: 8 });

// Sous le déclencheur, rabattu dans le viewport si la liste déborderait.
$effect(() => {
  if (!ref || !rect) return;
  const pop = ref.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - pop.width - 8);
  const top = Math.min(rect.bottom + 2, window.innerHeight - pop.height - 8);
  pos = { left: Math.max(8, left), top: Math.max(8, top) };
});

// Ferme au clic hors de la liste ET hors du déclencheur (qui porte son propre
// toggle — sans cette exclusion, un clic sur le bouton fermerait puis rouvrirait),
// et sur Échap.
$effect(() => {
  const onDown = (e: MouseEvent) => {
    const t = e.target as Node;
    if (ref?.contains(t)) return;
    if (triggerEl?.contains(t)) return;
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
    }
  };
  document.addEventListener("mousedown", onDown);
  document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("mousedown", onDown);
    document.removeEventListener("keydown", onKey);
  };
});
</script>

<div
  bind:this={ref}
  class="tex-directive-popup"
  role="listbox"
  style="position:fixed;left:{pos.left}px;top:{pos.top}px"
>
  {#each options as option (option)}
    <button
      type="button"
      role="option"
      aria-selected={option === value}
      class="tex-directive-popup__item"
      class:is-selected={option === value}
      onclick={() => onSelect?.(option)}
    >
      {option}
    </button>
  {/each}
</div>

<style>
  .tex-directive-popup {
    min-width: 120px;
    padding: 3px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow:
      0 1px 0 color-mix(in srgb, white 4%, transparent) inset,
      0 10px 28px rgba(var(--shadow-color), 0.22),
      0 2px 8px rgba(var(--shadow-color), 0.08);
    z-index: 1000;
  }
  .tex-directive-popup__item {
    display: block;
    width: 100%;
    padding: 4px 9px;
    background: transparent;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    color: var(--fg);
    text-align: left;
    white-space: nowrap;
  }
  .tex-directive-popup__item:hover {
    background: var(--surface-hover);
  }
  .tex-directive-popup__item.is-selected {
    color: var(--accent);
  }
</style>
