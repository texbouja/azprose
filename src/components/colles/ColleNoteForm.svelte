<script lang="ts">
  /**
   * Form d'évaluation d'une planche de colle (Note + Observations), rendu par
   * le SVAR Editor. Débounce 800 ms puis write-back ciblé via `onChange`.
   * Les modifications restent locales aux `values` du composant ; le parent
   * persiste (setTabSource → sauvegarde standard de l'éditeur).
   */
  import { onDestroy } from "svelte";
  import { Editor } from "@svar-ui/svelte-editor";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";

  let {
    note = "",
    observations = "",
    onChange,
  }: {
    note?: number | string;
    observations?: string;
    onChange?: (keys: { note?: number | string | null; observations?: string | null }) => void;
  } = $props();

  let t = $derived(getT($language));

  // Plier/déplier le form : le chevron de la barre bascule l'affichage du
  // contenu (CSS), les valeurs et le debounce restent vivants (form non
  // démonté) — une saisie en cours n'est jamais perdue.
  let collapsed = $state(false);

  // Volontaire : form NON contrôlé après montage — `note`/`observations` ne servent
  // qu'à l'init. Le parent remonte ce composant par planche (voir `{#key}` dans
  // CollePreview) : une re-sync réactive entrerait en conflit avec la frappe en cours.
  // svelte-ignore state_referenced_locally
  let values = $state<{ note: number | string; observations: string }>({
    note,
    observations,
  });

  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Chaîne numérique → number (note: 15.5 reste un nombre YAML), sinon chaîne. */
  function coerceNote(raw: string): number | string | null {
    const s = String(raw ?? "").trim();
    if (s === "") return null;
    return /^[+-]?\d*\.?\d+$/.test(s) ? Number(s) : s;
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    onChange?.({
      note: coerceNote(String(values.note)),
      observations: String(values.observations).trim() || null,
    });
  }

  function handleChange(ev: { key: string; value: unknown }) {
    if (ev.key === "note") values.note = (ev.value as string) ?? "";
    else if (ev.key === "observations") values.observations = (ev.value as string) ?? "";
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

<div class="colle-form" class:colle-form--collapsed={collapsed}>
  <Editor
    values={values}
    topBar={{
      items: [
        { comp: "label", text: t("colle.evaluation"), css: "colle-form__title" },
        { comp: "spacer" },
        // Le « x » (CloseIcon auto du layout par défaut) ne ferme rien ici :
        // remplacé par un chevron de pliage/dépliage. Le clic route vers
        // `item.handler` (BarComponent SVAR) — pas besoin d'`id` particulier.
        {
          comp: "icon",
          icon: collapsed ? "wxi-chevron-right" : "wxi-chevron-down",
          text: collapsed ? t("colle.expand") : t("colle.collapse"),
          css: "colle-form__toggle",
          handler: () => {
            collapsed = !collapsed;
          },
        },
      ],
    }}
    bottomBar={false}
    items={[
      { key: "note", label: t("colle.note"), comp: "text", placeholder: t("colle.notePlaceholder") },
      {
        key: "observations",
        label: t("colle.observations"),
        comp: "textarea",
        placeholder: t("colle.observationsPlaceholder"),
        rows: 3,
      },
    ]}
    onchange={handleChange}
    autoSave
    layout="default"
  />
</div>

<style>
  /* ── Barre du form : titre « Évaluation » + chevron de pliage ───────── */
  .colle-form :global(.wx-editor-toolbar .colle-form__title) {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 0 2px;
    line-height: 24px;
  }
  .colle-form :global(.wx-editor-toolbar .colle-form__toggle) {
    width: 22px;
    height: 22px;
    color: var(--muted);
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .colle-form :global(.wx-editor-toolbar .colle-form__toggle:hover) {
    color: var(--fg);
    background: var(--surface-hover);
  }

  /* ── Plier le form : le contenu (champs) disparaît, la barre reste ───── */
  .colle-form--collapsed :global(.wx-content) {
    display: none;
  }
  .colle-form--collapsed :global(.wx-editor-toolbar) {
    margin-bottom: 0;
  }
</style>
