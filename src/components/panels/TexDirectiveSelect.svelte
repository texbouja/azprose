<script lang="ts">
/**
 * Sélecteur d'une directive azkit (`\azcolors` / `\azgeometry`) dans la barre
 * d'actions .tex. Item custom SVAR (voir `registerToolbarItem`), il reçoit :
 *   · `text` — le libellé affiché à gauche (SVAR l'injecte depuis `item.text`) ;
 *   · `value` — la valeur courante, ou `null` si la directive est absente ;
 *   · `options` — les valeurs proposées (palettes ou médias) ;
 *   · `onchange` — le canal SVAR ; on le nourrit de `{ value }`, ce qui déclenche
 *     le `handler` de l'item (écriture dans le fichier, cf. TabActions).
 *
 * `value` peut être ABSENTE (fichier sans la directive) ou HORS LISTE (valeur
 * que le kit accepte mais que la barre ne propose pas) : dans les deux cas on
 * rend une `<option>` désactivée qui AFFICHE l'état réel sans le proposer à la
 * sélection, plutôt qu'un `<select>` vide qui mentirait sur l'état du fichier.
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

function handleChange(e: Event) {
  const v = (e.currentTarget as HTMLSelectElement).value;
  // L'option « vide » est un état d'affichage (directive absente), pas un choix.
  if (v !== "") onchange?.({ value: v });
}
</script>

<label class="tex-directive">
  <span class="tex-directive__label">{text}</span>
  <span class="tex-directive__select-wrap">
    <select class="tex-directive__select" value={value ?? ""} onchange={handleChange}>
      {#if value == null}
        <option value="" disabled>—</option>
      {:else if !options.includes(value)}
        <option value={value} disabled>{value}</option>
      {/if}
      {#each options as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
    <i class="wxi-chevron-down tex-directive__arrow" aria-hidden="true"></i>
  </span>
</label>

<style>
  /* Même gabarit que les boutons de la tabaction main : 28 px de haut, rayon
     5 px, fonte 12 px. Le `<select>` natif est DÉSHABILLÉ (appearance:none)
     pour qu'il suive réellement le thème — sans quoi WebKitGTK impose sa propre
     peinture (fond, flèche) qui ignore `background`/`border`. La flèche est
     fournie par le pack `wxi` (masque CSS en `currentColor`, donc thémée). */
  .tex-directive {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 2px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .tex-directive__label {
    font-size: 12px;
    font-weight: 500;
    line-height: 28px;
    color: var(--muted);
  }
  .tex-directive__select-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 28px;
  }
  .tex-directive__select {
    height: 28px;
    padding: 0 24px 0 8px; /* marge droite pour la flèche */
    font-size: 12px;
    font-weight: 500;
    line-height: 26px; /* 28 - 2×1px de bordure */
    font-family: var(--font-preview, var(--font-ui, system-ui));
    color: var(--fg);
    background-color: var(--surface);
    border: 1px solid var(--border);
    border-radius: 5px;
    max-width: 130px;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }
  .tex-directive__select:hover {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }
  .tex-directive__select:focus-visible {
    outline: none;
    border-color: var(--accent);
  }
  .tex-directive__arrow {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 12px;
    height: 12px;
    font-size: 12px;
    color: var(--muted);
    pointer-events: none;
  }
</style>
