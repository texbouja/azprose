<script lang="ts">
  /**
   * Prompt « numéro de semaine manuel » — affiché quand le calcul automatique
   * du numéro de semaine de colle échoue (planche hors de la période du
   * colloscope) : l'utilisateur saisit le numéro à la main au lieu d'un échec
   * silencieux. Rendu dans ColleSendDialog (sous-overlay au-dessus du
   * dialogue). La valeur est mémorisée pour toute la semaine par le store
   * week-overrides — les planches suivantes de la même semaine ne re-demandent
   * pas.
   */
  import { getT, language } from "@/lib/i18n";
  import { plancheDateIso } from "@/printing/colle/archive";
  import {
    cancelWeekPrompt,
    confirmWeekPrompt,
    pendingWeekPrompt,
  } from "@/colles/week-overrides.svelte";

  let t = $derived(getT($language));

  /** Champ de saisie — réinitialisé à chaque nouvelle demande. */
  let value = $state("");

  /** Demande en attente (null si aucune) — réactif via $state du store. */
  let pending = $derived(pendingWeekPrompt());

  let valid = $derived.by(() => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1;
  });

  // Reset du champ + focus à chaque nouvelle demande.
  $effect(() => {
    if (!pending) return;
    value = "";
    queueMicrotask(() => {
      document.getElementById("colle-week-prompt-input")?.focus();
    });
  });

  // Échap → annuler, en CAPTURE (sinon l'Overlay parent fermerait le dialogue).
  $effect(() => {
    if (!pending) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        cancelWeekPrompt();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  });

  function submit() {
    if (!valid) return;
    confirmWeekPrompt(Number(value));
  }
</script>

{#if pending}
  <div
    class="colle-week-prompt"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    aria-label={t("colle.weekPromptTitle")}
  >
    <div class="colle-week-prompt__card">
      <h3 class="colle-week-prompt__title">
        <i class="wxi-calendar-clock" aria-hidden="true"></i>
        {t("colle.weekPromptTitle")}
      </h3>
      <p class="colle-week-prompt__body">
        {t("colle.weekPromptBody", {
          eleve: pending.planche.meta.eleve?.trim() || `#${pending.planche.index + 1}`,
          date: plancheDateIso(pending.planche),
        })}
      </p>
      <div class="colle-week-prompt__row">
        <input
          id="colle-week-prompt-input"
          type="number"
          min="1"
          step="1"
          bind:value
          placeholder={t("colle.weekPromptPlaceholder")}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          class="colle-week-prompt__submit"
          class:colle-week-prompt__submit--valid={valid}
          onclick={submit}
          disabled={!valid}
        >
          {t("colle.weekPromptConfirm")}
        </button>
        <button type="button" class="colle-week-prompt__cancel" onclick={cancelWeekPrompt}>
          {t("colle.weekPromptCancel")}
        </button>
      </div>
      <p class="colle-week-prompt__hint">{t("colle.weekPromptHint")}</p>
    </div>
  </div>
{/if}

<style>
  .colle-week-prompt {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 0.35);
  }
  .colle-week-prompt__card {
    width: min(420px, 90vw);
    padding: 18px 20px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--fg);
    box-shadow: 0 8px 32px rgb(0 0 0 / 0.28);
  }
  .colle-week-prompt__title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 600;
  }
  .colle-week-prompt__title i {
    font-size: 17px;
    color: var(--accent);
  }
  .colle-week-prompt__body {
    margin: 0 0 12px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--fg-muted);
  }
  .colle-week-prompt__row {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .colle-week-prompt__row input {
    flex: 1;
    min-width: 0;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font-size: 13px;
  }
  .colle-week-prompt__row input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .colle-week-prompt__submit {
    height: 32px;
    padding: 0 14px;
    border: none;
    border-radius: 6px;
    background: color-mix(in srgb, var(--accent) 18%, var(--surface));
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .colle-week-prompt__submit--valid {
    background: var(--accent);
    color: var(--on-accent, #fff);
  }
  .colle-week-prompt__cancel {
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--fg-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .colle-week-prompt__cancel:hover {
    background: var(--surface-hover);
    color: var(--fg);
  }
  .colle-week-prompt__hint {
    margin: 0;
    font-size: 11px;
    color: var(--fg-muted);
  }
</style>
