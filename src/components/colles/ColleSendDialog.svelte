<script lang="ts">
  /**
   * Dialogue d'envoi des rapports de colles par email.
   *
    * À l'ouverture : parse les planches de la daily note (source LIVE) et
    * liste les destinataires (`email_eleve`) — aucune image n'est rendue.
    * Au clic Envoyer : chaque rapport est alors rendu en PNG (pipeline
    * markdown + capture html-to-image, round 10) et envoyé via
    * `send_colle_emails` (Rust, SMTP Gmail STARTTLS,
    * multipart/related + image inline `cid:rapport@azprose`) ; les échecs sont
    * listés par destinataire. L'expéditeur (adresse + app password) vient du
    * profil (SettingsOverlay).
    */
  import { Button, Overlay } from "@/components/primitives";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import { getRootPath } from "@/stores/root-path.svelte";
  import { collesSettings } from "@/stores/colles-settings.svelte";
  import { userProfile } from "@/stores/user-profile.svelte";
  import { parsePlanches, type CollePlanche } from "@/colles";
  import {
    renderColleReportImage,
  } from "@/colles/email-render";
  import {
    archivePlancheImage,
    loadColleWeeks,
    readArchivedImage,
    renderAndArchiveImages,
  } from "@/colles/archive-render";
  import { dirname } from "@/lib/files";
  import { sendColleEmails, type ColleEmailMessage, type SendFailure } from "@/colles/email-send";
  import { cancelWeekPrompt } from "@/colles/week-overrides.svelte";
  import WeekOverridePrompt from "./WeekOverridePrompt.svelte";

  let {
    open,
    filePath = null as string | null,
    source = null as string | null,
    onClose,
    onOpenSettings,
  }: {
    open: boolean;
    filePath?: string | null;
    /** Source LIVE de la daily note (lue à l'ouverture par app.svelte). */
    source?: string | null;
    onClose: () => void;
    onOpenSettings?: () => void;
  } = $props();

  let t = $derived(getT($language));

  type Phase =
    | "idle"
    | "loading"
    | "ready"
    | "preparing"
    | "archiving"
    | "sending"
    | "done"
    | "error"
    | "preview";

  let phase = $state<Phase>("idle");
  let planches = $state<CollePlanche[]>([]);
  let messages = $state<ColleEmailMessage[]>([]);
  let recipients = $state<{ eleve: string; to: string }[]>([]);
  let missing = $state<string[]>([]);
  let failures = $state<SendFailure[]>([]);
  let error = $state("");

  /** Résultat du dernier archivage : nombre d'images + dossier cible (relatif). */
  let archiveResult = $state<{ count: number; folder: string } | null>(null);
  /** Progression de l'archivage en cours (images rendues + écrites). */
  let archiveProgress = $state<{ done: number; total: number } | null>(null);

  // Relance la préparation à CHAQUE ouverture avec la source courante.
  // Seul le parse léger a lieu ici : les images sont rendues au clic Envoyer,
  // pas à l'ouverture.
  $effect(() => {
    if (!open || !source) {
      // Fermeture (ou première ouverture sans source) : rejette toute demande
      // de numéro de semaine en attente — l'archivage en cours échoue, jamais
      // de Promise pendante qui bloquerait l'UI.
      cancelWeekPrompt();
      phase = "idle";
      return;
    }
    let cancelled = false;
    phase = "loading";
    planches = [];
    messages = [];
    recipients = [];
    missing = [];
    failures = [];
    sentCount = 0;
    failedCount = 0;
    error = "";
    archiveResult = null;
    archiveProgress = null;
    void (async () => {
      try {
        const section = parsePlanches(source);
        const recips: { eleve: string; to: string }[] = [];
        const miss: string[] = [];
        for (const planche of section.planches) {
          const to = (planche.meta.email_eleve ?? "").trim();
          if (!to) {
            miss.push(planche.meta.eleve?.trim() || `#${planche.index + 1}`);
            continue;
          }
          recips.push({ eleve: planche.meta.eleve?.trim() || "", to });
        }
        if (cancelled) return;
        planches = section.planches;
        recipients = recips;
        missing = miss;
        phase = "ready";
      } catch (err) {
        if (cancelled) return;
        error = err instanceof Error ? err.message : String(err);
        phase = "error";
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  let sending = $derived(
    phase === "sending" || phase === "preparing" || phase === "archiving",
  );
  // Compteurs persistants : cumulent tous les tours d'envoi (les réessais ne
  // réinitialisent pas les succès précédents).
  let sentCount = $state(0);
  let failedCount = $state(0);

  /**
   * Rend les rapports en images PNG (html-to-image) si ce n'est pas déjà fait.
   * Réutilise les images ARCHIVÉES sur disque (Colles/<année>/Semaine_XX/…)
   * quand elles existent ; sinon rend et ARCHIVE au passage — l'utilisateur
   * peut annuler l'envoi, les images sont conservées et le prochain envoi les
   * réutilisera.
   */
  async function ensurePrepared(): Promise<ColleEmailMessage[]> {
    if (messages.length) return messages;
    const theme = document.documentElement.getAttribute("data-theme") ?? "latte";
    const rootPath = getRootPath() ?? null;
    // Semaines de colle du colloscope courant, résolues UNE fois pour toute la
    // boucle (chaque planche ne relit pas le colloscope). Hors période → la
    // réutilisation d'archive est neutralisée (null), l'écriture best-effort
    // échoue sans bloquer l'email.
    const weeks = await loadColleWeeks();
    const msgs: ColleEmailMessage[] = [];
    for (const planche of planches) {
      const to = (planche.meta.email_eleve ?? "").trim();
      if (!to) continue;
      const archived = await readArchivedImage(planche, rootPath, weeks);
      if (archived) {
        msgs.push({
          to,
          subject: archived.subject,
          html: archived.html,
          imageBase64: archived.base64,
          mimeType: archived.mimeType,
        });
        continue;
      }
      const img = await renderColleReportImage(
        planche,
        collesSettings.current.rubriques,
        { theme, filePath, rootPath },
      );
      // Archive la nouvelle image (annulation → images conservées). Best-effort
      // ici : l'email est l'action principale — un échec d'écriture (ex. disque,
      // ou planche hors période du colloscope) ne doit pas bloquer l'envoi
      // (l'archivage EXPLICITE reste bruyant).
      try {
        await archivePlancheImage(img, planche, rootPath, weeks);
      } catch (err) {
        console.error("azprose: archive write at send failed (ignored)", err);
      }
      msgs.push({
        to,
        subject: img.subject,
        html: img.html,
        imageBase64: img.base64,
        mimeType: img.mimeType,
      });
    }
    messages = msgs;
    return msgs;
  }

  /**
   * « Archiver les images » : rend TOUTES les planches (avec ou sans email)
   * et les écrit dans Colles/<année>/Semaine_XX/. Indépendant du profil et de
   * l'envoi — l'envoi pourra ensuite réutiliser ces images.
   */
  async function handleArchive() {
    if (!planches.length) return;
    const theme = document.documentElement.getAttribute("data-theme") ?? "latte";
    const rootPath = getRootPath() ?? null;
    archiveResult = null;
    archiveProgress = null;
    phase = "archiving";
    try {
      const { count, paths } = await renderAndArchiveImages(
        planches,
        collesSettings.current.rubriques,
        { theme, filePath, rootPath },
        rootPath,
        (done, total) => (archiveProgress = { done, total }),
      );
      const folder = paths.length ? dirname(paths[0]) : "Colles";
      archiveResult = { count, folder };
      phase = "ready";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      phase = "error";
    }
  }

  async function handleSend() {
    const from = userProfile.current.email.trim();
    const password = userProfile.current.gmailAppPassword.trim();
    if (!from || !password) {
      error = t("colle.sendMissingProfile");
      phase = "error";
      return;
    }
    if (!recipients.length) return;
    let msgs: ColleEmailMessage[];
    try {
      phase = "preparing";
      msgs = await ensurePrepared();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      phase = "error";
      return;
    }
    if (!msgs.length) return;
    phase = "sending";
    try {
      failures = await sendColleEmails(from, password, msgs);
      failedCount = failures.length;
      sentCount = recipients.length - failedCount;
      phase = "done";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      phase = "error";
    }
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  // Affiche l'image du rapport (déjà préparée via ensurePrepared, même cache
  // que l'envoi) pour vérifier le rendu AVANT d'envoyer. Navigation ← → entre
  // les destinataires, Échap/fermer → retour à la phase ready.
  let previewIndex = $state(0);

  let previewMsg = $derived(messages[previewIndex]);
  let previewSrc = $derived(
    previewMsg ? `data:${previewMsg.mimeType};base64,${previewMsg.imageBase64}` : "",
  );

  $effect(() => {
    if (phase !== "preview") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Capture AVANT l'Overlay (qui fermerait le dialogue) : retour à ready.
        e.stopPropagation();
        e.preventDefault();
        phase = "ready";
      } else if (e.key === "ArrowLeft" && previewIndex > 0) {
        e.preventDefault();
        previewIndex--;
      } else if (e.key === "ArrowRight" && previewIndex < messages.length - 1) {
        e.preventDefault();
        previewIndex++;
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  });

  async function handlePreview() {
    try {
      phase = "preparing";
      await ensurePrepared();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      phase = "error";
      return;
    }
    if (!messages.length) return;
    previewIndex = 0;
    phase = "preview";
  }

  /** Fermeture du dialogue : annule toute demande de semaine en attente. */
  function handleClose() {
    cancelWeekPrompt();
    onClose();
  }

  function handleRetry() {
    if (failures.length) {
      // Réessai = renvoyer UNIQUEMENT les destinataires en échec.
      const failed = new Set(failures.map((f) => f.to));
      const remaining = messages.filter((m) => failed.has(m.to));
      void (async () => {
        const from = userProfile.current.email.trim();
        const password = userProfile.current.gmailAppPassword.trim();
        if (!from || !password) {
          error = t("colle.sendMissingProfile");
          phase = "error";
          return;
        }
        phase = "sending";
        try {
          failures = (await sendColleEmails(from, password, remaining)).filter((f) =>
            failed.has(f.to),
          );
          sentCount += remaining.length - failures.length;
          failedCount = failures.length;
          // Ne garder dans la file que les échecs restants (prochain réessai).
          messages = remaining.filter((m) => failures.some((f) => f.to === m.to));
          phase = "done";
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          phase = "error";
        }
      })();
      return;
    }
    phase = "ready";
  }
</script>

<Overlay open={open} onClose={handleClose} ariaLabel={t("colle.sendTitle")} variant="modal">
  {#if phase === "preview"}
    <div class="colle-send__preview">
      <div class="colle-send__preview-bar">
        <span class="colle-send__preview-title">{recipients[previewIndex]?.eleve || ""}</span>
        <span class="colle-send__preview-count">{previewIndex + 1} / {messages.length}</span>
        <div class="colle-send__preview-actions">
          <button
            type="button"
            class="colle-send__preview-btn"
            disabled={previewIndex <= 0}
            aria-label={t("colle.sendPreviewPrev")}
            onclick={() => previewIndex--}
          >
            <i class="wxi-chevron-left" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="colle-send__preview-btn"
            disabled={previewIndex >= messages.length - 1}
            aria-label={t("colle.sendPreviewNext")}
            onclick={() => previewIndex++}
          >
            <i class="wxi-chevron-right" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="colle-send__preview-btn"
            aria-label={t("common.close")}
            onclick={() => (phase = "ready")}
          >
            <i class="wxi-close" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="colle-send__preview-img">
        {#if previewMsg}
          <img src={previewSrc} alt={t("colle.sendPreviewAlt")} />
        {/if}
      </div>
    </div>
  {:else}
  <div class="colle-send">
    <div class="colle-send__head">
      <i class="wxi-send" aria-hidden="true"></i>
      <h2 class="colle-send__title">{t("colle.sendTitle")}</h2>
      <button type="button" class="colle-send__close" onclick={handleClose} aria-label={t("common.close")}>
        <i class="wxi-close" aria-hidden="true"></i>
      </button>
    </div>

    <div class="colle-send__body">
      {#if phase === "loading"}
        <p class="colle-send__status">{t("colle.sendLoading")}</p>
      {:else if phase === "preparing"}
        <p class="colle-send__status">{t("colle.sendPreparing")}</p>
      {:else if phase === "archiving"}
        <p class="colle-send__status">
          {#if archiveProgress}
            {t("colle.archiving", { done: archiveProgress.done, total: archiveProgress.total })}
          {:else}
            {t("colle.archiving", { done: 0, total: planches.length })}
          {/if}
        </p>
      {:else if phase === "error"}
        <p class="colle-send__error">{error}</p>
        {#if !userProfile.current.email.trim() || !userProfile.current.gmailAppPassword.trim()}
          <p class="colle-send__hint">{t("colle.sendProfileHint")}</p>
          <Button variant="solid" onclick={() => onOpenSettings?.()}>
            {t("colle.sendOpenSettings")}
          </Button>
        {/if}
      {:else if phase === "ready" || phase === "sending" || phase === "done"}
        {#if phase !== "done"}
          <p class="colle-send__status">
            {t("colle.sendCount", { count: recipients.length })}
            {#if missing.length}
              <span class="colle-send__warn">
                · {t("colle.sendMissingCount", { count: missing.length })}
              </span>
            {/if}
          </p>
          {#if archiveResult}
            <p class="colle-send__archive-done">
              {t("colle.archiveDone", { count: archiveResult.count, folder: archiveResult.folder })}
            </p>
          {/if}
        {/if}

        {#if phase === "done"}
          {#if failures.length}
            <p class="colle-send__status">
              {t("colle.sendPartial", { ok: sentCount, failed: failedCount })}
            </p>
          {:else}
            <p class="colle-send__status">{t("colle.sendAllOk", { count: sentCount })}</p>
          {/if}
        {/if}

        <div class="colle-send__recipients">
          {#each recipients as r (r.to)}
            <div class="colle-send__row" class:colle-send__row--failed={failures.some((f) => f.to === r.to)}>
              <span class="colle-send__eleve">{r.eleve || r.to}</span>
              <span class="colle-send__to">{r.to}</span>
              <span class="colle-send__result">
                {#if failures.some((f) => f.to === r.to)}
                  <i class="wxi-alert-circle" aria-hidden="true"></i>
                {:else if phase === "done"}
                  <i class="wxi-check" aria-hidden="true"></i>
                {/if}
              </span>
            </div>
          {/each}
          {#each missing as eleve (eleve)}
            <div class="colle-send__row colle-send__row--missing">
              <span class="colle-send__eleve">{eleve}</span>
              <span class="colle-send__to">{t("colle.sendNoEmail")}</span>
              <span class="colle-send__result"><i class="wxi-alert-circle" aria-hidden="true"></i></span>
            </div>
          {/each}
          {#if !recipients.length && !missing.length}
            <p class="colle-send__empty">{t("colle.sendEmpty")}</p>
          {/if}
        </div>

        {#if failures.length}
          <div class="colle-send__failures">
            <div class="colle-send__failures-title">{t("colle.sendFailuresTitle")}</div>
            {#each failures as f (f.to)}
              <p class="colle-send__failure">
                <strong>{f.to}</strong> — {f.error}
              </p>
            {/each}
          </div>
        {/if}

        {#if phase === "done" && failures.length}
          <div class="colle-send__actions">
            <Button variant="solid" disabled={sending} onclick={handleRetry}>
              {t("colle.sendRetry")}
            </Button>
            <Button disabled={sending} onclick={handleClose}>{t("common.close")}</Button>
          </div>
        {:else if phase === "ready" || phase === "sending"}
          <div class="colle-send__actions">
            <Button
              variant="ghost"
              disabled={sending || !planches.length}
              onclick={handleArchive}
            >
              {t("colle.archive")}
            </Button>
            <Button
              variant="ghost"
              disabled={sending || !recipients.length}
              onclick={handlePreview}
            >
              {t("colle.sendPreview")}
            </Button>
            <Button variant="solid" disabled={sending || !recipients.length} onclick={handleSend}>
              {phase === "sending" ? t("colle.sendInProgress") : t("colle.send")}
            </Button>
            <Button disabled={sending} onclick={handleClose}>{t("common.close")}</Button>
          </div>
        {:else}
          <div class="colle-send__actions">
            <Button variant="solid" onclick={handleClose}>{t("common.close")}</Button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
  {/if}

  <WeekOverridePrompt />
</Overlay>

<style>
  .colle-send {
    display: flex;
    flex-direction: column;
    width: min(560px, 88vw);
    max-height: 75vh;
    color: var(--fg);
  }
  .colle-send__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .colle-send__head i {
    font-size: 17px;
    color: var(--accent);
  }
  .colle-send__title {
    flex: 1;
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .colle-send__close {
    border: none;
    background: transparent;
    color: var(--muted);
    width: 24px;
    height: 24px;
    border-radius: 5px;
    cursor: pointer;
  }
  .colle-send__close:hover {
    background: var(--surface-hover);
    color: var(--fg);
  }
  .colle-send__body {
    padding: 16px 18px;
    overflow-y: auto;
    font-size: 13px;
  }
  .colle-send__status {
    margin: 0 0 12px;
    color: var(--fg-muted);
  }
  .colle-send__warn {
    color: var(--color-warning, #b7791f);
  }
  .colle-send__archive-done {
    margin: 0 0 12px;
    color: var(--color-success, #2e7d32);
  }
  .colle-send__error {
    margin: 0 0 8px;
    color: var(--color-error, #c62828);
    white-space: pre-wrap;
  }
  .colle-send__hint {
    margin: 0 0 12px;
    color: var(--fg-muted);
  }
  .colle-send__recipients {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 14px;
  }
  .colle-send__row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  .colle-send__row:last-child {
    border-bottom: none;
  }
  .colle-send__row--failed {
    background: color-mix(in srgb, var(--color-error, #c62828) 8%, var(--bg));
  }
  .colle-send__row--missing {
    opacity: 0.7;
  }
  .colle-send__eleve {
    font-weight: 500;
    min-width: 140px;
  }
  .colle-send__to {
    flex: 1;
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .colle-send__result {
    width: 18px;
    text-align: center;
    color: var(--muted);
  }
  .colle-send__row--failed .colle-send__result {
    color: var(--color-error, #c62828);
  }
  .colle-send__row:not(.colle-send__row--failed):not(.colle-send__row--missing) .colle-send__result {
    color: var(--color-success, #2e7d32);
  }
  .colle-send__empty {
    margin: 0;
    padding: 12px;
    color: var(--fg-muted);
  }
  .colle-send__failures {
    margin-bottom: 14px;
  }
  .colle-send__failures-title {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .colle-send__failure {
    margin: 2px 0;
    color: var(--color-error, #c62828);
    font-size: 12px;
    word-break: break-word;
  }
  .colle-send__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  /* ── Vue preview (image du rapport avant envoi) ──────────────────────── */
  .colle-send__preview {
    display: flex;
    flex-direction: column;
    width: min(760px, 92vw);
    max-height: 85vh;
    color: var(--fg);
    background: #f0f2f5;
    border-radius: 10px;
    overflow: hidden;
  }
  .colle-send__preview-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .colle-send__preview-title {
    font-weight: 600;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .colle-send__preview-count {
    color: var(--fg-muted);
    font-size: 12px;
  }
  .colle-send__preview-actions {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }
  .colle-send__preview-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
  }
  .colle-send__preview-btn:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--fg);
  }
  .colle-send__preview-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .colle-send__preview-btn i {
    font-size: 15px;
  }
  .colle-send__preview-img {
    flex: 1;
    overflow: auto;
    padding: 18px;
    display: flex;
    justify-content: center;
  }
  .colle-send__preview-img img {
    display: block;
    max-width: 100%;
    height: auto;
    box-shadow: 0 2px 12px rgb(0 0 0 / 0.18);
    border-radius: 4px;
  }
</style>
