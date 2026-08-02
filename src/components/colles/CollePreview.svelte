<script lang="ts">
  /**
   * Vue « Planches de colles » : découpe la daily note en planches
   * (`parsePlanches`), affiche une carte à la fois (navigation ← →).
   *
   * Le write-back des évaluations est délégué à app.svelte via l'événement
   * `azprose:colle-eval` (pattern azprose:*) : le handler y lit le source LIVE
   * du tab main (même path) pour base — jamais le source du side tab (qui est
   * la dernière version SAUVÉE, pas le buffer non-sauvegardé de l'éditeur).
   */
  import { parsePlanches } from "@/colles";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import ColleCard from "./ColleCard.svelte";

  let {
    value = "",
    filePath = null as string | null,
  }: {
    value?: string;
    filePath?: string | null;
  } = $props();

  let t = $derived(getT($language));

  let planches = $derived(parsePlanches(value).planches);
  let current = $state(0);

  // Garde de bornes : si le source change (write-back, édition), l'index reste valide.
  $effect(() => {
    if (planches.length === 0) current = 0;
    else if (current >= planches.length) current = planches.length - 1;
  });

  function prev() {
    if (current > 0) current--;
  }

  function next() {
    if (current < planches.length - 1) current++;
  }

  function handleEval(index: number, keys: { note?: number | string | null; observations?: string | null }) {
    window.dispatchEvent(
      new CustomEvent("azprose:colle-eval", {
        detail: { path: filePath, index, keys },
      }),
    );
  }

  // Navigation clavier ← → (hors champs de saisie)
  $effect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      return (
        !!target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      );
    };
    const handler = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === "ArrowLeft" && current > 0) {
        e.preventDefault();
        current--;
      } else if (e.key === "ArrowRight" && current < planches.length - 1) {
        e.preventDefault();
        current++;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
</script>

<div class="colle-viewer">
  <header class="colle-viewer__bar">
    <div class="colle-viewer__title">
      <span>{t("colle.viewerTitle")}</span>
      {#if planches.length > 0}
        <span class="colle-viewer__count">{current + 1} / {planches.length}</span>
      {/if}
    </div>
    <div class="colle-viewer__nav">
      <button
        class="colle-viewer__btn"
        onclick={prev}
        disabled={current === 0}
        title={t("colle.prev")}
        aria-label={t("colle.prev")}
      >←</button>
      <button
        class="colle-viewer__btn"
        onclick={next}
        disabled={current >= planches.length - 1}
        title={t("colle.next")}
        aria-label={t("colle.next")}
      >→</button>
    </div>
  </header>

  {#if planches.length === 0}
    <div class="colle-viewer__empty">
      <p>{t("colle.empty")}</p>
    </div>
  {:else}
    {#key planches[current].index}
      <div class="colle-viewer__stage">
        <ColleCard planche={planches[current]} {filePath} onEval={handleEval} />
      </div>
    {/key}
  {/if}
</div>
