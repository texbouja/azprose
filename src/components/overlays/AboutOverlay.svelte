<script lang="ts">
import { Download, FileText, FolderOpen, Globe, Palette, Star, Workflow, X } from "lucide-svelte";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button, Icon, Overlay } from "@/components/primitives";
import mascotUrl from "@/assets/mascot/excite.png";

let {
  open,
  onClose,
  onCheckForUpdates = undefined,
}: {
  open: boolean;
  onClose: () => void;
  onCheckForUpdates?: () => void | Promise<void>;
} = $props();

const REPO_URL = "https://github.com/azprose/azprose";
const SITE_URL = "https://azprose.app";

const FEATURES = [
  { icon: FileText, label: "markdown", detail: "WYSIWYM" },
  { icon: Palette, label: "math", detail: "MathJax" },
  { icon: FolderOpen, label: "projets", detail: "vaults" },
  { icon: Workflow, label: "LaTeX", detail: "compilation" },
  { icon: Download, label: "PDF", detail: "export + linking" },
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
  <Icon icon={X} size={14} strokeWidth={1.5} />
{/snippet}

<Overlay {open} {onClose} ariaLabel="about AZprose" variant="modal">
  <header class="mdv-about__header">
    <span class="mdv-about__eyebrow">about</span>
    <Button
      title="close (esc)"
      aria-label="close"
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
      <span>MIT</span>
    </div>
    {#if onCheckForUpdates}
      <button
        type="button"
        class="mdv-about__check"
        onclick={() => void handleCheck()}
        disabled={checking}
      >
        <Icon icon={Download} size={12} strokeWidth={1.5} />
        {checking ? "checking\u2026" : "check for updates"}
      </button>
    {/if}
    <p class="mdv-about__tagline">
      éditeur de texte scientifique — Markdown, LaTeX, PDF.
    </p>

    <div class="mdv-about__features" aria-label="AZprose features">
      {#each FEATURES as feature}
        <div class="mdv-about__feature">
          <Icon icon={feature.icon} size={13} strokeWidth={1.6} />
          <span class="mdv-about__feature-label">{feature.label}</span>
          <span class="mdv-about__feature-detail">{feature.detail}</span>
        </div>
      {/each}
    </div>

    <div class="mdv-about__links">
      <button
        type="button"
        class="mdv-about__link mdv-about__link--star"
        onclick={() => void handleOpen(REPO_URL)}
      >
        <Icon icon={Star} size={13} strokeWidth={1.5} />
        star on github
      </button>
      <button
        type="button"
        class="mdv-about__link"
        onclick={() => void handleOpen(SITE_URL)}
      >
        <Icon icon={Globe} size={13} strokeWidth={1.5} />
        azprose.app
      </button>
    </div>
  </div>

  <footer class="mdv-about__footer">
    <span>fork de marka.md · MIT</span>
  </footer>
</Overlay>
