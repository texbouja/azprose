<script lang="ts">
  // ── SVAR Grid wrapper (grille éditable DataFilter) ─────────────────────────
  // Pendant SVAR de Spreadsheet.svelte (wrapper jspreadsheet) : reçoit les
  // données/colonnes en props, expose l'API Grid au parent via `getApi()`
  // (pour la toolbar undo/redo/filtres) et forwarde chaque édition de
  // cellule vers le parent via `onUpdateCell` — payload brut de l'action
  // `update-cell` du DataStore, y compris `eventSource` (les rejoués par
  // undo portent `eventSource: "undo"` ; le parent PERSISTE quand même,
  // le mode `undo` n'est pas un filtre de persistance).
  // Conventions tableur ajoutées par-dessus SVAR : double-clic sur le grip
  // d'une colonne = auto-resize (Excel-style), Entrée = éditer la cellule
  // focalisée (jspreadsheet-style).

  import { Grid } from "@svar-ui/svelte-grid";
  import type { IRow, IColumn, IApi, ISortMarks } from "@svar-ui/grid-store";

  /** Contrat de la config `hotkeys` du Grid (le type officiel
   *  `HotkeysConfig` de `@svar-ui/grid-store` n'est pas re-exporté par
   *  l'index du package — il vit dans `dist/types/hotkeys.d.ts`). */
  type HotkeysConfig = Record<string, ((e?: KeyboardEvent | undefined) => void) | boolean>;

  /** Payload de l'action `update-cell` du DataStore SVAR (contrat exact de
   *  `IDataMethodsConfig["update-cell"]` ; `TID = number | string`). */
  export interface UpdateCellPayload {
    id: string | number;
    column: string | number;
    value: string | number | Date;
    eventSource?: string;
  }

  let {
    data = [],
    columns = [],
    undo = true,
    reorder = false,
    sortMarks = {},
    filterValues = {},
    sizes = {},
    hotkeys = {},
    onUpdateCell,
    onReady,
    class: className = "",
    ...restProps
  }: {
    data: IRow[];
    columns: IColumn[];
    /** Active l'historique undo/redo du Grid (Ctrl+Z / Ctrl+Y). */
    undo?: boolean;
    /** Réordonnancement des lignes par glisser-déposer. */
    reorder?: boolean;
    /** Marqueurs de tri colonne→état (contrat `ISortMarks`). */
    sortMarks?: ISortMarks;
    /** Filtres actifs (contrat `IFilterValues`, cf. `createFilter`). */
    filterValues?: Record<string, any>;
    /** Tailles (rowHeight/headerHeight/columnWidth). */
    sizes?: Record<string, any>;
    /** Raccourcis clavier (fusionnés aux défauts SVAR). `false` désactive
     *  tout ; une clé peut être une fonction `(event) => void` (utilisée
     *  telle quelle) ou `true` (routée vers le handler `hotkey` du store).
     *  `enter` est fourni par le wrapper (éditer la cellule focalisée) et
     *  peut être surchargé. */
    hotkeys?: HotkeysConfig | false;
    /** Fires à chaque édition de cellule (saisie, combo, date, undo…). */
    onUpdateCell?: (payload: UpdateCellPayload) => void;
    /** Fires une fois l'API Grid disponible (au premier init du DataStore). */
    onReady?: (api: IApi) => void;
    /** Prop Svelte `class`. */
    class?: string;
    /** Tout autre prop (onresizecolumn, onsortrows, onmoveitem…) est
     *  transmis au Grid et routé par son EventBusRouter (`on` + nom). */
    [key: string]: any;
  } = $props();

  let api: IApi | null = null;

  /** Accès à l'API Grid (exec/on/getReactiveState…) pour la toolbar parent. */
  export function getApi(): IApi | null {
    return api;
  }

  /** Entrée = ouvrir l'éditeur sur la cellule focalisée (convention tableur,
   *  identique à jspreadsheet). SVAR ne lie Enter qu'aux colonnes
   *  arborescentes (no-op sur une grille plate) ; `f2` ouvre déjà l'éditeur —
   *  on reproduit exactement son comportement via la config `hotkeys` du Grid
   *  (écouteur document + `node.contains(target)`, donc actif seulement quand
   *  le focus est dans la grille). Même garde `isInput` que le store : pendant
   *  la saisie dans l'éditeur (input/textarea, cellule éditeur, filtre),
   *  Enter garde son rôle normal (commit de l'édition en cours). */
  function handleEnter(event?: KeyboardEvent) {
    const target = event?.target as HTMLElement | null;
    if (
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.closest(".wx-cell.wx-editor") ||
      target?.closest("[data-header-id]")?.classList.contains("wx-filter")
    )
      return;
    const focusCell = api?.getState().focusCell;
    if (!focusCell) return;
    api?.exec("open-editor", { id: focusCell.row, column: focusCell.column });
  }

  /** Config hotkeys fusionnée : défauts SVAR + Enter du wrapper. Capturée par
   *  `use:hotkeys` au montage (l'action n'a pas d'`update`) — l'IIFE lit le
   *  prop `hotkeys` dans une fermeture (référence initiale voulue) ; la
   *  fusion est donc stable par instance, et `hotkeys.enter` du parent (ou
   *  `false`) surcharge le défaut. */
  const gridHotkeys: HotkeysConfig | false = (() => {
    const h = hotkeys;
    return h === false ? false : { ...h, enter: h.enter ?? handleEnter };
  })();

  /** Auto-resize au DOUBLE-CLIC sur le grip d'une colonne (Excel-style).
   *  SVAR ne le supporte pas nativement — l'action `use:resize` n'écoute que
   *  mousedown/mousemove/mouseup. On le greffe ici : la cellule d'en-tête
   *  porte `data-header-id`, on relit l'id depuis le DOM puis on exécute
   *  l'action officielle `resize-column { auto: true }` (EN-TÊTE + données
   *  mesurés — `auto: "data"` seul ignore le titre de colonne ; ignorée par
   *  l'historique undo/redo via `skipUndo`). L'événement `resize-column`
   *  traverse le router → le parent (`onresizecolumn`) persiste les largeurs
   *  comme pour un drag normal. */
  function handleDblClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const grip = target.closest(".wx-grip");
    if (!grip) return;
    const cell = grip.closest<HTMLElement>(".wx-cell");
    const id = cell?.dataset.headerId;
    if (!id || !api) return;
    api
      .exec("resize-column", { id, auto: true, maxRows: 500, skipUndo: true })
      .catch((err: unknown) => console.warn("[svar-grid] dblclick auto-resize:", err));
  }
