<script lang="ts">
import { ChevronLeft, ChevronRight, FolderOpen, Sparkles } from "lucide-svelte";
import { Button, Icon, Kbd, Overlay, Shortcut } from "@/components/primitives";
import logoUrl from "@/assets/mascot/mdview-transpa-bg.png";
import notebookUrl from "@/assets/mascot/notebook.png";
import penUrl from "@/assets/mascot/pen.png";
import exciteUrl from "@/assets/mascot/excite.png";

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
    title: "bienvenue dans AZprose",
    body: "éditeur de texte scientifique. Markdown, LaTeX, PDF. tout reste local.",
  },
  {
    mascot: notebookUrl,
    title: "ouvrez votre espace de travail",
    body: "pressez ⌘⇧O pour ouvrir un dossier. utilisez la barre latérale pour naviguer dans vos fichiers.",
  },
  {
    mascot: penUrl,
    title: "écrivez en Markdown",
    body: "l'éditeur WYSIWYM fusionne la rédaction et la prévisualisation. les maths LaTeX via MathJax sont rendues en direct.",
  },
  {
    mascot: exciteUrl,
    title: "prêt quand vous l'êtes",
    body: "utilisez ⌘K pour les commandes, les thèmes, la langue et l'aide.",
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

<Overlay {open} {onClose} ariaLabel="bienvenue dans AZprose" variant="modal">
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
      <h1 class="mdv-welcome__title">{slide.title}</h1>
      <p class="mdv-welcome__body">{slide.body}</p>
    </div>

    <div class="mdv-welcome__dots" aria-label="tutorial progress">
      {#each SLIDES as _, i}
        <button
          type="button"
          class="mdv-welcome__dot{i === step ? " is-active" : ""}"
          onclick={() => step = i}
          aria-current={i === step ? "step" : undefined}
          aria-label="step {i + 1}"
        ></button>
      {/each}
    </div>

    <div class="mdv-welcome__actions">
      {#if !isFirst}
        <Button onclick={prev} icon={chevronLeftIcon}>back</Button>
      {:else}
        <Button onclick={onClose}>skip</Button>
      {/if}
      {#if isLast}
        <Button onclick={onClose} icon={sparklesIcon}>explore the demo</Button>
        <Button
          variant="solid"
          onclick={() => { onClose(); void onOpenFolder(); }}
          icon={folderOpenIcon}
        >
          open a folder
        </Button>
      {:else}
        <Button variant="solid" onclick={next} iconRight={chevronRightIcon}>next</Button>
      {/if}
    </div>

    <div class="mdv-welcome__hint">
      {#if isLast}
        <Shortcut keys="⌘+⇧+O" /> <span>open a folder</span>
        <span class="mdv-welcome__hint-sep">·</span>
        <Kbd>↵</Kbd> <span>or click</span>
        <span class="mdv-welcome__hint-sep">·</span>
        <Kbd>esc</Kbd> <span>close</span>
      {:else}
        <Kbd>↵</Kbd> <span>or</span> <Kbd>→</Kbd> <span>next</span>
        <span class="mdv-welcome__hint-sep">·</span>
        <Kbd>esc</Kbd> <span>close</span>
      {/if}
    </div>
  </div>
</Overlay>
