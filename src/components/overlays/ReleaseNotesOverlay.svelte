<script lang="ts">
/**
 * Modale « À propos » — notes de version (bouton de la barre d'état, à droite
 * de l'aide).
 *
 * Le CONTENU vient de `@/lib/release-notes` (structure) et des locales
 * (`release.*`, textes) : ce composant n'est qu'un gabarit. Le numéro affiché
 * vient de `getVersion()` (Tauri → `tauri.conf.json`), jamais de la constante
 * du module — c'est le binaire qui fait foi, pas la table.
 */
import { getVersion } from "@tauri-apps/api/app";
import { Button, Overlay } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import { CURRENT_RELEASE } from "@/lib/release-notes";
import mascotUrl from "@/assets/mascot/az-excite.svg";

let t = $derived(getT($language));

let {
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
} = $props();

// Résolue UNE fois pour la durée du process (le binaire ne change pas en
// cours de route) — la modale se rouvre sans re-solliciter Tauri.
let cachedVersion: string | null = null;
let version = $state<string | null>(cachedVersion);

$effect(() => {
  if (!open || cachedVersion) return;
  let cancelled = false;
  getVersion()
    .then((v) => {
      if (cancelled) return;
      cachedVersion = v;
      version = v;
    })
    .catch(() => {
      if (!cancelled) version = null;
    });
  return () => { cancelled = true; };
});

// Date de la version dans la locale active (la note porte un ISO ; midi pour
// éviter le décalage de fuseau qui ferait reculer d'un jour).
let releaseDate = $derived.by(() => {
  const parsed = new Date(`${CURRENT_RELEASE.date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return CURRENT_RELEASE.date;
  return parsed.toLocaleDateString($language, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});
</script>

{#snippet releaseCloseIcon()}
  <i class="wxi-x" style="font-size:14px"></i>
{/snippet}

<Overlay {open} {onClose} ariaLabel={t("release.ariaLabel")} variant="modal">
  <header class="mdv-release__header">
    <span class="mdv-release__eyebrow">{t("release.eyebrow")}</span>
    <Button
      title={t("release.close")}
      aria-label={t("release.close")}
      onclick={onClose}
      icon={releaseCloseIcon}
    />
  </header>

  <div class="mdv-release__body">
    <div class="mdv-release__identity">
      <img
        src={mascotUrl}
        alt=""
        aria-hidden="true"
        width={56}
        height={56}
        loading="eager"
        draggable={false}
        class="mdv-release__art"
      />
      <div class="mdv-release__titles">
        <div class="mdv-release__brand">AZprose</div>
        <div class="mdv-release__meta">
          <span class="mdv-release__version">{version ? `v${version}` : "v…"}</span>
          <span class="mdv-release__dot" aria-hidden="true">·</span>
          <span>{releaseDate}</span>
        </div>
      </div>
    </div>

    <p class="mdv-release__intro">{t(CURRENT_RELEASE.intro)}</p>

    <ul class="mdv-release__list" aria-label={t("release.highlightsAria")}>
      {#each CURRENT_RELEASE.highlights as h (h.title)}
        <li class="mdv-release__item">
          <i class="mdv-release__icon {h.icon}" aria-hidden="true"></i>
          <div class="mdv-release__text">
            <span class="mdv-release__item-title">{t(h.title)}</span>
            <span class="mdv-release__item-body">{t(h.body)}</span>
          </div>
        </li>
      {/each}
    </ul>

    {#if CURRENT_RELEASE.caveat}
      <p class="mdv-release__caveat">
        <i class="wxi-info" aria-hidden="true"></i>
        <span>{t(CURRENT_RELEASE.caveat)}</span>
      </p>
    {/if}
  </div>

  <footer class="mdv-release__footer">
    <span>{t("release.footer")}</span>
  </footer>
</Overlay>