</script>

<!-- Le double-clic est une amélioration progressive du grip (drag) natif —
     les interactions clavier passent par la grille elle-même. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="svar-grid{className ? ` ${className}` : ""}" ondblclick={handleDblClick}>
  <Grid
    {data}
    {columns}
    {undo}
    {reorder}
    {sortMarks}
    {filterValues}
    {sizes}
    hotkeys={gridHotkeys}
    init={(a) => {
      api = a;
      onReady?.(a);
    }}
    onupdatecell={(e: UpdateCellPayload) => onUpdateCell?.(e)}
    {...restProps}
  />
</div>

<style>
  .svar-grid {
    height: 100%;
    overflow: hidden;
    font-family: var(--font-preview, var(--font-ui));
  }

  /* Le Grid rend son propre conteneur racine `.wx-grid` (avec `height: 100%`
     interne et `.wx-scroll { flex: 1 }`) ; on renforce la chaîne de hauteur
     pour que la zone de données remplisse l'espace disponible. */
  .svar-grid :global(.wx-grid) {
    height: 100%;
  }

  /* Scroll interne SANS ascenseur visible (UX pile : la carte est un écran
     de lecture, l'ascenseur extérieur de la pile fait le scrolling). SVAR
     pose `overflow-x/overflow-y: scroll|hidden` INLINE sur `.wx-scroll`
     selon `hasHScroll`/`hasVScroll` — on masque seulement le rendu :
     `scrollbar-width: none` (Firefox) + `::-webkit-scrollbar { display: none }`
     (WebKit) laissent le défilement fonctionnel (roulette, toucher, drag).
     Le défilement est borné à la grille (`overscroll-behavior: contain`,
     cf. svar-theme.css) : il ne se propage jamais à la pile. */
  .svar-grid :global(.wx-scroll) {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .svar-grid :global(.wx-scroll::-webkit-scrollbar) {
    display: none;
    width: 0;
    height: 0;
  }
</style>
