<script lang="ts">
  // ── DataFilter (« Filtre de données ») ─────────────────────────────────────
  // Vue « pile » des datagrids de la db (ex-« Recherche dans la base de
  // données ») :
  //  - toolbar TOUJOURS visible : FILTRE UNIFIÉ (widget unique pour toute la
  //    pile — une règle par TITRE de colonne, appliquée à chaque grille qui
  //    possède cette colonne, combinées en ET, persistées dans la table
  //    `datagrid_stack_rules`) + bouton « Ouvrir » qui reste fonctionnel en
  //    multisélection et enchaîne sur l'empilement
  //  - page d'accueil (style Spreadsheet) quand aucun tableau n'est chargé,
  //    avec des boutons d'action
  //  - les tableaux chargés s'affichent empilés (DataFilterGrid), chacun
  //    identifié par sa barre de carte (nom, badge, undo/redo, « Edit dans
  //    Spreadsheet », retirer) ; le filtre masque des lignes mais conserve
  //    la structure de la pile (barres de carte + colonnes)
  //  - le widget unifié est composé de l'union des colonnes de toutes les
  //    grilles (titre → type, remontées par chaque item via onFieldsChanged) ;
  //    chaque grille applique les règles qui la concernent (titre trouvé)
  //  - modèle v8 : chaque datagrid est une VUE sur un tableur source — les
  //    écritures vont directement dans la table partagée spreadsheet_cells
  //    (datagrid_save_cells), les lectures sont live (JOIN).
  //  - le bouton « Ouvrir dans le filtre de données » du tableur ouvre cette
  //    vue avec le tableau déjà chargé — l'utilisateur peut en ajouter d'autres.

  // Police auto-hébergée pour les icônes `material-symbols-outlined` de ce
  // composant ET de DataFilterGrid.svelte (son seul enfant — CSS globale une
  // fois chargée). Restriction posée vague 1 phase 1.7 : la police n'est
  // importée QUE par ses consommateurs directs, jamais globalement — mais
  // DataFilter en est un au même titre que Spreadsheet.svelte, et ne
  // l'importait pas : les icônes n'apparaissaient que « par chance », si un
  // tableur était aussi ouvert dans la même fenêtre (bug signalé en test).
  import "@/styles/material-symbols.css";
  import { onMount } from "svelte";
  import { Modal, RichSelect } from "@svar-ui/svelte-core";
  import { Button } from "@/components/primitives";
  import DataFilterGrid from "./DataFilterGrid.svelte";
  import {
    datagridList,
    datagridFindBySource,
    datagridCreateFromSpreadsheet,
    datagridStackRulesGet,
    datagridStackRulesSave,
  } from "@/datagrid/store";
  import { spreadsheetList } from "@/spreadsheet/store";
  import type { IField } from "@svar-ui/filter-store";
  import type { StackFilterField, StackFilterRule } from "@/datagrid/types";

  let {
    datafilterIds = [],
  }: {
    datafilterIds?: string[];
  } = $props();

  // ── Pile de tableaux chargés ─────────────────────────────────────────────
  interface StackItem {
    id: string;
    name: string;
  }
  let stack: StackItem[] = $state([]);
  let initialLoading = $state(true);

  function addGrids(ids: string[], nameOf: (id: string) => string) {
    for (const id of ids) {
      if (!stack.some((s) => s.id === id)) {
        stack = [...stack, { id, name: nameOf(id) }];
      }
    }
  }

  function removeGrid(id: string) {
    stack = stack.filter((s) => s.id !== id);
  }

  // ── Filtre unifié (widget unique pour toute la pile) ─────────────────────
  // Règles GLOBALES à la pile, une par TITRE de colonne. Chaque grille
  // empilée applique les règles dont elle possède la colonne. Persistées dans
  // `datagrid_stack_rules` (replace-all snapshot) — elles survivent à la
  // fermeture de la pile.
  //
  // Éditeur de règles « maison » (style Obsidian) : lignes Champ / Opérateur /
  // Valeur(s) modifiables en direct, aperçu appliqué à chaque frappe. Les
  // identifiants d'opérateurs et les handlers viennent du filter-store officiel
  // (@svar-ui/filter-store) — DataFilterGrid applique les mêmes handlers.
  let filterOpen = $state(false);
  /** Map réactive ($state proxy les Maps — set/delete/clear déclenchent le
   *  re-render et la revalidation des items). */
  let stackRules = $state(new Map<string, StackFilterRule>());
  /** Union des colonnes de toutes les grilles de la pile : titre → type. */
  let stackFields = $state(new Map<string, "text" | "number" | "date">());
  let filterTimer: ReturnType<typeof setTimeout> | null = null;

  const filterCount = $derived(stackRules.size);

  /** Champs du filtre (union sur toute la pile). */
  const filterFields = $derived<IField[]>(
    [...stackFields.entries()].map(([field, type]) => ({
      id: field,
      label: field,
      type,
    })),
  );

  // ── Édition locale des règles ────────────────────────────────────────────
  interface DraftRule {
    field: string;
    operator: string; // id d'un opérateur filter-store
    type: "text" | "number";
    value: string;
    value2: string; // borne haute pour between/notBetween
  }
  interface OpDef {
    id: string;
    label: string;
    range?: boolean; // prend deux valeurs (entre / hors de)
  }

  /** Opérateurs autorisés selon le type (les ids existent dans le
   *  filter-store, types déclarés dans getFilter). */
  const TEXT_OPS: OpDef[] = [
    { id: "contains", label: "contient" },
    { id: "notContains", label: "ne contient pas" },
    { id: "beginsWith", label: "commence par" },
    { id: "notBeginsWith", label: "ne commence pas par" },
    { id: "endsWith", label: "finit par" },
    { id: "notEndsWith", label: "ne finit pas par" },
    { id: "equal", label: "est égal à" },
    { id: "notEqual", label: "n'est pas égal à" },
  ];
  const NUMBER_OPS: OpDef[] = [
    { id: "greater", label: ">" },
    { id: "greaterOrEqual", label: "≥" },
    { id: "less", label: "<" },
    { id: "lessOrEqual", label: "≤" },
    { id: "equal", label: "=" },
    { id: "notEqual", label: "≠" },
    { id: "between", label: "entre", range: true },
    { id: "notBetween", label: "hors de", range: true },
  ];

  function operatorsFor(type: "text" | "number"): OpDef[] {
    return type === "number" ? NUMBER_OPS : TEXT_OPS;
  }

  function isRange(operator: string): boolean {
    return operator === "between" || operator === "notBetween";
  }

  let draftRules = $state<DraftRule[]>([]);

  /** Une ligne de brouillon porte-t-elle une règle complète ? */
  const draftActive = $derived(
    draftRules.some((d) => {
      if (!d.field) return false;
      if (isRange(d.operator)) return d.value !== "" || d.value2 !== "";
      return d.value !== "";
    }),
  );

  function newDraftRule(): DraftRule {
    const field = filterFields[0]?.id ?? "";
    const type: "text" | "number" = field && stackFields.get(field) === "number" ? "number" : "text";
    return {
      field,
      operator: type === "number" ? "equal" : "contains",
      type,
      value: "",
      value2: "",
    };
  }

  function safeParse(json: string): Record<string, unknown> | null {
    try {
      const v = JSON.parse(json);
      return v && typeof v === "object" ? v : null;
    } catch {
      return null;
    }
  }

  /** Règle persistée (JSON opaque sans field) → ligne d'édition. */
  function draftFromRule(r: StackFilterRule): DraftRule {
    const parsed = safeParse(r.rule) ?? {};
    const type: "text" | "number" = parsed.type === "number" ? "number" : "text";
    const rawOp = typeof parsed.filter === "string" ? parsed.filter : "equal";
    // Garde : un opérateur hérité (type date, etc.) qui n'existe plus pour ce
    // type retombe sur l'opérateur par défaut au lieu d'un select sans option.
    const ops = operatorsFor(type);
    const operator = ops.some((o) => o.id === rawOp) ? rawOp : ops[0].id;
    const v = parsed.value;
    if (isRange(operator)) {
      const o =
        v && typeof v === "object" ? (v as { start?: unknown; end?: unknown }) : {};
      return {
        field: r.field,
        operator,
        type,
        value: o.start == null ? "" : String(o.start),
        value2: o.end == null ? "" : String(o.end),
      };
    }
    return {
      field: r.field,
      operator,
      type,
      value: v == null ? "" : String(v),
      value2: "",
    };
  }

  /** Ligne d'édition → JSON persisté (mêmes clés que l'ancien FilterEditor :
   *  { filter, type, value }) — les bornes vides deviennent null (le handler
   *  between teste e.start/e.end == null pour ignorer la borne). */
  function serializeDraft(d: DraftRule): string {
    const out: Record<string, unknown> = { filter: d.operator, type: d.type };
    if (isRange(d.operator)) {
      out.value = {
        start: d.value === "" ? null : d.type === "number" ? Number(d.value) : d.value,
        end: d.value2 === "" ? null : d.type === "number" ? Number(d.value2) : d.value2,
      };
    } else if (d.value !== "") {
      out.value = d.type === "number" ? Number(d.value) : d.value;
    }
    return JSON.stringify(out);
  }

  /** Aperçu en direct : reconstruit stackRules depuis le brouillon à chaque
   *  frappe (lignes incomplètes ignorées). */
  function applyDraftToRules() {
    const next = new Map<string, StackFilterRule>();
    for (const d of draftRules) {
      if (!d.field) continue;
      if (isRange(d.operator)) {
        if (d.value === "" && d.value2 === "") continue;
      } else if (d.value === "") {
        continue;
      }
      next.set(d.field, { field: d.field, rule: serializeDraft(d) });
    }
    stackRules = next;
    persistStackRules();
  }

  /** Traque les mutations du brouillon (lecture profonde pour la réactivité
   *  $state) et applique l'aperçu tant que le panneau est ouvert. */
  $effect(() => {
    if (!filterOpen) return;
    for (const d of draftRules) {
      void d.field;
      void d.operator;
      void d.type;
      void d.value;
      void d.value2;
    }
    applyDraftToRules();
  });

  function openFilterPanel() {
    if (!filterOpen) {
      draftRules = [...stackRules.values()].map(draftFromRule);
      if (draftRules.length === 0) draftRules = [newDraftRule()];
    }
    filterOpen = !filterOpen;
  }

  function addDraftRule() {
    draftRules = [...draftRules, newDraftRule()];
  }

  function removeDraftRule(index: number) {
    draftRules = draftRules.filter((_, i) => i !== index);
    if (draftRules.length === 0) draftRules = [newDraftRule()];
  }

  function clearDraftRules() {
    draftRules = [newDraftRule()];
  }

  function onDraftFieldChange(index: number, field: string) {
    const d = draftRules[index];
    if (!d || d.field === field) return;
    const type: "text" | "number" = stackFields.get(field) === "number" ? "number" : "text";
    const ops = operatorsFor(type);
    const operator = ops.some((o) => o.id === d.operator) ? d.operator : ops[0].id;
    draftRules[index] = { ...d, field, type, operator, value: "", value2: "" };
    draftRules = [...draftRules];
  }

  function onDraftOperatorChange(index: number, operator: string) {
    const d = draftRules[index];
    if (!d || d.operator === operator) return;
    draftRules[index] = { ...d, operator, value: "", value2: "" };
    draftRules = [...draftRules];
  }

  /** Persistance débouncée des règles (replace-all de la pile). */
  function persistStackRules() {
    if (filterTimer) clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      filterTimer = null;
      datagridStackRulesSave([...stackRules.values()]).catch((e: unknown) =>
        console.warn("[datafilter] save stack rules failed:", e),
      );
    }, 400);
  }

  /** Les grilles remontent leurs colonnes (titre + type détecté) après leur
   *  chargement — le widget unifié agrège par union (premier type gagnant). */
  function handleFieldsChanged(fields: StackFilterField[]) {
    let changed = false;
    for (const f of fields) {
      if (!stackFields.has(f.field)) {
        stackFields.set(f.field, f.type);
        changed = true;
      }
    }
    if (changed) {
      // Réassigner pour forcer la réactivité du $state Map.
      stackFields = new Map(stackFields);
    }
  }

  function clearStackRules() {
    stackRules.clear();
    stackRules = new Map();
    persistStackRules();
  }

  async function loadStackRules() {
    try {
      const stored = await datagridStackRulesGet();
      const next = new Map(stored.map((r) => [r.field, r]));
      // Réconcilier avec les champs connus : garder les règles dont la colonne
      // existe encore quelque part (les champs sont déjà chargés avant ? non —
      // les règles chargent dès l'ouverture, les champs arrivent avec les
      // grilles). On garde tout ; l'application par grille est tolérante.
      stackRules = next;
    } catch (err) {
      console.error("[datafilter] stack rules load failed:", err);
    }
  }

  // ── Dialogue « Ouvrir » (multisélection) ─────────────────────────────────
  // The dialog lists every table in the db: spreadsheets ("tableur" rows).
  // Datagrids are VIEWS over a spreadsheet (v8) — they are not listed
  // separately; their spreadsheet row stands for them, and loading it resolves
  // to the linked grid (creating it on first use).
  interface SearchableTable {
    kind: "spreadsheet" | "datagrid";
    id: string;
    name: string;
  }
  let openDialog = $state(false);
  let available: SearchableTable[] = $state([]);
  /** spreadsheetId → linked grid id (resolved while the dialog opens). */
  let linkedGridId = new Map<string, string | null>();
  let selected = $state<Set<string>>(new Set());
  let dialogLoading = $state(false);
  let dialogError = $state<string | null>(null);
  /** Filtre par nom (même comportement que le dialogue « Gérer les tableurs » :
   *  insensible à la casse, appliqué à la liste résolue). */
  let filter = $state("");

  const filteredAvailable = $derived(
    filter
      ? available.filter((g) => g.name.toLowerCase().includes(filter.toLowerCase()))
      : available,
  );

  /** The grid id backing a dialog row (linked grid for a spreadsheet row). */
  function gridIdFor(g: SearchableTable): string {
    if (g.kind === "spreadsheet") return linkedGridId.get(g.id) ?? g.id;
    return g.id;
  }

  function alreadyLoaded(g: SearchableTable): boolean {
    return stack.some((s) => s.id === gridIdFor(g));
  }

  async function openOpenDialog() {
    openDialog = true;
    selected = new Set();
    filter = "";
    dialogError = null;
    dialogLoading = true;
    try {
      const [sheets, grids] = await Promise.all([spreadsheetList(), datagridList()]);
      const rows: SearchableTable[] = [];
      for (const s of sheets) {
        // Never show the unsaved "Nouveau tableur" create entries
        if (s.name === "Nouveau tableur") continue;
        rows.push({ kind: "spreadsheet", id: s.id, name: s.name });
      }
      for (const g of grids) {
        // v8 : toutes les grids sont des vues liées — représentées par leur
        // ligne tableur. Garde défensive pour d'hypothétiques orphelines.
        if (g.source_spreadsheet_id) continue;
        rows.push({ kind: "datagrid", id: g.id, name: g.name });
      }
      rows.sort((a, b) => a.name.localeCompare(b.name));
      available = rows;
      // Resolve linked grids so "déjà chargé" works for spreadsheet rows
      const nextLinks = new Map<string, string | null>();
      for (const row of rows) {
        if (row.kind !== "spreadsheet") continue;
        const meta = await datagridFindBySource(row.id);
        nextLinks.set(row.id, meta?.id ?? null);
      }
      linkedGridId = nextLinks;
    } catch (err) {
      dialogError = String(err);
    } finally {
      dialogLoading = false;
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  /** Resolve the grid backing a dialog row: datagrids are direct, spreadsheets
   *  go through their linked grid (created on first use). */
  async function resolveGridId(row: SearchableTable): Promise<{ id: string; name: string }> {
    if (row.kind === "datagrid") return { id: row.id, name: row.name };
    const meta = await datagridFindBySource(row.id);
    if (meta) return { id: meta.id, name: meta.name };
    const newId = await datagridCreateFromSpreadsheet(`dg-${row.id}`, row.name, row.id);
    return { id: newId, name: row.name };
  }

  async function handleLoadSelection() {
    const chosen = [...selected];
    if (chosen.length === 0) return;
    dialogLoading = true;
    dialogError = null;
    try {
      for (const row of available) {
        if (!chosen.includes(row.id)) continue;
        const resolved = await resolveGridId(row);
        if (!stack.some((s) => s.id === resolved.id)) {
          stack = [...stack, { id: resolved.id, name: resolved.name }];
        }
      }
      openDialog = false;
      selected = new Set();
    } catch (err) {
      dialogError = String(err);
    } finally {
      dialogLoading = false;
    }
  }

  onMount(async () => {
    // Initial ids (session restore or « Ouvrir dans le filtre de données »)
    // are loaded directly into the stack; ids whose grid no longer exists are
    // silently dropped.
    if (datafilterIds.length > 0) {
      try {
        const all = await datagridList();
        const byId = new Map(all.map((a) => [a.id, a.name]));
        const alive = datafilterIds.filter((id) => byId.has(id));
        addGrids(alive, (id) => byId.get(id) ?? "Tableau");
      } catch (err) {
        console.error("[datafilter] failed to restore stack:", err);
      }
    }
    await loadStackRules();
    initialLoading = false;
  });
</script>

{#if initialLoading}
  <div class="dfs-loading">Chargement…</div>
{:else}
  <div class="dfs">
    <!-- ── Toolbar (toujours visible) ── -->
    <div class="dfs__toolbar">
      <Button data-tooltip="Ouvrir des tableaux (multisélection)" onclick={openOpenDialog}>
        {#snippet icon()}
          <i class="wxi-folder-open" style="font-size:14px"></i>
        {/snippet}
        Ouvrir
      </Button>
      {#if stack.length > 0}
        <Button data-tooltip="Vider la pile" onclick={() => { stack = []; }}>
          {#snippet icon()}
            <i class="wxi-trash2" style="font-size:14px"></i>
          {/snippet}
          Tout retirer
        </Button>
      {/if}
      <div class="dfs__spacer"></div>
      <button
        type="button"
        class="dfs__filter-btn"
        class:dfs__filter-btn--active={filterOpen || filterCount > 0}
        title={filterCount > 0 ? `Filtres actifs (${filterCount})` : "Filtrer toute la pile"}
        aria-label="Filtrer toute la pile"
        onclick={openFilterPanel}
      >
        <span class="material-symbols-outlined">filter_alt</span>
        {#if filterCount > 0}
          <span class="dfs__filter-badge">{filterCount}</span>
        {/if}
      </button>
      <span class="dfs__count">{stack.length} tableau{stack.length !== 1 ? "x" : ""}</span>
    </div>

    {#if filterOpen}
      <div class="dfs__filter-pop">
        <div class="dfs__filter-pop__head">
          <span>Filtres de la pile</span>
          <div class="dfs__filter-pop__head-actions">
            {#if draftActive}
              <button type="button" class="dfs__link" onclick={clearDraftRules}>Tout effacer</button>
            {/if}
            <button type="button" class="dfs__link" onclick={() => { filterOpen = false; }}>Fermer</button>
          </div>
        </div>

        {#if stack.length === 0}
          <p class="dfs__filter-pop__hint">
            Chargez des tableaux pour filtrer : les règles s'appliquent à toute
            la pile par colonne (titre).
          </p>
        {/if}

        <div class="dfs__rules">
          {#each draftRules as d, i (i)}
            {@const ops = operatorsFor(d.type)}
            {@const range = isRange(d.operator)}
            {@const inputType = d.type === "number" ? "number" : "text"}
            <div class="dfs__rule" class:dfs__rule--range={range}>
              <RichSelect
                value={d.field}
                options={filterFields.map((f) => ({ id: f.id, label: f.label }))}
                placeholder="— colonne —"
                onchange={(ev) => onDraftFieldChange(i, String(ev.value))}
              />
              <RichSelect
                value={d.operator}
                options={ops.map((o) => ({ id: o.id, label: o.label }))}
                onchange={(ev) => onDraftOperatorChange(i, String(ev.value))}
              />
              <input
                class="dfs__rule-value"
                type={inputType}
                placeholder={range ? "de" : "valeur"}
                bind:value={d.value}
              />
              {#if range}
                <input
                  class="dfs__rule-value"
                  type={inputType}
                  placeholder="à"
                  bind:value={d.value2}
                />
              {/if}
              <button
                type="button"
                class="dfs__rule-x"
                onclick={() => removeDraftRule(i)}
                aria-label="Retirer la règle"
              >×</button>
            </div>
          {/each}
        </div>

        <button type="button" class="dfs__add" onclick={addDraftRule}>
          <span class="material-symbols-outlined">add</span>
          Ajouter un filtre
        </button>
      </div>
    {/if}

    {#if stack.length === 0}
      <!-- ── Page d'accueil (aucun tableau chargé) ── -->
      <div class="dfs__empty">
        <div class="dfs__empty-frame">
          <span class="material-symbols-outlined dfs__empty-icon">filter_alt</span>
          <h3 class="dfs__empty-title">Filtre de données</h3>
          <p class="dfs__empty-desc">
            Filtrez tous vos tableaux : chargez-en un ou plusieurs, ils
            s'affichent empilés et le filtre unifié s'applique à tous.
          </p>
          <div class="dfs__empty-actions">
            <button type="button" class="dfs__empty-btn dfs__empty-btn--primary" onclick={openOpenDialog}>
              <span class="material-symbols-outlined">folder_open</span>
              Ouvrir des tableaux
            </button>
            {#if filterCount > 0}
              <button type="button" class="dfs__empty-btn dfs__empty-btn--secondary" onclick={clearStackRules}>
                <span class="material-symbols-outlined">filter_alt_off</span>
                Effacer le filtre ({filterCount})
              </button>
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <!-- ── Pile de tableaux ── -->
      <div class="dfs__stack">
        {#each stack as item (item.id)}
          <DataFilterGrid
            gridId={item.id}
            name={item.name}
            rules={[...stackRules.values()]}
            onFieldsChanged={handleFieldsChanged}
            onRemove={() => removeGrid(item.id)}
          />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<!-- ── Dialogue Ouvrir (multisélection) ── -->
{#if openDialog}
  <Modal title="Ouvrir des tableaux" oncancel={() => { openDialog = false; }} buttons={[]}>
    <div class="dfs__dialog">
      {#if dialogLoading}
        <div class="dfs__dialog-state">Chargement…</div>
      {:else if dialogError}
        <div class="dfs__dialog-state dfs__dialog-state--error">{dialogError}</div>
      {:else if available.length === 0}
        <div class="dfs__dialog-state">Aucun tableau dans la base.</div>
      {:else}
        <div class="dfs__dialog-filter">
          <input
            type="text"
            class="dfs__dialog-filter__input"
            placeholder="Filtrer par nom…"
            bind:value={filter}
          />
        </div>
        {#if filteredAvailable.length === 0}
          <p class="dfs__dialog-state">Aucun résultat.</p>
        {:else}
          <ul class="dfs__dialog-list">
            {#each filteredAvailable as g}
              <li class="dfs__dialog-item">
                <label class="dfs__dialog-row">
                  <input
                    type="checkbox"
                    checked={selected.has(g.id)}
                    disabled={alreadyLoaded(g)}
                    onchange={() => toggleSelect(g.id)}
                  />
                  {#if g.kind === "spreadsheet"}
                    <span class="material-symbols-outlined dfs__dialog-icon">grid_on</span>
                  {:else}
                    <span class="material-symbols-outlined dfs__dialog-icon">table_view</span>
                  {/if}
                  <span class="dfs__dialog-name">{g.name}</span>
                  {#if g.kind === "spreadsheet"}
                    <span class="dfs__dialog-badge">tableur</span>
                  {/if}
                  {#if alreadyLoaded(g)}
                    <span class="dfs__dialog-loaded">déjà chargé</span>
                  {/if}
                </label>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
      <div class="dfs__dialog-actions">
        <Button onclick={() => { openDialog = false; }}>Annuler</Button>
        <Button
          variant="solid"
          disabled={selected.size === 0 || dialogLoading}
          onclick={handleLoadSelection}
        >
          {dialogLoading ? "Chargement…" : `Charger la sélection (${selected.size})`}
        </Button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  .dfs-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 24px;
    font-family: var(--font-ui, sans-serif);
    font-size: 14px;
    color: var(--muted, #888);
  }

  .dfs {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Toolbar ── */
  .dfs__toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    padding: 4px 10px;
    border-bottom: 1px solid var(--border, #ddd);
    background: var(--surface, #fafafa);
    font-family: var(--font-ui, sans-serif);
    min-height: 36px;
  }

  .dfs__count {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 9px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--accent, #4a90d9) 14%, transparent);
    color: var(--accent, #4a90d9);
    white-space: nowrap;
  }

  .dfs__spacer {
    flex: 1;
  }

  .dfs__filter-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border, #ddd);
    border-radius: 6px;
    background: var(--bg, #fff);
    color: var(--muted, #888);
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .dfs__filter-btn:hover {
    border-color: var(--accent, #4a90d9);
    color: var(--fg, #222);
  }

  .dfs__filter-btn--active {
    background: color-mix(in srgb, var(--accent, #4a90d9) 14%, transparent);
    border-color: var(--accent, #4a90d9);
    color: var(--accent, #4a90d9);
  }

  .dfs__filter-btn .material-symbols-outlined {
    font-size: 18px;
  }

  .dfs__filter-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: var(--accent, #4a90d9);
    color: var(--accent-fg, #fff);
    font-size: 9px;
    font-weight: 700;
    line-height: 14px;
    text-align: center;
  }

  /* ── Popover du filtre unifié ── */
  .dfs__filter-pop {
    position: absolute;
    top: 38px;
    right: 10px;
    z-index: 30;
    width: 480px;
    max-width: calc(100% - 20px);
    max-height: 70%;
    overflow-y: auto;
    background: var(--surface, #fff);
    border: 1px solid var(--border, #ddd);
    border-radius: 8px;
    box-shadow: 0 8px 28px color-mix(in srgb, var(--fg, #000) 18%, transparent);
    padding: 10px 12px;
    font-family: var(--font-ui, sans-serif);
  }

  .dfs__filter-pop__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    color: var(--fg, #222);
    margin-bottom: 8px;
  }

  .dfs__filter-pop__head-actions {
    display: flex;
    gap: 8px;
  }

  .dfs__link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent, #4a90d9);
    font-size: 11px;
    font-family: var(--font-ui, sans-serif);
    cursor: pointer;
  }

  .dfs__link:hover {
    text-decoration: underline;
  }

  .dfs__filter-pop__hint {
    margin: 0 0 8px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--muted, #888);
  }

  /* ── Éditeur de règles (lignes Champ / Op / Valeur(s)) ── */
  .dfs__rules {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dfs__rule {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
  }

  .dfs__rule--range {
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 0.85fr) minmax(0, 0.85fr) auto;
  }

  .dfs__rule input {
    width: 100%;
    min-width: 0;
    height: 28px;
    padding: 0 6px;
    border: 1px solid var(--border, #ddd);
    border-radius: 5px;
    background: var(--bg, #fff);
    color: var(--fg, #222);
    font-family: var(--font-ui, sans-serif);
    font-size: 12px;
    outline: none;
  }

  .dfs__rule input:focus {
    border-color: var(--accent, #4a90d9);
  }

  .dfs__rule-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 5px;
    background: none;
    color: var(--muted, #888);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .dfs__rule-x:hover {
    background: color-mix(in srgb, var(--color-error, #e53935) 12%, transparent);
    color: var(--color-error, #e53935);
  }

  .dfs__add {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding: 3px 8px;
    border: 1px dashed var(--border, #bbb);
    border-radius: 5px;
    background: none;
    color: var(--accent, #4a90d9);
    font-family: var(--font-ui, sans-serif);
    font-size: 12px;
    cursor: pointer;
  }

  .dfs__add:hover {
    border-color: var(--accent, #4a90d9);
    background: color-mix(in srgb, var(--accent, #4a90d9) 6%, transparent);
  }

  .dfs__add .material-symbols-outlined {
    font-size: 15px;
  }

  /* ── Page d'accueil ── */
  .dfs__empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    padding: 24px;
  }

  .dfs__empty-frame {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    max-width: 460px;
    text-align: center;
  }

  .dfs__empty-icon {
    font-size: 44px;
    color: color-mix(in srgb, var(--accent, #4a90d9) 55%, var(--muted, #888));
  }

  .dfs__empty-title {
    margin: 0;
    font-family: var(--font-ui, sans-serif);
    font-size: 18px;
    font-weight: 600;
    color: var(--fg, #222);
  }

  .dfs__empty-desc {
    margin: 0;
    font-family: var(--font-ui, sans-serif);
    font-size: 13px;
    line-height: 1.5;
    color: var(--muted, #888);
  }

  .dfs__empty-actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }

  .dfs__empty-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border-radius: 6px;
    border: 1px solid var(--border, #ddd);
    background: var(--bg, #fff);
    color: var(--fg, #222);
    font-family: var(--font-ui, sans-serif);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }

  .dfs__empty-btn .material-symbols-outlined {
    font-size: 17px;
  }

  .dfs__empty-btn--primary {
    background: var(--accent, #4a90d9);
    border-color: var(--accent, #4a90d9);
    color: var(--accent-fg, #fff);
  }

  .dfs__empty-btn--primary:hover {
    filter: brightness(1.06);
  }

  .dfs__empty-btn--secondary:hover {
    border-color: var(--accent, #4a90d9);
    color: var(--accent, #4a90d9);
  }

  /* ── Pile ── */
  .dfs__stack {
    flex: 1;
    overflow-y: auto;
    padding: 8px 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* ── Dialogue ── */
  .dfs__dialog {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 420px;
  }

  .dfs__dialog-filter__input {
    width: 100%;
    box-sizing: border-box;
    padding: 7px 10px;
    border: 1px solid var(--border, #ddd);
    border-radius: 6px;
    background: var(--bg, #fff);
    color: var(--fg, #222);
    font-family: var(--font-ui, sans-serif);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }

  .dfs__dialog-filter__input:focus {
    border-color: var(--accent, #4a90d9);
  }

  .dfs__dialog-filter__input::placeholder {
    color: var(--muted, #888);
  }

  .dfs__dialog-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 46vh;
    overflow-y: auto;
    border: 1px solid var(--border, #ddd);
    border-radius: 6px;
  }

  .dfs__dialog-item {
    border-bottom: 1px solid color-mix(in srgb, var(--border, #ddd) 50%, transparent);
  }

  .dfs__dialog-item:last-child {
    border-bottom: none;
  }

  .dfs__dialog-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    cursor: pointer;
    font-family: var(--font-ui, sans-serif);
    font-size: 13px;
    color: var(--fg, #222);
  }

  .dfs__dialog-row:hover {
    background: color-mix(in srgb, var(--accent, #4a90d9) 6%, transparent);
  }

  .dfs__dialog-row input[type="checkbox"] {
    accent-color: var(--accent, #4a90d9);
  }

  .dfs__dialog-icon {
    font-size: 16px;
    color: var(--accent, #4a90d9);
  }

  .dfs__dialog-name {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dfs__dialog-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent, #4a90d9) 12%, transparent);
    color: var(--accent, #4a90d9);
  }

  .dfs__dialog-loaded {
    font-size: 11px;
    color: var(--muted, #888);
  }

  .dfs__dialog-state {
    padding: 14px;
    text-align: center;
    font-family: var(--font-ui, sans-serif);
    font-size: 13px;
    color: var(--muted, #888);
  }

  .dfs__dialog-state--error {
    color: var(--color-error, #e53935);
  }

  .dfs__dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
