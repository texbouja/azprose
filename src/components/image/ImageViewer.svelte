<script lang="ts">
import { readFile } from "@tauri-apps/plugin-fs";
import { ZoomIn, ZoomOut, Maximize2, Image as ImageIcon } from "@/lib/icons";
import { Icon } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";

let t = $derived(getT($language));

let { path }: { path: string } = $props();

let blobUrl = $state<string | null>(null);
let error = $state<string | null>(null);
let loading = $state(true);
let naturalW = $state(0);
let naturalH = $state(0);
let displayW = $state<number | null>(null); // null = fit mode

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

let viewportEl: HTMLDivElement;

$effect(() => {
  const currentPath = path;
  let cancelled = false;
  let prevUrl: string | null = null;
  loading = true;
  error = null;
  displayW = null;

  readFile(currentPath)
    .then((bytes) => {
      if (cancelled) return;
      const ext = currentPath.split(".").pop()?.toLowerCase() ?? "";
      const mime = MIME[ext] ?? "image/octet-stream";
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      prevUrl = url;
      blobUrl = url;
      loading = false;
    })
    .catch((e) => {
      if (cancelled) return;
      error = String(e);
      loading = false;
    });

  return () => {
    cancelled = true;
    if (prevUrl) URL.revokeObjectURL(prevUrl);
  };
});

function onImageLoad(e: Event) {
  const img = e.currentTarget as HTMLImageElement;
  naturalW = img.naturalWidth;
  naturalH = img.naturalHeight;
}

function zoomIn() {
  const base = displayW ?? fitWidth();
  displayW = Math.round(base * 1.25);
}

function zoomOut() {
  const base = displayW ?? fitWidth();
  displayW = Math.max(32, Math.round(base / 1.25));
}

function fitWidth(): number {
  if (!viewportEl) return naturalW || 800;
  return Math.min(naturalW || 800, viewportEl.clientWidth - 40);
}

function resetFit() {
  displayW = null;
}

function zoomLabel(): string {
  if (!naturalW) return "—";
  if (displayW === null) return t("image.fit");
  return `${Math.round((displayW / naturalW) * 100)}%`;
}
</script>

<div class="img-shell">
  <div class="img-viewport" bind:this={viewportEl}>
    {#if loading}
      <div class="img-overlay">
        <Icon icon={ImageIcon} size={28} strokeWidth={1.2} />
        <span class="img-loading-text">{t("image.loading")}</span>
      </div>
    {:else if error}
      <div class="img-overlay img-error-overlay">
        <Icon icon={ImageIcon} size={28} strokeWidth={1.2} />
        <p>{t("image.cannotLoad")}</p>
        <code>{error}</code>
      </div>
    {:else if blobUrl}
      <img
        src={blobUrl}
        alt={path.split("/").pop()}
        onload={onImageLoad}
        style={displayW !== null ? `width:${displayW}px;height:auto;` : "max-width:100%;max-height:100%;object-fit:contain;"}
        draggable={false}
        class="img-canvas"
      />
    {/if}
  </div>

  <div class="img-toolbar">
    <button
      type="button"
      class="img-tool-btn"
      data-tooltip={t("image.zoomIn")}
      aria-label={t("image.zoomIn")}
      onclick={zoomIn}
      disabled={!blobUrl}
    >
      <Icon icon={ZoomIn} size={14} strokeWidth={1.5} />
    </button>
    <span class="img-scale-label">{zoomLabel()}</span>
    <button
      type="button"
      class="img-tool-btn"
      data-tooltip={t("image.zoomOut")}
      aria-label={t("image.zoomOut")}
      onclick={zoomOut}
      disabled={!blobUrl}
    >
      <Icon icon={ZoomOut} size={14} strokeWidth={1.5} />
    </button>
    <hr class="img-toolbar-sep" />
    <button
      type="button"
      class="img-tool-btn"
      data-tooltip={t("image.fitToWindow")}
      aria-label={t("image.fitToWindow")}
      onclick={resetFit}
      disabled={!blobUrl}
    >
      <Icon icon={Maximize2} size={13} strokeWidth={1.5} />
    </button>
    {#if naturalW && naturalH}
      <hr class="img-toolbar-sep" />
      <span class="img-scale-label">{naturalW}<br /><span class="img-dim-x">×</span><br />{naturalH}</span>
    {/if}
  </div>
</div>

<style>
.img-shell {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--surface);
}

.img-viewport {
  position: absolute;
  inset: 0;
  right: 44px;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--surface);
}

.img-canvas {
  display: block;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  border-radius: 2px;
}

.img-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--muted);
}

.img-loading-text {
  font-size: 0.875rem;
}

.img-error-overlay {
  font-size: 0.875rem;
}

.img-error-overlay p {
  margin: 0;
  font-weight: 500;
}

.img-error-overlay code {
  font-size: 0.8rem;
  font-family: var(--font-mono);
  color: var(--syntax-comment);
  max-width: 80%;
  text-align: center;
  word-break: break-all;
}

.img-toolbar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  gap: 4px;
  background: var(--bg);
  border-left: 1px solid var(--border);
  overflow: hidden;
}

.img-tool-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 6px;
  flex-shrink: 0;
  color: var(--fg);
  background: transparent;
  border: none;
  cursor: pointer;
}

.img-tool-btn:hover:not(:disabled) {
  background: var(--surface-hover);
}

.img-tool-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.img-scale-label {
  font-size: 9px;
  color: var(--muted);
  text-align: center;
  white-space: nowrap;
  line-height: 1.2;
  padding: 2px 0;
}

.img-dim-x {
  font-size: 8px;
  opacity: 0.6;
}

.img-toolbar-sep {
  width: 70%;
  border: none;
  border-top: 1px solid var(--border);
  margin: 2px 0;
}
</style>
