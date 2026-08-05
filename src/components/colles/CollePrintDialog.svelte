<script lang="ts">
  /**
   * Dialogue d'impression des planches de colles (round 18).
   *
   * À l'ouverture : parse léger de la daily note (source LIVE) → nombre de
   * planches. Au clic « Imprimer » : assemble le document HTML A4 paysage
   * (deux colonnes par page, une planche par colonne — src/colles/pdf-planches)
   * et le confie au pattern général md→PDF (navigateur système + dialogue
   * d'impression natif : l'utilisateur choisit « Enregistrer en PDF »).
   * Le PDF est VECTORIEL — pas de jspdf/html2canvas (abandonnés round 17).
   *
   * Checkbox « avec/sans évaluation » : sans (défaut) = feuille d'examen à
   * découper pour les élèves ; avec = archivage administration.
   */
  import { Button, Overlay } from "@/components/primitives";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import { getRootPath } from "@/stores/root-path.svelte";
  import { collesSettings } from "@/stores/colles-settings.svelte";
  import { userProfile } from "@/stores/user-profile.svelte";
  import { notifications } from "@/stores/notifications.svelte";
  import { parsePlanches } from "@/colles";
  import { exportPlanchesPdf } from "@/colles/pdf-planches-render";

  let {
    open,
    filePath = null as string | null,
    source = null as string | null,
    onClose,
  }: {
    open: boolean;
    filePath?: string | null;
    /** Source LIVE de la daily note (lue à l'ouverture par app.svelte). */
    source?: string | null;
    onClose: () => void;
  } = $props();

  let t = $derived(getT($language));

  type Phase = "idle" | "loading" | "ready" | "printing" | "error";
  let phase = $state<Phase>("idle");
  let count = $state(0);
  let error = $state("");
  let includeEval = $state(false);

  // Relance le parse léger à CHAQUE ouverture avec la source courante.
  $effect(() => {
    if (!open || !source) {
      phase = "idle";
      return;
    }
    phase = "loading";
    count = 0;
    error = "";
    try {
      const section = parsePlanches(source);
      // Ne JAMAIS relire `count` (ni `phase`) après les avoir écrits dans le
      // même effet : l'écriture invalide la dépendance trackée par l'effet →
      // boucle infinie (`effect_update_depth_exceeded`, vérifié round 18).
      // Passer par une locale. Le parse est synchrone : pas besoin de IIFE.
      const n = section.planches.length;
      count = n;
      phase = n ? "ready" : "error";
      if (!n) error = t("colle.printEmpty");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      phase = "error";
    }
  });

  async function handlePrint() {
    if (!source) return;
    const theme = document.documentElement.getAttribute("data-theme") ?? "latte";
    const rootPath = getRootPath() ?? null;
    phase = "printing";
    try {
      const ok = await exportPlanchesPdf({
        source,
        rubriques: collesSettings.current.rubriques,
        theme,
        filePath,
        rootPath,
        colleur: userProfile.current.colleurName,
        includeEval,
      });
      if (!ok) {
        error = t("colle.printEmpty");
        phase = "error";
        return;
      }
      notifications.setInfo(t("colle.printLaunch"));
      onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      phase = "error";
    }
  }
</script>

<Overlay
  open={open}
  onClose={onClose}
  ariaLabel={t("colle.printTitle")}
  variant="modal"
  width="auto"
>
  <div class="colle-print">
    <div class="colle-print__head">
      <i class="wxi-printer" aria-hidden="true"></i>
      <h2 class="colle-print__title">{t("colle.printTitle")}</h2>
      <button type="button" class="colle-print__close" onclick={onClose} aria-label={t("common.close")}>
        <i class="wxi-close" aria-hidden="true"></i>
      </button>
    </div>

    <div class="colle-print__body">
      {#if phase === "loading"}
        <p class="colle-print__status">{t("colle.sendLoading")}</p>
      {:else if phase === "printing"}
        <p class="colle-print__status">{t("colle.printing")}</p>
      {:else if phase === "error"}
        <p class="colle-print__error">{error}</p>
      {:else if phase === "ready"}
        <label class="colle-print__checkbox">
          <input type="checkbox" bind:checked={includeEval} />
          <span class="colle-print__checkbox-label">{t("colle.printIncludeEval")}</span>
        </label>
        <p class="colle-print__hint">{t("colle.printHintEval")}</p>
        <p class="colle-print__count">
          {t("colle.printCount", { count })}
        </p>
      {/if}
    </div>

    {#if phase === "ready" || phase === "error"}
      <div class="colle-print__actions">
        {#if phase === "ready"}
          <Button variant="solid" onclick={handlePrint}>{t("colle.print")}</Button>
        {/if}
        <Button onclick={onClose}>{t("common.close")}</Button>
      </div>
    {/if}
  </div>
</Overlay>

<style>
  .colle-print {
    display: flex;
    flex-direction: column;
    width: min(380px, 88vw);
    color: var(--fg);
  }
  .colle-print__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .colle-print__head i {
    font-size: 17px;
    color: var(--accent);
  }
  .colle-print__title {
    flex: 1;
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .colle-print__close {
    border: none;
    background: transparent;
    color: var(--muted);
    width: 24px;
    height: 24px;
    border-radius: 5px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .colle-print__close:hover {
    background: var(--surface-hover);
    color: var(--fg);
  }
  .colle-print__body {
    padding: 14px 16px;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .colle-print__status {
    margin: 0;
    color: var(--fg-muted);
  }
  .colle-print__error {
    margin: 0;
    color: var(--color-error, #c62828);
    white-space: pre-wrap;
  }
  .colle-print__checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-weight: 500;
  }
  .colle-print__checkbox input {
    accent-color: var(--accent);
    width: 15px;
    height: 15px;
    margin: 0;
  }
  .colle-print__hint {
    margin: 0;
    color: var(--fg-muted);
    line-height: 1.5;
  }
  .colle-print__count {
    margin: 0;
    color: var(--fg-muted);
  }
  .colle-print__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
</style>
