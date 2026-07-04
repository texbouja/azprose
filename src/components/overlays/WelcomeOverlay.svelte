<script lang="ts">
import { ChevronLeft, ChevronRight, FolderOpen, Sparkles } from "@/lib/icons";
import { Button, Icon, Kbd, Overlay, Shortcut } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import logoUrl from "@/assets/mascot/az-logo.svg";
import notebookUrl from "@/assets/mascot/notebook.png";
import penUrl from "@/assets/mascot/pen.png";
import exciteUrl from "@/assets/mascot/az-excite.svg";

let t = $derived(getT($language));

let {
  open,
  onClose,
  onOpenFolder,
}: {
  open: boolean;
  onClose: () => void;
  onOpenFolder: () => void;
} = $props();

type Slide = {
  mascot: string;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    mascot: logoUrl,
    title: "welcome.slide1.title",
    body: "welcome.slide1.body",
  },
  {
    mascot: notebookUrl,
    title: "welcome.slide2.title",
    body: "welcome.slide2.body",
  },
  {
    mascot: penUrl,
    title: "welcome.slide3.title",
    body: "welcome.slide3.body",
  },
  {
    mascot: exciteUrl,
    title: "welcome.slide4.title",
    body: "welcome.slide4.body",
  },
];

let step = $state(0);

$effect(() => {
  if (open) step = 0;
});

let slide = $derived(SLIDES[step]);
let isFirst = $derived(step === 0);
let isLast = $derived(step === SLIDES.length - 1);

const next = () => step = Math.min(SLIDES.length - 1, step + 1);
const prev = () => step = Math.max(0, step - 1);

$effect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isLast) {
        onClose();
        void onOpenFolder();
      } else {
        next();
      }
    }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
});
</script>

{#snippet chevronLeftIcon()}
  <Icon icon={ChevronLeft} size={14} strokeWidth={1.75} />
{/snippet}
{#snippet sparklesIcon()}
  <Icon icon={Sparkles} size={14} strokeWidth={1.75} />
{/snippet}
{#snippet folderOpenIcon()}
  <Icon icon={FolderOpen} size={14} strokeWidth={1.75} />
{/snippet}
{#snippet chevronRightIcon()}
  <Icon icon={ChevronRight} size={14} strokeWidth={1.75} />
{/snippet}

<Overlay {open} {onClose} ariaLabel={t("welcome.ariaLabel")} variant="modal">
  <div class="mdv-welcome">
    <div class="mdv-welcome__slide">
      <img
        src={slide.mascot}
        alt=""
        aria-hidden="true"
        width={140}
        height={140}
        draggable={false}
        class="mdv-welcome__art"
      />
      <h1 class="mdv-welcome__title">{t(slide.title)}</h1>
      <p class="mdv-welcome__body">{t(slide.body)}</p>
    </div>

    <div class="mdv-welcome__dots" aria-label={t("welcome.progress")}>
      {#each SLIDES as _, i}
        <button
          type="button"
          class="mdv-welcome__dot{i === step ? " is-active" : ""}"
          onclick={() => step = i}
          aria-current={i === step ? "step" : undefined}
          aria-label={t("welcome.step", { n: i + 1 })}
        ></button>
      {/each}
    </div>

    <div class="mdv-welcome__actions">
      {#if !isFirst}
        <Button onclick={prev} icon={chevronLeftIcon}>{t("welcome.back")}</Button>
      {:else}
        <Button onclick={onClose}>{t("welcome.skip")}</Button>
      {/if}
      {#if isLast}
        <Button onclick={onClose} icon={sparklesIcon}>{t("welcome.exploreDemo")}</Button>
        <Button
          variant="solid"
          onclick={() => { onClose(); void onOpenFolder(); }}
          icon={folderOpenIcon}
        >
          {t("welcome.openFolder")}
        </Button>
      {:else}
        <Button variant="solid" onclick={next} iconRight={chevronRightIcon}>{t("welcome.next")}</Button>
      {/if}
    </div>

    <div class="mdv-welcome__hint">
      {#if isLast}
        <Shortcut keys="⌘+⇧+O" /> <span>{t("welcome.hintOpenFolder")}</span>
        <span class="mdv-welcome__hint-sep">·</span>
        <Kbd>↵</Kbd> <span>{t("welcome.hintOrClick")}</span>
        <span class="mdv-welcome__hint-sep">·</span>
        <Kbd>esc</Kbd> <span>{t("welcome.hintClose")}</span>
      {:else}
        <Kbd>↵</Kbd> <span>{t("welcome.hintOr")}</span> <Kbd>→</Kbd> <span>{t("welcome.hintNext")}</span>
        <span class="mdv-welcome__hint-sep">·</span>
        <Kbd>esc</Kbd> <span>{t("welcome.hintClose")}</span>
      {/if}
    </div>
  </div>
</Overlay>
