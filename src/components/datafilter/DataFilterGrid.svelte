<script lang="ts">
  // ── DataFilter grid card (un tableau dans la pile « Filtre de données ») ───
  // Une VUE datagrid de la db, clairement identifiée par sa barre de carte
  // (nom, badge source, compteurs lignes/colonnes, undo/redo, « Edit dans
  // Spreadsheet », bouton retirer). Les lignes sont chargées live depuis le
  // tableur source (`datagridGet` JOIN spreadsheet_columns × config vue et
  // reconstruit les lignes depuis spreadsheet_cells — pas de snapshot stocké).
  //
  // Édition directe (même comportement que l'ancien DatagridViewer) :
  //  - chaque édition de cellule est persistée via `datagridSaveCells`
  //    (O(changes), upsert natif directement dans la table source partagée)
  //  - undo/redo natifs du Grid SVAR (mode `undo`) — les rejoués portent
  //    `eventSource: "undo"` et SONT persistés comme toute édition
  //  - rechargement inverse : écoute `azprose:datagrid-updated` (le viewer
  //    tableur notifie ses vues ouvertes après un save) ; après ses propres
  //    saves, notifie `azprose:spreadsheet-updated` pour le viewer tableur
  //
  // Filtrage : vient du widget unifié de la pile (v10) — le parent passe
  // `rules` (une règle par TITRE de colonne, combinées en ET, persistées
  // dans `datagrid_stack_rules`). Cette carte applique les règles dont le
  // titre correspond à l'une de ses colonnes (titre → id local `c{i}`) via
  // le `filter-rows` du Grid — les lignes sont masquées, la barre de carte
  // et les colonnes restent visibles. Elle remonte ses colonnes (titre +
  // type détecté) via `onFieldsChanged` pour la liste de champs du widget.

  import { onMount, onDestroy, tick } from "svelte";
  import SvarGrid from "./SvarGrid.svelte";
  import type { UpdateCellPayload } from "./SvarGrid.svelte";
  import type { IApi, IColumn, IColumnEditor, IOption, IRow } from "@svar-ui/grid-store";
  import { getFilter } from "@svar-ui/filter-store";
  import type { IFilter } from "@svar-ui/filter-store";
  import { datagridGet, datagridSave, datagridSaveCells } from "@/datagrid/store";
  import type { DatagridColumnDef, StackFilterField, StackFilterRule } from "@/datagrid/types";
  import type { CellChange } from "@/spreadsheet/types";

  // ── Densité (constante module : identité STABLE d'un render à l'autre) ────
  // Le Grid ré-initialise son DataStore à chaque changement de prop `sizes` —
  // un littéral d'objet inline serait recréé à chaque render et provoquerait
  // des re-init en rafale (update-cell fantômes). Constante = même référence.
  const GRID_SIZES = { rowHeight: 27, headerHeight: 29 };

  let {
    gridId = "",
    name = "",
    rules = [],
    onFieldsChanged,
    onRemove,
  }: {
    gridId: string;
    name?: string;
    /** Règles de filtre de la pile (par TITRE de colonne) — appliquées à
     *  cette grille uniquement pour les colonnes qu'elle possède. */
    rules?: StackFilterRule[];
    onFieldsChanged?: (fields: StackFilterField[]) => void;
    onRemove?: () => void;
  } = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let gridName = $state("");
  let sourceLinked = $state(false);
  /** Id du tableur source (source_spreadsheet_id) — pour « Edit dans
   *  Spreadsheet » et la notification inverse après save. */
  let sourceSpreadsheetId = $state<string | null>(null);
  let totalRows = $state(0);
  let visibleRows = $state(0);

  let svarColumns: IColumn[] = $state([]);
  let svarRows: IRow[] = $state([]);
  let gridApi: IApi | null = $state(null);

  /** Config de colonnes de la VUE au dernier load (datagridGet) — seul
   *  width/hidden est une donnée de vue, le reste (title/type/options) vient
   *  du tableur source. On la garde pour persister les largeurs (auto-fit +
   *  resize utilisateur) via `datagridSave` (config SEULEMENT, jamais de rows). */
  let viewColumns: DatagridColumnDef[] = [];
  /** Auto-fit exécuté UNE seule fois par carte (premier load) : les reloads
   *  suivants réutilisent les largeurs persistées (datagridGet les relit). */
  let didAutoFit = false;
  let widthSaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Fenêtre de suppression des `update-cell` pendant un remplacement des
   *  données (`svarColumns`/`svarRows`) : le Grid SVAR ré-exécute
   *  `$effect(reinitStore)` → `dataStore.init()` à chaque changement de props
   *  et un re-init peut rejouer un `update-cell` fantôme — ne pas le
   *  persister comme un edit utilisateur. Plain variable, jamais rendue. */
  let suppressGridUpdates = false;

  /** Remplace les données de la grille sous suppression d'événements : les
   *  `update-cell` émis pendant le re-init du Grid (synchrones dans le flush
   *  Svelte + un macrotask pour les différés) sont ignorés. */
  async function setGridData(cols: IColumn[], rows: IRow[]) {
    suppressGridUpdates = true;
    svarColumns = cols;
    svarRows = rows;
    try {
      await tick();
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      suppressGridUpdates = false;
    }
  }

  function handleReady(api: IApi) {
    gridApi = api;
  }

  // ── Largeurs de colonnes (auto-fit + resize utilisateur) ─────────────────
  // DataFilter = mode visualisation : au premier load on ajuste chaque
  // colonne à son contenu et à son EN-TÊTE (`resize-column { auto: true }`,
  // API officielle SVAR), puis on persiste les largeurs dans la config de VUE
  // (datagridSave, jamais de rows). Le resize utilisateur (grip d'en-tête,
  // rendu grâce à `resize: true`) persiste aussi, débouncé.

  /** Auto-fit : mesure l'EN-TÊTE et les données (`auto: true` — le header
   *  n'était pas mesuré avec `auto: "data"`, une colonne « Prénom » pouvait
   *  être tronquée par son titre) et ignore l'historique undo/redo
   *  (`skipUndo`). `maxRows` borne le coût sur les grosses tables. */
  async function autoFitColumns() {
    const api = gridApi;
    if (!api || didAutoFit) return;
    didAutoFit = true;
    for (const c of svarColumns) {
      try {
        await api.exec("resize-column", {
          id: c.id as string | number,
          auto: true,
          maxRows: 500,
          skipUndo: true,
        });
      } catch {
        /* colonne sans données mesurables — conservée telle quelle */
      }
    }
    persistColumnWidths();
  }

  /** Persiste les largeurs de la vue (config seule, contrat datagrid_save)
   *  après un auto-fit ou un resize utilisateur. Matching par id de colonne
   *  (l'ordre live du DataStore == ordre de la config vue). */
  function flushWidths() {
    widthSaveTimer = null;
    const api = gridApi;
    const state = api?.getState();
    const cols = state?.columns;
    if (!api || !Array.isArray(cols) || cols.length === 0) return;
    let changed = false;
    const updated = viewColumns.map((c) => {
      const live = cols.find((x: IColumn) => String(x.id) === String(c.id));
      if (!live) return c;
      const w = Number(live.width);
      if (!Number.isFinite(w) || w <= 0 || w === c.width) return c;
      changed = true;
      return { ...c, width: w };
    });
    if (!changed) return;
    datagridSave(gridId, gridName || name, updated)
      .then(() => {
        viewColumns = updated;
      })
      .catch((e: unknown) => console.warn("[datafilter] save view widths:", e));
  }

  function persistColumnWidths() {
    if (widthSaveTimer) clearTimeout(widthSaveTimer);
    widthSaveTimer = setTimeout(flushWidths, 400);
  }

  /** Le Grid émet `resize-column` pour le drag de grip ET pour nos auto-fit
   *  (les deux passent par la même action) — la persistance débouncée couvre
   *  les deux cas, `didAutoFit` garde l'auto-fit à un seul passage. */
  function handleColumnResize(_ev: { id: string | number }) {
    persistColumnWidths();
  }

  /** Auto-fit déclenché UNE fois, quand l'API Grid devient disponible — au
   *  premier chargement la grille n'est pas encore montée pendant `load()`
   *  (`loading` reste true jusqu'au finally), l'effet rattrape donc le moment
   *  où `loading` passe à false et où `gridApi` est posé par `handleReady`.
   *  Les reloads suivants réutilisent les largeurs persistées. */
  $effect(() => {
    const api = gridApi;
    if (!api || didAutoFit || loading) return;
    autoFitColumns();
  });

  // ── API Grid + historique undo/redo (barre de carte) ──────────────────────
  let canUndo = $state(false);
  let canRedo = $state(false);

  // `IPublicWritable.subscribe` ne renvoie pas d'unsubscribe — on s'abonne
  // donc une seule fois par instance d'API (le composant Grid meurt avec sa
  // grille, donc l'abonnement vit exactement aussi longtemps que l'api).
  const subscribedHistoryApis = new WeakSet<IApi>();

  $effect(() => {
    const api = gridApi;
    if (!api || subscribedHistoryApis.has(api)) return;
    subscribedHistoryApis.add(api);
    const hist = api.getReactiveState().history;
    hist?.subscribe?.((h) => {
      canUndo = !!h?.undo;
      canRedo = !!h?.redo;
    });
  });

  function execUndo() {
    gridApi?.exec("undo").catch((e: unknown) => console.warn("[datafilter] undo:", e));
  }
  function execRedo() {
    gridApi?.exec("redo").catch((e: unknown) => console.warn("[datafilter] redo:", e));
  }

  /** Type jspreadsheet → éditeur SVAR (text/richselect/datepicker). */
  function parseOptions(raw: string | null | undefined): IOption[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => {
          if (typeof v === "object" && v !== null) {
            const o = v as Record<string, unknown>;
            return {
              id: String(o.id ?? o.value ?? ""),
              label: String(o.label ?? o.name ?? o.id ?? o.value ?? ""),
            };
          }
          return { id: String(v), label: String(v) };
        });
      }
      if (typeof parsed === "object" && parsed !== null) {
        return Object.entries(parsed).map(([id, label]) => ({ id, label: String(label) }));
      }
    } catch {}
    return [];
  }

  function toSvarEditor(col: DatagridColumnDef): IColumnEditor | undefined {
    switch (col.type) {
      case "dropdown": {
        const options = parseOptions(col.options);
        if (options.length > 0) return { type: "richselect", config: { options } };
        return undefined;
      }
      case "checkbox":
        return {
          type: "richselect",
          config: {
            options: [
              { id: "true", label: "✓" },
              { id: "false", label: "✗" },
            ],
          },
        };
      case "calendar":
        return { type: "datepicker" };
      case "text":
      case "numeric":
      case "html":
      case "color":
      default:
        return { type: "text" };
    }
  }

  /** Parse un DataHash JSON `{"c0":"x","c1":"y"}` → map {cId: valeur}. */
  function parseRow(data: string): Record<string, string> {
    try {
      const obj = JSON.parse(data);
      const out: Record<string, string> = {};
      for (const k of Object.keys(obj)) out[k] = String(obj[k] ?? "");
      return out;
    } catch {
      return {};
    }
  }

  /** Type de champ pour le widget unifié (détection simple sur les données). */
  function detectFieldType(colIndex: number, rows: IRow[]): "text" | "number" | "date" {
    let seen = 0;
    for (const row of rows) {
      const v = row[`c${colIndex}`];
      if (v === undefined || v === null || v === "") continue;
      seen++;
      if (isNaN(Number(v))) return "text";
    }
    return seen > 0 ? "number" : "text";
  }

  // ── Load ────────────────────────────────────────────────────────────────
  let loadGen = 0;
  /** Dernier déclencheur de load() (debug boucle). */
  let loadTrigger = "mount";

  // Garde anti-boucle : si un chemin d'événements ré-appelle load() en rafale
  // (ex. une notification qui se ré-émet), on coupe AVANT de geler l'interface
  // et on logge la boucle pour le debug.
  let reloadTimes: number[] = [];

  function tooManyReloads(): boolean {
    const now = Date.now();
    reloadTimes = reloadTimes.filter((t) => now - t < 5000);
    reloadTimes.push(now);
    return reloadTimes.length > 25;
  }

  async function load() {
    if (!gridId) return;
    if (tooManyReloads()) {
      console.error("datafilter load() en boucle — coupe la cascade. dernier déclencheur:", loadTrigger);
      return;
    }
    error = null;
    const gen = ++loadGen;
    loadTrigger = "load()";
    try {
      const dg = await datagridGet(gridId);
      if (gen !== loadGen) return;
      gridName = dg.name || name;
      sourceLinked = !!dg.source_spreadsheet_id;
      sourceSpreadsheetId = dg.source_spreadsheet_id ?? null;
      totalRows = dg.rows.length;
      viewColumns = dg.columns;
      const cols = dg.columns.map((c) => {
        const col: IColumn = {
          id: c.id,
          header: c.title || c.id,
          width: c.width || 120,
          resize: true,
        };
        const editor = toSvarEditor(c);
        if (editor) col.editor = editor;
        return col;
      });
      const rows = dg.rows.map((r) => ({ id: r.id, ...parseRow(r.data) }));
      await setGridData(cols, rows);
      visibleRows = rows.length;
      // Remonter les colonnes (titre + type détecté) au widget unifié.
      onFieldsChanged?.(
        cols.map((c, i) => ({
          field: typeof c.header === "string" ? c.header : `Colonne ${i + 1}`,
          type: detectFieldType(i, rows),
        })),
      );
    } catch (err) {
      if (gen === loadGen) {
        error = String(err);
      }
    } finally {
      if (gen === loadGen) loading = false;
    }
  }

  onMount(() => {
    loadTrigger = "mount";
    load();
  });

  /** Recharger quand le tableur lié notifie ses vues après un save. */
  function onGridUpdated(e: Event) {
    const detail = (e as CustomEvent<{ datagridId?: string }>).detail;
    if (detail?.datagridId && detail.datagridId === gridId) {
      loadTrigger = "azprose:datagrid-updated";
      load();
    }
  }

  onMount(() => {
    window.addEventListener("azprose:datagrid-updated", onGridUpdated);
    return () => window.removeEventListener("azprose:datagrid-updated", onGridUpdated);
  });

  // ── Filtre de pile (widget unifié, appliqué par titre) ────────────────────
  // Les règles viennent du parent (prop `rules`, une par TITRE de colonne).
  // Cette grille applique les règles dont le titre correspond à l'une de ses
  // colonnes (titre → id local `c{i}`). Le filtrage masque des lignes
  // seulement — la barre de carte et les colonnes restent.

  /** Règles effectives : titre → id local de colonne (premier titre gagnant). */
  function resolvedRules(): IFilter[] {
    const titleToId = new Map<string, string>();
    for (const c of svarColumns) {
      const title = typeof c.header === "string" ? c.header : String(c.id);
      if (!titleToId.has(title)) titleToId.set(title, String(c.id));
    }
    const out: IFilter[] = [];
    for (const r of rules) {
      const cid = titleToId.get(r.field);
      if (!cid) continue; // cette grille n'a pas cette colonne
      try {
        const parsed = JSON.parse(r.rule);
        if (typeof parsed !== "object" || parsed === null) continue;
        const rule = { field: cid, ...parsed } as IFilter;
        if (!rule.filter && !(rule.includes && rule.includes.length > 0)) continue;
        out.push(rule);
      } catch {
        /* règle corrompue — ignorée */
      }
    }
    return out;
  }

  /** Combine les règles actives en un prédicat (handlers officiels
   *  filter-store) — même logique que DatagridViewer. */
  function buildPredicate(rules: IFilter[]): (row: IRow) => boolean {
    return (row) =>
      rules.every((rule) => {
        const v = row[rule.field];
        if (rule.includes && rule.includes.length > 0) {
          return rule.includes.includes(v as any);
        }
        if (!rule.filter) return true;
        const h = getFilter(rule.filter, rule.type ?? "text");
        if (!h) return true;
        if (rule.value === undefined || rule.value === null) return true;
        if (rule.type === "number") {
          // Range filters (between/notBetween) carry an object {start, end} —
          // pass it through untouched; single values compare numerically.
          if (typeof rule.value === "object") {
            return h.handler(Number(v), rule.value);
          }
          return h.handler(Number(v), Number(rule.value));
        }
        return h.handler(v, rule.value);
      });
  }

  /** Applique le filtre de la pile (les règles du widget unifié). Un seul
   *  `filter-rows` (le Grid garde sa propre vue filtrée) + comptage manuel
   *  pour la barre de carte (filter-store n'expose pas de count). */
  function applyFilters() {
    const api = gridApi;
    if (!api) return;
    const r = resolvedRules();
    if (r.length === 0) {
      api
        .exec("filter-rows", {})
        .then(() => {
          visibleRows = svarRows.length;
        })
        .catch((e: unknown) => console.warn("[datafilter] clear filter:", e));
      return;
    }
    const pred = buildPredicate(r);
    api
      .exec("filter-rows", { filter: pred })
      .then(() => {
        visibleRows = svarRows.filter(pred).length;
      })
      .catch((e: unknown) => console.warn("[datafilter] filter:", e));
  }

  /** Application du filtre : ré-exécuté quand le Grid est prêt, quand les
   *  règles de la pile changent ou quand les données changent. */
  $effect(() => {
    void gridApi;
    void rules;
    void svarColumns;
    void svarRows;
    applyFilters();
  });

  // ── Persistance (datagrid_save_cells → table source partagée) ─────────────
  // Même contrat que le viewer tableur : on accumule les edits dans une Map
  // clé "row:col" et on flushe via l'upsert natif (O(changements)) — écriture
  // DIRECTE dans la table source partagée, aucune snapshot à mettre à jour.
  // Un événement `azprose:spreadsheet-updated` dit au viewer tableur de se
  // recharger. Anti-chevauchement saving/pendingFlush : un flush en cours
  // re-queue au lieu d'empiler ; le pending n'est vidé qu'après succès (un
  // échec IPC conserve les edits pour le prochain essai).

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingCellChanges = new Map<string, CellChange>();
  let saving = false;
  let pendingFlush = false;

  function normalizeCellValue(v: string | number | Date): string {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v ?? "");
  }

  function handleUpdateCell(p: UpdateCellPayload) {
    if (suppressGridUpdates) return;
    const rowIndex = Number(String(p.id).replace(/^r/, ""));
    const colIndex = Number(String(p.column).replace(/^c/, ""));
    if (isNaN(rowIndex) || isNaN(colIndex) || rowIndex < 0 || colIndex < 0) return;
    const value = normalizeCellValue(p.value);
    const key = `${rowIndex}:${colIndex}`;
    // Skip d'égalité : un `update-cell` fantôme (re-init du Grid pendant un
    // rechargement du pont live) peut rejouer une valeur déjà en attente —
    // ne pas re-queuer une sauvegarde redondante. On ne compare PAS avec
    // `svarRows` (la prop est périmée après un edit : le DataStore du Grid
    // garde ses propres copies) — cela écraserait un vrai edit de l'utilisateur.
    if (pendingCellChanges.get(key)?.value === value) return;
    pendingCellChanges.set(key, {
      row_index: rowIndex,
      col_index: colIndex,
      value,
    });
    debouncedSave();
  }

  function debouncedSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      flushChanges();
    }, 500);
  }

  async function flushChanges() {
    if (saving) {
      pendingFlush = true;
      return;
    }
    saving = true;
    try {
      const changes = [...pendingCellChanges.values()];
      if (changes.length === 0) return;
      await datagridSaveCells(gridId, changes);
      // Ne retirer que les edits sauvés — un edit arrivé pendant l'IPC en
      // vol reste en attente pour le prochain flush.
      for (const ch of changes) {
        pendingCellChanges.delete(`${ch.row_index}:${ch.col_index}`);
      }
      // Le viewer tableur (s'il est ouvert) doit se recharger.
      if (sourceSpreadsheetId) {
        window.dispatchEvent(new CustomEvent("azprose:spreadsheet-updated", {
          detail: { spreadsheetId: sourceSpreadsheetId },
        }));
      }
    } catch (err) {
      console.error("[datafilter] save failed:", err);
    } finally {
      saving = false;
      if (pendingFlush) {
        pendingFlush = false;
        flushChanges();
      }
    }
  }

  onDestroy(() => {
    // Filet de fermeture : flusher les edits encore en attente.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // Largeurs de vue en attente (auto-fit / resize) : flush immédiat.
    if (widthSaveTimer) {
      clearTimeout(widthSaveTimer);
      flushWidths();
    }
    if (pendingCellChanges.size > 0) flushChanges();
  });

  // ── Edit dans Spreadsheet (barre de carte) ────────────────────────────────
  // Ouvre le tableur source dans le SIDE panel (règle : le panneau principal
  // est réservé exclusivement à CodeMirror ; toute vue d'outil s'ouvre en
  // side). L'écoute vit dans app.svelte ("azprose:datagrid-edit-in-spreadsheet").

  function editInSpreadsheet() {
    if (!sourceSpreadsheetId) return;
    window.dispatchEvent(new CustomEvent("azprose:datagrid-edit-in-spreadsheet", {
      detail: { spreadsheetId: sourceSpreadsheetId, name: gridName || "Tableur" },
    }));
  }

  // ── Redimensionnement manuel de la HAUTEUR de carte ───────────────────────
  // Poignée de drag en bas de carte (refonte scroll pile) : l'utilisateur
  // fixe une hauteur en pixels par glisser (ou clavier), ou revient à la
  // hauteur automatique (hauteur naturelle si contenu ≤ ⅓ de la pile, sinon
  // cap ⅓ — cf. CSS `.dfg`). `cardHeight = null` = auto ; sinon hauteur fixe
  // clippée par `max-height: 33.333%` (le Grid SVAR scrolle alors en interne,
  // scrollbar masquée). Le drag suit la souris sur `window` (mousemove +
  // mouseup) pour ne pas perdre le geste hors de la carte ; le ResizeObserver
  // interne SVAR (`use:onresize` sur `.wx-grid`) re-rend les lignes virtuelles
  // pendant le drag.

  const RESIZE_MIN_H = 80;
  const RESIZE_STEP = 8;

  /** Hauteur fixe de la carte (px) — `null` = hauteur automatique. */
  let cardHeight = $state<number | null>(null);
  let resizing = $state(false);

  /** Card `max-height` calculée (en px) — résout `max-height: 33.333%`. */
  function cardMaxHeight(card: HTMLElement): number {
    const mh = parseFloat(getComputedStyle(card).maxHeight);
    return Number.isFinite(mh) && mh > 0 ? mh : 400;
  }

  function startResize(e: MouseEvent) {
    e.preventDefault();
    const card = (e.currentTarget as HTMLElement).closest<HTMLElement>(".dfg");
    if (!card) return;
    const startY = e.clientY;
    const startH = card.getBoundingClientRect().height;
    const max = cardMaxHeight(card);
    resizing = true;
    const move = (ev: MouseEvent) => {
      const h = startH + (ev.clientY - startY);
      cardHeight = Math.round(Math.min(max, Math.max(RESIZE_MIN_H, h)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      resizing = false;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  /** Double-clic sur la poignée : retour à la hauteur automatique. */
  function resetHeight() {
    cardHeight = null;
  }

  /** Accessibilité clavier (focusable, role="separator") : ↑/↓ ajustent la
   *  hauteur par pas, Home/End = min/max, Del/Backspace = auto. */
  function onResizeKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      cardHeight = null;
      (e.currentTarget as HTMLElement).blur();
      return;
    }
    if (!["ArrowUp", "ArrowDown", "Home", "End", "Delete", "Backspace"].includes(e.key)) return;
    e.preventDefault();
    const card = (e.currentTarget as HTMLElement).closest<HTMLElement>(".dfg");
    if (!card) return;
    const max = cardMaxHeight(card);
    const base = cardHeight ?? card.getBoundingClientRect().height;
    switch (e.key) {
      case "ArrowUp":
        cardHeight = Math.round(Math.max(RESIZE_MIN_H, base - RESIZE_STEP));
        break;
      case "ArrowDown":
        cardHeight = Math.round(Math.min(max, base + RESIZE_STEP));
        break;
      case "Home":
        cardHeight = RESIZE_MIN_H;
        break;
      case "End":
        cardHeight = max;
        break;
      case "Delete":
      case "Backspace":
        cardHeight = null;
        break;
    }
  }
</script>

<div
  class="dfg"
  class:dfg--resizing={resizing}
  class:dfg--resized={cardHeight !== null}
  style:height={cardHeight !== null ? `${cardHeight}px` : undefined}
>
  <div class="dfg__head">
    <span class="dfg__icon material-symbols-outlined">table_view</span>
    <span class="dfg__name" title={gridName}>{gridName}</span>
    {#if sourceLinked}
      <span class="dfg__badge">liée au tableur</span>
    {/if}
    <span class="dfg__meta">
      {visibleRows} / {totalRows} ligne{totalRows !== 1 ? "s" : ""}
      · {svarColumns.length} colonne{svarColumns.length !== 1 ? "s" : ""}
    </span>
    <div class="dfg__spacer"></div>
    <button
      type="button"
      class="dfg__btn"
      title="Annuler (Ctrl+Z)"
      disabled={!canUndo}
      onclick={execUndo}
      aria-label="Annuler"
    >
      <span class="material-symbols-outlined">undo</span>
    </button>
    <button
      type="button"
      class="dfg__btn"
      title="Rétablir (Ctrl+Y)"
      disabled={!canRedo}
      onclick={execRedo}
      aria-label="Rétablir"
    >
      <span class="material-symbols-outlined">redo</span>
    </button>
    <button
      type="button"
      class="dfg__btn dfg__btn--text"
      title="Ouvrir le tableur source dans le panneau latéral"
      onclick={editInSpreadsheet}
    >
      <span class="material-symbols-outlined">table_chart</span>
      <span>Edit dans Spreadsheet</span>
    </button>
    {#if onRemove}
      <button type="button" class="dfg__btn dfg__btn--x" title="Retirer de la pile" onclick={onRemove} aria-label="Retirer de la pile">
        <span class="material-symbols-outlined">close</span>
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="dfg__state">Chargement…</div>
  {:else if error}
    <div class="dfg__state dfg__state--error">{error}</div>
  {:else}
    <div class="dfg__grid">
      <SvarGrid
        data={svarRows}
        columns={svarColumns}
        undo={true}
        reorder={false}
        sizes={GRID_SIZES}
        onReady={handleReady}
        onUpdateCell={handleUpdateCell}
        onresizecolumn={handleColumnResize}
      />
    </div>
  {/if}

  <!-- Poignée de redimensionnement : `role="separator"` + tabindex rendent
       l'interaction clavier légitime (↑/↓/Home/End, cf. onResizeKeyDown) —
       le plugin a11y ne la reconnaît pas comme interactive. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="dfg__resize"
    role="separator"
    aria-orientation="horizontal"
    aria-label="Redimensionner la hauteur de la carte (double-clic : hauteur auto)"
    tabindex="0"
    onmousedown={startResize}
    ondblclick={resetHeight}
    onkeydown={onResizeKeyDown}
  ></div>
</div>

<style>
  .dfg {
    display: flex;
    flex-direction: column;
    min-height: 0;
    position: relative;
    border: 1px solid var(--border, #ddd);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg, #fff);
    /* Refonte scroll pile : hauteur NATURELLE (contenu) quand elle tient
       dans le tiers de la pile visible, sinon cap ⅓ (33.333% du scrollport
       défini `.dfs__stack`). `flex-shrink: 0` interdit l'écrasement des
       cartes — l'ascenseur EXTÉRIEUR de la pile fait le scrolling ; le Grid
       scrolle en interne (scrollbar masquée) quand la carte est cappée ou
       redimensionnée. Une hauteur manuelle (style inline `height`, cf.
       `cardHeight`) prime sur `height: auto` mais reste clippée par le cap. */
    height: auto;
    max-height: 33.333%;
    flex-shrink: 0;
  }

  .dfg--resizing {
    cursor: ns-resize;
    user-select: none;
  }

  .dfg--resizing .dfg__resize {
    background: var(--accent, #4a90d9);
  }

  .dfg__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--border, #ddd);
    background: var(--surface, #fafafa);
    font-family: var(--font-ui, sans-serif);
    font-size: 12px;
    flex-shrink: 0;
    min-height: 30px;
  }

  .dfg__icon {
    font-size: 17px;
    color: var(--accent, #4a90d9);
  }

  .dfg__name {
    font-weight: 600;
    color: var(--fg, #222);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dfg__badge {
    font-size: 10px;
    font-weight: 500;
    padding: 1px 7px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent, #4a90d9) 14%, transparent);
    color: var(--accent, #4a90d9);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .dfg__meta {
    font-size: 11px;
    color: var(--muted, #888);
    white-space: nowrap;
  }

  .dfg__spacer {
    flex: 1;
  }

  .dfg__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 22px;
    height: 22px;
    padding: 0 5px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted, #888);
    font-family: var(--font-ui, sans-serif);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .dfg__btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--fg, #222) 8%, transparent);
    color: var(--fg, #222);
  }

  .dfg__btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .dfg__btn .material-symbols-outlined {
    font-size: 16px;
    line-height: 1;
  }

  .dfg__btn--text {
    border: 1px solid var(--border, #ddd);
    background: var(--bg, #fff);
    color: var(--fg-muted, #666);
  }

  .dfg__btn--text:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent, #4a90d9) 8%, transparent);
    color: var(--accent, #4a90d9);
    border-color: var(--accent, #4a90d9);
  }

  .dfg__btn--x:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-error, #e53935) 10%, transparent);
    color: var(--color-error, #e53935);
  }

  .dfg__state {
    padding: 16px;
    font-family: var(--font-ui, sans-serif);
    font-size: 13px;
    color: var(--muted, #888);
    text-align: center;
  }

  .dfg__state--error {
    color: var(--color-error, #e53935);
  }

  .dfg__grid {
    /* Remplit l'espace restant après l'en-tête : dans le cas auto (hauteur
       naturelle), la chaîne de hauteur flex se résout en contenu et le Grid
       affiche toutes les lignes ; dans le cas cappé/manuel, `min-height: 0`
       borne la chaîne et la grille scrolle en interne (lignes virtuelles,
       scrollbar masquée). `overflow: hidden` coupe le contenu sous la
       poignée de resize. */
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .dfg__resize {
    flex-shrink: 0;
    height: 6px;
    cursor: ns-resize;
    touch-action: none;
    background: linear-gradient(
      to right,
      transparent 0%,
      color-mix(in srgb, var(--border, #ddd) 55%, transparent) 8%,
      color-mix(in srgb, var(--border, #ddd) 55%, transparent) 92%,
      transparent 100%
    );
    background-size: 100% 2px;
    background-repeat: no-repeat;
    background-position: center;
    transition: background-color 0.12s;
  }

  .dfg__resize:hover {
    background-color: color-mix(in srgb, var(--accent, #4a90d9) 12%, transparent);
  }

  .dfg__resize:focus-visible {
    outline: 2px solid var(--accent, #4a90d9);
    outline-offset: -2px;
  }
</style>
