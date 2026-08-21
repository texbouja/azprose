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

<label class="tex-directive" title={text}>
  <span class="tex-directive__label">{text}</span>
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
</label>

<style>
  .tex-directive {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 2px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .tex-directive__label {
    font-size: 12px;
    color: var(--fg-muted);
    font-weight: 500;
  }
  .tex-directive__select {
    font-size: 12px;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 4px;
    max-width: 110px;
    font-family: var(--font-ui, system-ui);
  }
  .tex-directive__select:hover {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  }
  .tex-directive__select:focus-visible {
    outline: none;
    border-color: var(--accent);
  }
</style>
