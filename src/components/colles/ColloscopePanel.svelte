<script lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { colloscope } from "@/stores/colloscope.svelte";
import { eleves } from "@/stores/eleves.svelte";
import { fiches } from "@/stores/fiches.svelte";
import { pickXlsx } from "@/lib/files";
import { FilterBar } from "@svar-ui/svelte-filter";
import ColloscopeGrid from "./ColloscopeGrid.svelte";
import { exportCollesRecurring } from "@/lib/colles-events";
import { getCalendarStore } from "@/stores/calendar-store.svelte";
import { notifications } from "@/stores/notifications.svelte";
import { userProfile } from "@/stores/user-profile.svelte";
import { confirm } from "@tauri-apps/plugin-dialog";

// IFilterSet from filter-store (re-exported by svelte-filter but TS conflicts with getQueryString rename)
interface IFilterSet {
  rules?: ({ field?: string; value?: any } | IFilterSet)[];
  glue?: "and" | "or";
}

let importing = $state(false);
let exporting = $state(false);

let classes = $derived(colloscope.classes);
let colleurs = $derived(colloscope.colleurs);
let elevesCount = $derived(eleves.state.eleves.length);
let fichesCount = $derived(fiches.state.fiches.length);

// ── FilterBar field definitions ──────────────────────────
const filterFields = $derived([
  {
    id: "classe",
    label: "Classe",
    type: "text" as const,
    options: classes.map(c => ({ id: c, label: c })),
    placeholder: "Toutes",
  },
  {
    id: "colleur",
    label: "Colleur",
    type: "text" as const,
    options: colleurs.map(c => ({ id: c, label: c })),
    placeholder: "Tous",
  },
]);

function handleFilterChange(ev: { value: IFilterSet }) {
  const rules = ev.value?.rules ?? [];
  let classe: string | null = null;
  let colleur: string | null = null;

  for (const rule of rules) {
    if ("field" in rule && "value" in rule) {
      const val = rule.value === "$empty" || rule.value === "" ? null : String(rule.value);
      if (rule.field === "classe") classe = val;
      if (rule.field === "colleur") colleur = val;
    }
  }

  colloscope.selectClasse(classe);
  colloscope.selectColleur(colleur);
}

async function importXlsx() {
  const path = await pickXlsx();
  if (!path) return;
  importing = true;
  try {
    const isCsv = path.toLowerCase().endsWith(".csv");
    const parsed: any = await invoke(
      isCsv ? "parse_colloscope_csv" : "parse_colloscope_xlsx",
      { path },
    );

    const semaines = parsed.semaines.map((s: any) => ({
      date: s.date,
      label: s.label,
    }));

    const creneaux = parsed.creneaux.map((c: any, i: number) => ({
      id: `creneau-${i}`,
      matiere: c.matiere,
      colleur: c.colleur,
      jour: c.jour,
      horaire: c.horaire,
      salle: c.salle,
      classe: c.classe,
    }));

    const assignations: Record<string, (string | null)[]> = {};
    for (const id of creneaux.map((c: any) => c.id)) {
      assignations[id] = new Array(semaines.length).fill(null);
    }
    for (const a of parsed.assignations) {
      const id = `creneau-${a.creneau_index}`;
      if (assignations[id]) {
        assignations[id][a.semaine_index] = a.groupe;
      }
    }

      colloscope.importColloscope({ semaines, creneaux, assignations, startDate: semaines[0]?.date ?? null, endDate: null });
    await colloscope.save();

    const parsedEleves = parsed.eleves.map((e: any, i: number) => ({
      id: `eleve-${i}`,
      nom: e.nom,
      prenom: e.prenom,
      classe: e.classe,
      groupe: e.groupe,
      email: "",
    }));
    eleves.importEleves(parsedEleves);
    await eleves.save();
  } catch (e) {
    console.error("[colles] import error:", e);
  } finally {
    importing = false;
  }
}

