<script lang="ts">
  /**
   * Form d'évaluation d'une planche de colle — zones de saisie PAR RUBRIQUE
   * (config colles-settings, résolue par matière) + observations.
   *
   * Totalement HEADLESS : aucune barre SVAR (topBar/bottomBar = false n'ont
   * plus lieu d'être — le formulaire est du HTML pur, une ligne par rubrique
   * (label + valeur) pour un encombrement minimal dans le side panel. Le titre
   * « Évaluation » et le chevron de pliage/dépliage appartiennent à la CARTE
   * parente (ColleCard), qui porte aussi le mode preview.
   *
   * La note GLOBALE = somme des rubriques, TOUJOURS calculée ici (jamais
   * stockée) ; le write-back écrit le dict `notes` (`{rub1: val, …}`) dans le
   * YAML du bloc ```colle. Débounce 800 ms puis write-back via `onChange`.
   * `onDraft` reporte l'état LIVE (à chaque frappe) pour le mode preview de la
   * carte — la somme et le rendu markdown des observations s'y mettent à jour
   * sans attendre le debounce.
   */
  import { onDestroy } from "svelte";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import { collesSettings } from "@/stores/colles-settings.svelte";
  import { rubriquesFor, sumMaxScore, sumNotes } from "@/colles";

  export interface ColleDraft {
    notes: Record<string, number | string> | null;
    observations: string;
  }

  let {
    matiere = "",
    notes = undefined as Record<string, number | string> | null | undefined,
    observations = "",
    onChange,
    onDraft,
  }: {
    matiere?: string;
    notes?: Record<string, number | string> | null;
    observations?: string;
    onChange?: (keys: { notes?: Record<string, number | string> | null; observations?: string | null }) => void;
    onDraft?: (draft: ColleDraft) => void;
  } = $props();

  let t = $derived(getT($language));

  let rubriques = $derived(rubriquesFor(matiere, collesSettings.current.rubriques));

  // Volontaire : form NON contrôlé après montage — les props ne servent qu'à
  // l'init. Le parent remonte ce composant par planche (voir `{#key}` dans
  // CollePreview) : une re-sync réactive entrerait en conflit avec la frappe.
  // svelte-ignore state_referenced_locally
  let values = $state<Record<string, string>>(initValues());

  function initValues(): Record<string, string> {
    const v: Record<string, string> = {};
    for (const r of rubriques) v[r.id] = String(notes?.[r.id] ?? "");
    v.observations = String(observations ?? "");
    return v;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;

  let noteGlobale = $derived(sumNotes(values));
  let noteMax = $derived(sumMaxScore(rubriques));

  /** Chaîne numérique → number, sinon chaîne (jamais stockée telle quelle). */
  function coerce(raw: string): number | string | null {
    const s = String(raw ?? "").trim();
    if (s === "") return null;
    return /^[+-]?\d*\.?\d+$/.test(s) ? Number(s) : s;
  }

  /** État live (valeurs saisies, rubriques cohércées) — partagé flush/preview. */
  function buildDraft(): ColleDraft {
    const notesOut: Record<string, number | string> = {};
    for (const r of rubriques) {
      const v = coerce(String(values[r.id] ?? ""));
      if (v !== null) notesOut[r.id] = v;
    }
    return {
      notes: Object.keys(notesOut).length ? notesOut : null,
      observations: String(values.observations ?? ""),
    };
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const draft = buildDraft();
    onChange?.({
      notes: draft.notes,
      observations: draft.observations.trim() || null,
    });
  }

  function handleInput(key: string, value: string) {
    values[key] = value;
    onDraft?.(buildDraft());
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 800);
  }

  onDestroy(() => {
    if (timer) {
      clearTimeout(timer);
      flush();
    }
  });
</script>

