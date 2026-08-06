<script lang="ts">
  /**
   * Dialogue d'envoi des rapports de colles par email.
   *
    * À l'ouverture : parse les planches de la daily note (source LIVE) et
    * liste les destinataires (`email_eleve`) — aucune image n'est rendue.
    * Au clic Envoyer : chaque rapport est alors rendu en PNG (pipeline
    * markdown + capture headless Chrome, rounds 10 + 19) et envoyé via
    * `send_colle_emails` (Rust, SMTP Gmail STARTTLS,
    * multipart/related + image inline `cid:rapport@azprose`) ; les échecs sont
    * listés par destinataire. L'expéditeur (adresse + app password) vient du
    * profil (SettingsOverlay).
    */
  import { tick } from "svelte";
  import { Button, Overlay } from "@/components/primitives";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import { getRootPath } from "@/stores/root-path.svelte";
  import { collesSettings } from "@/stores/colles-settings.svelte";
  import { userProfile } from "@/stores/user-profile.svelte";
  import { parsePlanches, type CollePlanche, type ColleWeek } from "@/colles";
  import {
    renderColleReportImage,
    ReportRenderCancelled,
    type ColleReportImage,
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

  /**
   * Cache des images par INDEX DE PLANCHE (avec ou sans email), partagé par le
   * preview, l'envoi et l'archivage. null = pas encore rendue/réutilisée.
   * Le preview navigue sur TOUTES les planches, indépendamment de l'adresse
   * email de l'élève (retour utilisateur : l'aperçu était conditionné aux
   * destinataires).
   */
  let previewImages = $state<(ColleReportImage | null)[]>([]);
  /** Contrôle d'annulation de l'opération en cours (préparation, archivage, rendu preview). */
  let busyAbort = $state<AbortController | null>(null);
  /** Vrai pendant le rendu de la planche courante du preview. */
  let previewRendering = $state(false);

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
        previewImages = section.planches.map(() => null);
        previewIndex = 0;
        busyAbort = null;
        previewRendering = false;
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
   * Garantit l'image d'UNE planche (cache partagé preview/envoi/archivage).
   * Réutilise l'image ARCHIVÉE sur disque (Colles/<année>/Semaine_XX/…) quand
   * elle existe ; sinon rend via headless Chrome et ARCHIVE au passage
   * (best-effort — un échec d'écriture ne bloque pas l'email). `signal` :
   * si l'utilisateur annule, la boucle de rendu lève `ReportRenderCancelled`.
   */
  async function ensureImageAt(
    i: number,
    weeks: ColleWeek[],
    theme: string,
    rootPath: string | null,
    signal?: AbortSignal,
  ): Promise<ColleReportImage> {
    if (previewImages[i]) return previewImages[i]!;
    const planche = planches[i];
    const archived = await readArchivedImage(planche, rootPath, weeks);
    if (archived) {
      previewImages[i] = archived;
      return archived;
    }
    const img = await renderColleReportImage(
      planche,
      collesSettings.current.rubriques,
      { theme, filePath, rootPath },
      signal,
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
    previewImages[i] = img;
    return img;
  }

  /**
   * Rend les rapports en images PNG (headless Chrome) si ce n'est pas déjà
   * fait (cache `previewImages`), puis construit les messages email pour les
   * planches qui ont une adresse. Annulable via `signal`.
   */
  async function ensurePrepared(signal?: AbortSignal): Promise<ColleEmailMessage[]> {
    if (messages.length) return messages;
    const theme = document.documentElement.getAttribute("data-theme") ?? "latte";
    const rootPath = getRootPath() ?? null;
    // Semaines de colle du colloscope courant, résolues UNE fois pour toute la
    // boucle (chaque planche ne relit pas le colloscope). Hors période → la
    // réutilisation d'archive est neutralisée (null), l'écriture best-effort
    // échoue sans bloquer l'email.
    const weeks = await loadColleWeeks();
    const msgs: ColleEmailMessage[] = [];
    for (let i = 0; i < planches.length; i++) {
      if (signal?.aborted) throw new ReportRenderCancelled();
      const planche = planches[i];
      const to = (planche.meta.email_eleve ?? "").trim();
      if (!to) continue;
      const img = await ensureImageAt(i, weeks, theme, rootPath, signal);
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
   * l'envoi — l'envoi pourra ensuite réutiliser ces images. Bouton « Annuler »
   * / fermeture du dialogue → `abort.signal` → `ReportRenderCancelled` : les
   * images déjà écrites restent sur disque, l'app redevient disponible.
   */
  async function handleArchive() {
    if (!planches.length) return;
    const theme = document.documentElement.getAttribute("data-theme") ?? "latte";
    const rootPath = getRootPath() ?? null;
    archiveResult = null;
    archiveProgress = null;
    const abort = new AbortController();
    busyAbort = abort;
    phase = "archiving";
    try {
      const { count, paths } = await renderAndArchiveImages(
        planches,
        collesSettings.current.rubriques,
        { theme, filePath, rootPath },
        rootPath,
        (done, total) => (archiveProgress = { done, total }),
        abort.signal,
      );
      const folder = paths.length ? dirname(paths[0]) : "Colles";
      archiveResult = { count, folder };
      phase = "ready";
    } catch (err) {
      if (err instanceof ReportRenderCancelled) {
        // Annulation utilisateur : retour silencieux à la phase prête.
        phase = "ready";
        return;
      }
      error = err instanceof Error ? err.message : String(err);
      phase = "error";
    } finally {
      busyAbort = null;
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
    const abort = new AbortController();
    busyAbort = abort;
    try {
      phase = "preparing";
      msgs = await ensurePrepared(abort.signal);
    } catch (err) {
      if (err instanceof ReportRenderCancelled) {
        phase = "ready";
        return;
      }
      error = err instanceof Error ? err.message : String(err);
      phase = "error";
      return;
    } finally {
      busyAbort = null;
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
  // Affiche l'image du rapport de CHAQUE planche (avec ou sans email — le
  // bouton Preview n'est plus conditionné aux destinataires, comme « Archiver
  // les images »). Rendu PAIRESSEUX : seule la planche affichée est rendue
  // (cache `previewImages` partagé avec l'envoi/archivage) — une navigation
  // ← → instantanée sur les planches déjà rendues, bouton Annuler pendant un
  // rendu. Échap → retour à la phase ready.
  let previewIndex = $state(0);

  let previewMsg = $derived(previewImages[previewIndex] ?? null);
  let previewSrc = $derived(
    previewMsg ? `data:${previewMsg.mimeType};base64,${previewMsg.base64}` : "",
  );

  // Zoom d'affichage de l'image du preview : facteur multiplicateur de la
  // largeur du conteneur (1 = pleine largeur disponible, jamais de recadrage).
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;
  let zoom = $state(1);

  function setZoom(v: number) {
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v));
  }
  function zoomIn() {
    setZoom(zoom * 1.25);
  }
  function zoomOut() {
    setZoom(zoom / 1.25);
  }
  function resetZoom() {
    zoom = 1;
  }

  /** Molette : Ctrl+molette = zoom de l'image, molette seule = scroll vertical. */
  function handleWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }

  $effect(() => {
    if (phase !== "preview") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Capture AVANT l'Overlay (qui fermerait le dialogue) : retour à ready,
        // et interrompt un rendu en cours s'il y en a un.
        e.stopPropagation();
        e.preventDefault();
        handleCancel();
        phase = "ready";
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // Toujours capturé en preview (même hors bornes ou pendant un rendu).
        // stopPropagation EST OBLIGATOIRE : le preventDefault seul laisse
        // l'événement poursuivre (capture → target → bubble) — l'éditeur de la
        // fenêtre principale le recevrait quand même (le focus y est resté).
        e.stopPropagation();
        e.preventDefault();
        if (previewRendering) return;
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        gotoPreview(previewIndex + dir);
      } else if (e.ctrlKey || e.metaKey) {
        // Raccourcis zoom du preview (aucun conflit dans l'app : shortcuts
        // n'a pas de Ctrl+±/0). Capture totale comme les flèches — le
        // zoom UI global (applyZoom/uiScale) est réglé via les réglages, pas
        // au clavier.
        const code = e.code;
        if (code === "Equal" || code === "NumpadAdd") {
          e.stopPropagation();
          e.preventDefault();
          zoomIn();
        } else if (code === "Minus" || code === "NumpadSubtract") {
          e.stopPropagation();
          e.preventDefault();
          zoomOut();
        } else if (code === "Digit0" || code === "Numpad0") {
          e.stopPropagation();
          e.preventDefault();
          resetZoom();
        }
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  });

  async function handlePreview() {
    if (!planches.length) return;
    previewIndex = 0;
    zoom = 1;
    phase = "preview";
    // Prend le focus DÈS l'ouverture : l'Overlay ne vole pas le focus (le focus
    // resterait dans l'éditeur de la fenêtre principale → les touches y
    // atterriraient). Avec le focus sur le conteneur preview (tabindex=-1),
    // AUCUNE frappe n'atteint la fenêtre principale — le handler keydown
    // document (capture) complète la capture des flèches/Échap.
    await tick();
    document.querySelector<HTMLElement>(".colle-send__preview")?.focus();
    await ensurePreviewIndex();
  }

  /** Rend (si nécessaire) l'image de la planche courante du preview. */
  async function ensurePreviewIndex() {
    const i = previewIndex;
    if (previewImages[i]) return;
    const theme = document.documentElement.getAttribute("data-theme") ?? "latte";
    const rootPath = getRootPath() ?? null;
    const weeks = await loadColleWeeks();
    const abort = new AbortController();
    busyAbort = abort;
    previewRendering = true;
    try {
      await ensureImageAt(i, weeks, theme, rootPath, abort.signal);
    } catch (err) {
      if (err instanceof ReportRenderCancelled) {
        phase = "ready";
        return;
      }
      error = err instanceof Error ? err.message : String(err);
      phase = "error";
    } finally {
      previewRendering = false;
      busyAbort = null;
    }
  }

  function gotoPreview(i: number) {
    if (previewRendering || i < 0 || i >= planches.length) return;
    previewIndex = i;
    void ensurePreviewIndex();
  }

  /** Annule l'opération en cours (préparation, archivage, rendu preview). */
  function handleCancel() {
    busyAbort?.abort();
  }

  /**
   * Fermeture du dialogue : annule toute demande de semaine en attente ET
   * l'opération en cours. En phase PREVIEW, Close (bouton, clic extérieur,
   * Échap de l'Overlay) revient à la fenêtre Send — l'aperçu n'a jamais le
   * droit de fermer le dialogue.
   */
  function handleClose() {
    handleCancel();
    cancelWeekPrompt();
    if (phase === "preview") {
      phase = "ready";
      return;
    }
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

<Overlay
  open={open}
  onClose={handleClose}
  ariaLabel={t("colle.sendTitle")}
  variant="modal"
  width={phase === "preview" ? "min(1100px, 94vw)" : undefined}
>
  {#if phase === "preview"}
    <div class="colle-send__preview" tabindex="-1">
      <div class="colle-send__preview-bar">
        <span class="colle-send__preview-title">{planches[previewIndex]?.meta.eleve || ""}</span>
        <span class="colle-send__preview-count">{previewIndex + 1} / {planches.length}</span>
        <div class="colle-send__preview-actions">
          {#if previewRendering}
            <span class="colle-send__preview-rendering">{t("colle.sendPreparing")}</span>
            <button
              type="button"
              class="colle-send__preview-btn"
              aria-label={t("common.cancel")}
              title={t("common.cancel")}
              onclick={handleCancel}
            >
              <i class="wxi-close" aria-hidden="true"></i>
            </button>
          {/if}
          {#snippet closePreviewIcon()}
            <i class="wxi-close" aria-hidden="true"></i>
          {/snippet}
          <Button
            variant="ghost"
            size="sm"
            icon={closePreviewIcon}
            onclick={handleClose}
          >
            {t("common.close")}
          </Button>
        </div>
      </div>
      <div class="colle-send__preview-body">
        <div class="colle-send__preview-img" onwheel={handleWheel}>
          {#if previewMsg}
            <img
              src={previewSrc}
              alt={t("colle.sendPreviewAlt")}
              style={`width: calc(100% * ${zoom})`}
            />
          {:else}
            <p class="colle-send__preview-empty">{t("colle.sendPreparing")}</p>
          {/if}
        </div>
        <div class="colle-send__preview-controls">
          <button
            type="button"
            class="colle-send__preview-btn"
            disabled={previewRendering || previewIndex <= 0}
            aria-label={t("colle.sendPreviewPrev")}
            title={t("colle.sendPreviewPrev")}
            onclick={() => gotoPreview(previewIndex - 1)}
          >
            <i class="wxi-chevron-left" aria-hidden="true"></i>
          </button>
          <span class="colle-send__preview-sep"></span>
          <button
            type="button"
            class="colle-send__preview-btn"
            aria-label={t("colle.sendZoomOut")}
            title={t("colle.sendZoomOut")}
            onclick={zoomOut}
          >
            <i class="wxi-zoom-out" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="colle-send__preview-btn colle-send__preview-zoom-reset"
            aria-label={t("colle.sendZoomReset")}
            title={t("colle.sendZoomReset")}
            onclick={resetZoom}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            class="colle-send__preview-btn"
            aria-label={t("colle.sendZoomIn")}
            title={t("colle.sendZoomIn")}
            onclick={zoomIn}
          >
            <i class="wxi-zoom-in" aria-hidden="true"></i>
          </button>
          <span class="colle-send__preview-sep"></span>
          <button
            type="button"
            class="colle-send__preview-btn"
            disabled={previewRendering || previewIndex >= planches.length - 1}
            aria-label={t("colle.sendPreviewNext")}
            title={t("colle.sendPreviewNext")}
            onclick={() => gotoPreview(previewIndex + 1)}
          >
            <i class="wxi-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
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
        <div class="colle-send__actions">
          <Button variant="ghost" onclick={handleCancel}>{t("common.cancel")}</Button>
        </div>
      {:else if phase === "archiving"}
        <p class="colle-send__status">
          {#if archiveProgress}
            {t("colle.archiving", { done: archiveProgress.done, total: archiveProgress.total })}
          {:else}
            {t("colle.archiving", { done: 0, total: planches.length })}
          {/if}
        </p>
        <div class="colle-send__actions">
          <Button variant="ghost" onclick={handleCancel}>{t("common.cancel")}</Button>
        </div>
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
              disabled={sending || !planches.length}
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
  /* La largeur vient de la prop `width` de l'Overlay (min(1100px, 94vw)) —
     le .mdv-overlay--modal fixe 580px aurait rétréci l'aperçu. `width: 100%`
     épouse le conteneur (align stretch bat un width explicite). */
  /* HAUTEUR DÉFINITIVE (`height: 76vh` = le max-height du modal) : le modal
     se dimensionne par le contenu (auto, clampé à 76vh) — un `flex:1` dans
     un conteneur à hauteur auto s'effondre à 0 (flex-basis 0, pas de free
     space) et un `.preview-img` en position ABSOLUE ne contribue plus au
     calcul du contenu → la modale se réduisait à la barre, plus d'image.
     Avec une hauteur définie, la chaîne flex en aval est déterministe. */
  .colle-send__preview {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 76vh;
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
  .colle-send__preview-btn:hover {
    background: var(--surface-hover);
    color: var(--fg);
  }
  .colle-send__preview-btn i {
    font-size: 15px;
  }
  .colle-send__preview-rendering {
    align-self: center;
    color: var(--fg-muted);
    font-size: 12px;
  }
  /* Corps du carrousel : zone d'image scrollable + barre de contrôles en
     overlay centrée en bas (absolue dans .preview-body — elle ne défile pas
     avec l'image). Flex column : .preview-img est un ITEM flex → il s'étire
     à la hauteur du corps par l'algorithme flex (stretch), AUCUN pourcentage
     à résoudre — le pattern .mdv-settings__nav de SettingsOverlay. */
  .colle-send__preview-body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  /* EN FLUX : l'image doit contribuer au dimensionnement du contenu du modal
     (sinon la modale se réduit à la barre — l'absolu de l'itération
     précédente l'en retirait). `flex: 1; min-height: 0` = étiré à la hauteur
     définitive du corps, overflow auto → scroll vertical. */
  .colle-send__preview-img {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 18px 24px 84px;
  }
  /* Layout BLOCK (pas flex) : un item flex garde `min-width: auto` = largeur
     intrinsèque 1280px de l'image → max-width:100% était battu → image
     tronquée. En block + margin:auto, la largeur (inline `calc(100% * zoom)`)
     scale (zoom-out) et le défilement vertical du conteneur couvre la
     hauteur. Pas de max-width : la largeur est TOUJOURS calculée (zoom=1 →
     100%), un zoom > 1 déborde volontairement et fait défiler l'axe X. */
  .colle-send__preview-img img {
    display: block;
    margin: 0 auto;
    height: auto;
    box-shadow: 0 2px 12px rgb(0 0 0 / 0.18);
    border-radius: 4px;
  }
  .colle-send__preview-empty {
    margin: 0;
    color: var(--fg-muted);
    font-size: 13px;
  }
  /* Barre de contrôles : pilule en overlay, centrée en bas de l'image.
     Les chevrons du carrousel récupèrent l'espace horizontal (les flèches
     latérales à top:50% gâchaient la largeur du preview). */
  .colle-send__preview-controls {
    position: absolute;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.28);
    backdrop-filter: blur(6px);
  }
  .colle-send__preview-controls .colle-send__preview-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
  }
  .colle-send__preview-controls .colle-send__preview-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .colle-send__preview-sep {
    width: 1px;
    height: 16px;
    margin: 0 3px;
    background: var(--border);
  }
  .colle-send__preview-zoom-reset {
    min-width: 44px;
    font-size: 11px;
    font-weight: 600;
    color: var(--fg-muted);
  }
  .colle-send__preview-zoom-reset:hover:not(:disabled) {
    color: var(--fg);
  }
</style>