// ── Export colloscope → calendar events (recurring, filtered by profile) ──
async function exportToCalendar() {
  const profileName = userProfile.current.name.trim();
  if (!profileName) {
    notifications.setInfo("Veuillez d'abord renseigner votre nom dans Paramètres > Profil");
    return;
  }

  const startDate = colloscope.state.startDate;
  const endDate = colloscope.state.endDate;
  if (!startDate || !endDate) {
    notifications.setInfo("Veuillez renseigner les dates de début et fin dans Paramètres > Colles");
    return;
  }

  // Generate recurring events filtered by profile name
  const newEvents = exportCollesRecurring(colloscope as any, {
    colleurFilter: profileName,
    startDate,
    endDate,
  });

  if (newEvents.length === 0) {
    notifications.setInfo(`Aucun créneau trouvé pour "${profileName}"`);
    return;
  }

  // Confirmation before import
  const weeksCount = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (7 * 86400000),
  ) + 1;
  const ok = await confirm(
    `Importer ${newEvents.length} créneau(x) récurrent(s) pour "${profileName}" ?\n\n` +
    `Fréquence : chaque semaine\n` +
    `Durée : ${weeksCount} semaines\n` +
    `Du ${new Date(startDate).toLocaleDateString("fr")} au ${new Date(endDate).toLocaleDateString("fr")}`,
    { kind: "info" },
  );
  if (!ok) return;

  exporting = true;
  try {
    // Merge into store (skip events that already exist by ID)
    const store = getCalendarStore();
    const existingIds = new Set(store.events.map((e) => e.id));
    const toAdd = newEvents.filter((e) => !existingIds.has(e.id));

    if (toAdd.length === 0) {
      notifications.setInfo("Tous les événements sont déjà dans le calendrier");
      return;
    }

    store.events = [...store.events, ...toAdd];
    notifications.setInfo(`${toAdd.length} créneau(x) récurrent(s) ajouté(s) au calendrier`);
  } catch (e) {
    console.error("[colles] export to calendar error:", e);
    notifications.setInfo("Erreur lors de l'export");
  } finally {
    exporting = false;
  }
}
</script>

<div class="colloscope-panel">
  <div class="colloscope-panel__header">
    <div class="colloscope-panel__filters">
        <FilterBar
          fields={filterFields}
          onchange={handleFilterChange}
        />
    </div>

    <div class="colloscope-panel__stats">
      <span>{colloscope.state.creneaux.length} créneaux</span>
      <span>·</span>
      <span>{colloscope.state.semaines.length} semaines</span>
      <span>·</span>
      <span>{elevesCount} élèves</span>
      <span>·</span>
      <span>{fichesCount} fiches</span>
    </div>

    <button
      type="button"
      class="colloscope-panel__import"
      disabled={importing}
      onclick={importXlsx}
    >
      <span>{importing ? "Import…" : "Importer"}</span>
    </button>

    <button
      type="button"
      class="colloscope-panel__import"
      disabled={exporting}
      onclick={exportToCalendar}
    >
      <span>{exporting ? "Export…" : "Exporter vers calendrier"}</span>
    </button>
  </div>

  <div class="colloscope-panel__content">
    <ColloscopeGrid />
  </div>
</div>

<style>
  .colloscope-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
  }
  .colloscope-panel__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .colloscope-panel__filters {
    display: flex;
    gap: 6px;
  }

  .colloscope-panel :global(.wx-filter-bar) {
    background: transparent;
    border: none;
    padding: 0;
    gap: 6px;
  }

  .colloscope-panel :global(.wx-filter-bar .wx-filter-item) {
    background: var(--bg, #1e1e2e);
    border: 1px solid var(--border, #45475a);
    border-radius: 4px;
    padding: 2px 6px;
    font-family: var(--font-ui, system-ui);
    font-size: 11px;
    color: var(--fg, #cdd6f4);
  }

  .colloscope-panel :global(.wx-filter-bar .wx-filter-item:focus) {
    border-color: var(--accent, #89b4fa);
  }
  .colloscope-panel__stats {
    display: flex;
    gap: 4px;
    font-family: var(--font-ui);
    font-size: 11px;
    color: var(--fg-muted);
    white-space: nowrap;
    margin-left: auto;
  }
  .colloscope-panel__import {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg-muted);
    font-family: var(--font-ui);
    font-size: 11px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }
  .colloscope-panel__import:hover:not(:disabled) {
    background: color-mix(in srgb, var(--fg) 8%, var(--surface));
    color: var(--fg);
  }
  .colloscope-panel__import:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .colloscope-panel__content {
    flex: 1;
    overflow: hidden;
  }
</style>
