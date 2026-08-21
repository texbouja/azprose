<script lang="ts">
import { mount, unmount } from "svelte";
import TexDirectivePopup from "./TexDirectivePopup.svelte";

/**
 * Sélecteur d'une directive azkit (`\azcolors` / `\azgeometry`) dans la barre
 * d'actions .tex. Item custom SVAR (voir `registerToolbarItem`), il reçoit :
 *   · `text` — le libellé affiché à gauche (SVAR l'injecte depuis `item.text`) ;
 *   · `value` — la valeur courante, ou `null` si la directive est absente ;
 *   · `options` — les valeurs proposées (palettes ou médias) ;
 *   · `onchange` — le canal SVAR ; on le nourrit de `{ value }`, ce qui déclenche
 *     le `handler` de l'item (écriture dans le fichier, cf. TabActions).
 *
 * Le menu déroulant est un DROPDOWN CUSTOM monté en portal dans `document.body`
 * (pas un `<select>` natif) : le menu natif de WebKitGTK ne suit pas le thème,
 * et la barre d'actions (`overflow` + `backdrop-filter`) recliperait un popup
 * rendu en place. `value` peut être ABSENTE (directive absente → « — ») ou HORS
 * LISTE (valeur acceptée par le kit mais non proposée) : l'état réel est alors
 * affiché sans être proposé à la sélection.
 */
let {
  text = "",
  value = null as string | null,
  options = [] as readonly string[],
  onchange,
}: {
  text?: string;
  value?: string | null;
  options?: readonly string[];
  onchange?: (ev: { value: string }) => void;
} = $props();

let open = $state(false);
let triggerEl = $state<HTMLButtonElement | null>(null);

function toggle() {
  open = !open;
}

function close() {
  open = false;
}

function select(v: string) {
  onchange?.({ value: v });
  close();
}

// Portal : tant que le menu est ouvert, on le monte dans document.body pour
// qu'il échappe au `overflow`/`backdrop-filter` de la barre. Le cleanup démonte
// le popup ET retire son nœud hôte à la fermeture ou à la destruction.
$effect(() => {
  if (!open) return;
  const rect = triggerEl?.getBoundingClientRect() ?? null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const popup = mount(TexDirectivePopup, {
    target: host,
    props: {
      rect,
      options: [...options],
      value,
      triggerEl,
      onSelect: select,
      onClose: close,
    },
  });
  return () => {
    void unmount(popup);
    host.remove();
  };
});
</script>

<button
  type="button"
  class="tex-directive"
  class:is-open={open}
  bind:this={triggerEl}
  onclick={toggle}
  aria-haspopup="listbox"
  aria-expanded={open}
  title={text}
>
  <span class="tex-directive__label">{text}</span>
  <span class="tex-directive__value">{value ?? "—"}</span>
  <i class="wxi-chevron-down tex-directive__arrow" aria-hidden="true"></i>
</button>

<style>
  /* Même gabarit que les boutons de la tabaction main : 28 px de haut, rayon
     5 px, fonte 12 px. Fonds/tokens thémés — le menu ouvert (TexDirectivePopup)
     suit aussi le thème, contrairement au `<select>` natif. */
  .tex-directive {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 8px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-preview, var(--font-ui, system-ui));
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .tex-directive:hover,
  .tex-directive.is-open {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .tex-directive:focus-visible {
    outline: none;
    border-color: var(--accent);
  }
  .tex-directive__label {
    color: var(--muted);
  }
  .tex-directive__value {
    color: var(--fg);
  }
  .tex-directive__arrow {
    width: 12px;
    height: 12px;
    font-size: 12px;
    color: var(--muted);
  }
</style>