<div class="colle-form">
  {#if rubriques.length > 0}
    <div class="colle-form__sum">
      <span>{t("colle.noteGlobale")}</span>
      <strong class:colle-form__sum--empty={noteGlobale === null}>
        {noteGlobale !== null ? String(noteGlobale) : "—"} / {noteMax}
      </strong>
    </div>
  {/if}

  <div class="colle-form__grid">
    {#each rubriques as r (r.id)}
      <label class="colle-form__row" title={r.label}>
        <span class="colle-form__label">
          {r.label}
        </span>
        <span class="colle-form__wrap">
          <input
            class="colle-form__input"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            spellcheck="false"
            value={values[r.id] ?? ""}
            oninput={(e) => handleInput(r.id, e.currentTarget.value)}
          />
          {#if String(values[r.id] ?? "").trim()}
            <!-- Suffixe « /max » au rendu : petit + grisé, visible dès saisie. -->
            <span class="colle-form__unit">/{r.maxScore}</span>
          {:else}
            <!-- « sur max » : overlay DOM (champ vide) — même technique que le
                 suffixe, PAS un placeholder natif : le placeholder natif était
                 TRONQUÉ dans la zone de 20px (56px − padding-right 30px réservé
                 au suffixe) et donc invisible. L'overlay n'est pas contraint. -->
            <span class="colle-form__hint">sur {r.maxScore}</span>
          {/if}
        </span>
      </label>
    {/each}
  </div>

  <label class="colle-form__obs">
    <span class="colle-form__obs-label">{t("colle.observations")}</span>
    <textarea
      class="colle-form__obs-input"
      rows="3"
      placeholder={t("colle.observationsPlaceholder")}
      value={values.observations ?? ""}
      oninput={(e) => handleInput("observations", e.currentTarget.value)}
    ></textarea>
  </label>
</div>

<style>
  /* Form headless : harmoniser police/taille avec la carte. */
  .colle-form {
    font-family: var(--font-ui);
    font-size: 12px;
  }
  .colle-form__sum {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 4px 0 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .colle-form__sum strong {
    font-size: 15px;
    font-weight: 700;
    color: var(--accent);
  }
  .colle-form__sum--empty {
    color: var(--muted);
  }
  .colle-form__grid {
    display: grid;
    /* Grid responsive : le nombre de colonnes dépend de la place disponible
       (2 colonnes dans le side panel étroit, plus si la fenêtre est large).
       minmax(150px, 1fr) : chaque cellule a au moins la largeur d'un label
       « Exercice 1 » + champ, et s'étire à parts égales au-delà. */
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 4px 8px;
    align-items: center;
  }
  /* Une rubrique par cellule : libellé (flex) + champ numérique. */
  .colle-form__row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: text;
  }
  .colle-form__row:hover {
    background: color-mix(in srgb, var(--fg) 5%, transparent);
  }
  .colle-form__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Le libellé est un flex : le texte se tronque si le champ 56px prend la
     place. Le maxScore vit dans le champ lui-même : PLACEHOLDER « sur 5 » quand
     le champ est vide, suffixe « /5 » au rendu dès qu'une valeur est saisie
     (petit + grisé — le padding-right de l'input lui réserve la place). */
  .colle-form__wrap {
    position: relative;
    flex-shrink: 0;
  }
  .colle-form__input {
    width: 56px;
    box-sizing: border-box;
    padding: 3px 30px 3px 6px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font-family: var(--font-ui);
    font-size: 12px;
    text-align: right;
    outline: none;
  }
  .colle-form__input:focus {
    border-color: var(--accent);
  }
  /* « sur 5 » : OVERLAY DOM du champ vide (pas un placeholder natif — il était
     tronqué dans la zone de 20px et invisible). Même positionnement que le
     suffixe « /5 », affiché en `{:else}` quand le champ est vide : disparaît
     dès la frappe (values est $state). */
  .colle-form__hint,
  /* « /5 » au rendu : calé à droite du champ (après la valeur, alignée à
     droite), minuscule et grisé, jamais cliquable. */
  .colle-form__unit {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 10px;
    line-height: 1;
    color: var(--muted);
    pointer-events: none;
    white-space: nowrap;
  }
  .colle-form__obs {
    display: block;
    margin-top: 8px;
  }
  .colle-form__obs-label {
    display: block;
    margin-bottom: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .colle-form__obs-input {
    box-sizing: border-box;
    width: 100%;
    min-height: 56px;
    resize: vertical;
    padding: 6px 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    font-family: var(--font-ui);
    font-size: 12px;
    line-height: 1.45;
    outline: none;
  }
  .colle-form__obs-input:focus {
    border-color: var(--accent);
  }
  /* Placeholder du textarea : même garantie de visibilité (--muted) — le gris
     natif est invisible sur --surface en thème sombre. */
  .colle-form__obs-input::placeholder {
    color: var(--muted);
    opacity: 1;
  }
</style>
