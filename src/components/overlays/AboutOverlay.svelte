<script lang="ts">
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button, Overlay } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import mascotUrl from "@/assets/mascot/az-excite.svg";

let t = $derived(getT($language));

let {
  open,
  onClose,
  onCheckForUpdates = undefined,
}: {
  open: boolean;
  onClose: () => void;
  onCheckForUpdates?: () => void | Promise<void>;
} = $props();

const REPO_URL = "https://github.com/texbouja/azprose";
const SITE_URL = "https://azprose.app";

const FEATURES = [
  { icon: "wxi-file-text", label: "about.feature.markdown", detail: "about.feature.markdownDetail" },
  { icon: "wxi-palette", label: "about.feature.math", detail: "about.feature.mathDetail" },
  { icon: "wxi-folder-open", label: "about.feature.projects", detail: "about.feature.projectsDetail" },
  { icon: "wxi-workflow", label: "about.feature.latex", detail: "about.feature.latexDetail" },
  { icon: "wxi-download", label: "about.feature.pdf", detail: "about.feature.pdfDetail" },
];

let cachedVersion: string | null = null;

let checking = $state(false);
let version = $state<string | null>(cachedVersion);

const handleCheck = async () => {
  if (!onCheckForUpdates || checking) return;
  checking = true;
  try {
    await onCheckForUpdates();
  } finally {
    checking = false;
  }
};

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

const handleOpen = async (url: string) => {
  try {
    await openUrl(url);
  } catch (err) {
    console.error("azprose: openUrl failed", err);
  }
};
</script>

{#snippet aboutCloseIcon()}
  <i class="wxi-x" style="font-size:14px"></i>
{/snippet}

<Overlay {open} {onClose} ariaLabel={t("about.ariaLabel")} variant="modal">
  <header class="mdv-about__header">
    <span class="mdv-about__eyebrow">{t("about.eyebrow")}</span>
    <Button
      title={t("about.closeTitle")}
      aria-label={t("about.closeLabel")}
      onclick={onClose}
      icon={aboutCloseIcon}
    />
  </header>

  <div class="mdv-about__body">
    <img
      src={mascotUrl}
      alt=""
      aria-hidden="true"
      width={88}
      height={88}
      loading="eager"
      draggable={false}
      class="mdv-about__art"
    />
    <div class="mdv-about__brand">AZprose</div>
    <div class="mdv-about__version">
      <span class="mdv-about__version-num">{version ? `v${version}` : "v\u2026"}</span>
      <span class="mdv-about__dot" aria-hidden="true"> · </span>
      <span>{t("about.license")}</span>
    </div>
    {#if onCheckForUpdates}
      <button
        type="button"
        class="mdv-about__check"
        onclick={() => void handleCheck()}
        disabled={checking}
      >
        <i class="wxi-download" style="font-size:12px"></i>
        {checking ? t("about.checking") : t("about.checkForUpdates")}
      </button>
    {/if}
    <p class="mdv-about__tagline">
      {t("about.tagline")}
    </p>

    <div class="mdv-about__features" aria-label={t("about.featuresAria")}>
      {#each FEATURES as feature}
        <div class="mdv-about__feature">
          <i class={feature.icon} style="font-size:13px"></i>
          <span class="mdv-about__feature-label">{t(feature.label)}</span>
          <span class="mdv-about__feature-detail">{t(feature.detail)}</span>
        </div>
      {/each}
    </div>

    <div class="mdv-about__links">
      <button
        type="button"
        class="mdv-about__link mdv-about__link--star"
        onclick={() => void handleOpen(REPO_URL)}
      >
        <i class="wxi-star" style="font-size:13px"></i>
        {t("about.starOnGithub")}
      </button>
      <button
        type="button"
        class="mdv-about__link"
        onclick={() => void handleOpen(SITE_URL)}
      >
        <i class="wxi-globe" style="font-size:13px"></i>
        {t("about.site")}
      </button>
    </div>
  </div>

  <footer class="mdv-about__footer">
    <span>{t("about.footer")}</span>
  </footer>
</Overlay>
