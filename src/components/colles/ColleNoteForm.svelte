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

<Editor
  values={values}
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
