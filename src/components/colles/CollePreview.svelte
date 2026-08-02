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

  // L'état de navigation est reporté à TabActions (chevrons du toolbar) :
  // celui-ci ne l'affiche que si le fichier correspond au tab side actif.
  $effect(() => {
    window.dispatchEvent(
      new CustomEvent("azprose:colle-nav-state", {
        detail: { filePath, index: current, total: planches.length },
      }),
    );
  });

  // Commandes de navigation (chevrons TabActions) + resync d'état à la demande.
  $effect(() => {
    const onNav = (e: Event) => {
      const d = (e as CustomEvent).detail as { filePath?: string | null; dir?: "prev" | "next" };
      if (d.filePath !== filePath) return;
      if (d.dir === "prev") prev();
      else if (d.dir === "next") next();
    };
    const onSync = (e: Event) => {
      const d = (e as CustomEvent).detail as { filePath?: string | null };
      if (d.filePath !== filePath) return;
      window.dispatchEvent(
        new CustomEvent("azprose:colle-nav-state", {
          detail: { filePath, index: current, total: planches.length },
        }),
      );
    };
    window.addEventListener("azprose:colle-nav", onNav);
    window.addEventListener("azprose:colle-nav-sync", onSync);
    return () => {
      window.removeEventListener("azprose:colle-nav", onNav);
      window.removeEventListener("azprose:colle-nav-sync", onSync);
    };
  });

  function handleEval(index: number, keys: { notes?: Record<string, number | string> | null; observations?: string | null }) {
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
