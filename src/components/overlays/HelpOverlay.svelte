<script lang="ts">
import { Download, FileText, Layers3, Palette, Sparkles, Table2, X } from "@/lib/icons";
import { Button, Icon, Kbd, Overlay, Shortcut } from "@/components/primitives";
import { shortcutLabel, type Translate } from "@/lib";
import { language, getT } from "@/lib/i18n";
import writeUrl from "@/assets/mascot/az-write.svg";

let {
  open,
  onClose,
  onReplayTutorial = undefined,
  onCheckForUpdates = undefined,
}: {
  open: boolean;
  onClose: () => void;
  onReplayTutorial?: () => void;
  onCheckForUpdates?: () => void | Promise<void>;
} = $props();

let t = $derived(getT($language));
let checking = $state(false);

let features = $derived([
  { icon: FileText, title: t("help.feature.markdown.title"), body: t("help.feature.markdown.body") },
  { icon: Layers3, title: t("help.feature.context.title"), body: t("help.feature.context.body") },
  { icon: Table2, title: t("help.feature.csv.title"), body: t("help.feature.csv.body") },
  { icon: Palette, title: t("help.feature.themes.title"), body: t("help.feature.themes.body") },
]);

type Row = { keys: string; label: string };
type Group = { title: string; rows: Row[] };

let groups = $derived<Group[]>([
  {
    title: t("help.file"),
    rows: [
      { keys: "⌘+⇧+O", label: t("help.openFolder") },
      { keys: "⌘+O", label: t("help.openFile") },
      { keys: "⌘+N", label: t("help.newUntitled") },
      { keys: "⌘+S", label: t("help.saveCurrent") },
      { keys: "⌘+⇧+S", label: t("help.saveAs") },
      { keys: "⌘+⌥+Z", label: t("help.undoSidebar") },
    ],
  },
  {
    title: t("help.view"),
    rows: [
      { keys: "⌘+K", label: t("help.openPalette") },
      { keys: "⌘+B", label: t("help.showHideSidebar") },
      { keys: "⌃+⌘+F", label: t("help.toggleFullscreen") },
    ],
  },
  {
    title: t("help.edit"),
    rows: [
      { keys: "⌘+F", label: t("help.findReplace") },
      { keys: "⌘+G", label: t("help.findNext") },
    ],
  },
  {
    title: t("help.share"),
    rows: [
      { keys: "⌘+P", label: t("help.exportPdf") },
    ],
  },
  {
    title: t("help.help"),
    rows: [
      { keys: "⌘+/", label: t("help.openThis") },
      { keys: "esc", label: t("help.closeAny") },
    ],
  },
]);

let tips = $derived(Array.from({ length: 8 }, (_, i) => t(`help.tip${i + 1}`)));

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
  if (!open || !onReplayTutorial) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onClose();
      onReplayTutorial();
    }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
});
</script>

{#snippet helpCloseIcon()}
  <Icon icon={X} size={14} strokeWidth={1.5} />
{/snippet}

<Overlay {open} {onClose} ariaLabel={t("help.aria")} variant="modal">
  <header class="mdv-help__header">
    <div class="mdv-help__title">
      <img
        src={writeUrl}
        alt=""
        aria-hidden="true"
        width={36}
        height={36}
        draggable={false}
        class="mdv-help__art"
      />
      <div class="mdv-help__title-text">
        <span class="mdv-help__brand">AZprose</span>
        <span class="mdv-help__subtitle">{t("help.subtitle")}</span>
      </div>
    </div>
    <Button
      title={t("app.closeEsc")}
      aria-label={t("app.close")}
      onclick={onClose}
      icon={helpCloseIcon}
    />
  </header>

  <div class="mdv-help__body">
    <section class="mdv-help__section">
      <h3 class="mdv-help__h">{t("help.features")}</h3>
      <div class="mdv-help__features">
        {#each features as feature}
          <article class="mdv-help__feature">
            <span class="mdv-help__feature-icon" aria-hidden="true">
              <Icon icon={feature.icon} size={14} strokeWidth={1.6} />
            </span>
            <span class="mdv-help__feature-title">{feature.title}</span>
            <span class="mdv-help__feature-body">{feature.body}</span>
          </article>
        {/each}
      </div>
    </section>

    <section class="mdv-help__section">
      <h3 class="mdv-help__h">{t("help.shortcuts")}</h3>
      <div class="mdv-help__groups">
        {#each groups as g}
          <div class="mdv-help__group">
            <div class="mdv-help__group-title">{g.title}</div>
            <ul class="mdv-help__list">
              {#each g.rows as s}
                <li class="mdv-help__row">
                  <span class="mdv-help__keys">
                    {#if s.keys.includes("+")}
                      <Shortcut keys={s.keys} />
                    {:else}
                      <Kbd>{s.keys}</Kbd>
                    {/if}
                  </span>
                  <span class="mdv-help__label">{s.label}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </section>

    <section class="mdv-help__section">
      <h3 class="mdv-help__h">{t("help.tips")}</h3>
      <ul class="mdv-help__tips">
        {#each tips as tip}
          <li>{shortcutLabel(tip)}</li>
        {/each}
      </ul>
    </section>
  </div>

  <footer class="mdv-help__footer">
    <span>AZprose · fork de marka.md · MIT</span>
    <div class="mdv-help__actions">
      {#if onCheckForUpdates}
        <button
          type="button"
          class="mdv-help__action"
          onclick={() => void handleCheck()}
          disabled={checking}
        >
          <Icon icon={Download} size={11} strokeWidth={1.75} />
          {checking ? "checking…" : t("command.checkUpdates")}
        </button>
      {/if}
      {#if onReplayTutorial}
        <button
          type="button"
          class="mdv-help__action"
          onclick={() => { onClose(); onReplayTutorial(); }}
        >
          <Icon icon={Sparkles} size={11} strokeWidth={1.75} />
          {t("help.replay")}
        </button>
      {/if}
    </div>
  </footer>
</Overlay>
