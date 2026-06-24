<script lang="ts">
import { Icon, Kbd, Overlay } from "@/components/primitives";
import { filterAndRankCommands, shortcutLabel, type Translate } from "@/lib";
import { CATEGORY_ORDER, type Command, type CommandCategory } from "@/lib/commands";
import { language, getT } from "@/lib/i18n";

export type { Command };

let {
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
} = $props();

let t = $derived(getT($language));

let query = $state("");
let activeIndex = $state(0);
let inputEl: HTMLInputElement | null = $state(null);
let listEl: HTMLUListElement | null = $state(null);

type RenderRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "item"; key: string; cmd: Command; index: number };

function buildRows(commands: Command[], grouped: boolean, tr: Translate): RenderRow[] {
  if (!grouped) {
    return commands.map((cmd, i) => ({ kind: "item", key: cmd.id, cmd, index: i }));
  }

  const byCategory = new Map<CommandCategory | "other", Command[]>();
  for (const cmd of commands) {
    const key = cmd.category ?? "other";
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(cmd);
    else byCategory.set(key, [cmd]);
  }

  const rows: RenderRow[] = [];
  let index = 0;
  for (const cat of CATEGORY_ORDER) {
    const bucket = byCategory.get(cat);
    if (!bucket || bucket.length === 0) continue;
    rows.push({ kind: "header", key: `h-${cat}`, label: tr(`command.${cat}`) });
    for (const cmd of bucket) {
      rows.push({ kind: "item", key: cmd.id, cmd, index });
      index += 1;
    }
  }
  const other = byCategory.get("other");
  if (other && other.length > 0) {
    rows.push({ kind: "header", key: "h-other", label: tr("command.other") });
    for (const cmd of other) {
      rows.push({ kind: "item", key: cmd.id, cmd, index });
      index += 1;
    }
  }
  return rows;
}

let filtered = $derived(filterAndRankCommands(commands, query));
let rows = $derived(buildRows(filtered, query.trim().length === 0, t));
let itemCount = $derived(rows.filter((r) => r.kind === "item").length);

$effect(() => {
  if (!open) return;
  query = "";
  activeIndex = 0;
  requestAnimationFrame(() => inputEl?.focus());
});

$effect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(itemCount - 1, activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) {
        onClose();
        void cmd.action();
      }
    }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
});

$effect(() => {
  if (!open || !listEl) return;
  const el = listEl.querySelector<HTMLLIElement>(`[data-index="${activeIndex}"]`);
  el?.scrollIntoView({ block: "nearest" });
});
</script>

<Overlay {open} {onClose} ariaLabel={t("command.placeholder")} variant="palette">
  <div class="mdv-palette__search">
    <input
      bind:this={inputEl}
      class="mdv-palette__input"
      placeholder={t("command.placeholder")}
      bind:value={query}
      oninput={() => activeIndex = 0}
      autocomplete="off"
      spellcheck={false}
    />
  </div>
  <ul class="mdv-palette__list" role="listbox" bind:this={listEl}>
    {#if rows.length === 0}
      <li class="mdv-palette__empty">{t("command.noMatches")}</li>
    {:else}
      {#each rows as row}
        {#if row.kind === "header"}
          <li key={row.key} class="mdv-palette__group" role="presentation">{row.label}</li>
        {:else}
          {@const cmd = row.cmd}
          {@const index = row.index}
          <li
            key={row.key}
            data-index={index}
            class="mdv-palette__item{index === activeIndex ? " is-active" : ""}"
            onclick={() => { onClose(); void cmd.action(); }}
            onkeydown={(e) => { if (e.key === "Enter") { onClose(); void cmd.action(); } }}
            onmouseenter={() => activeIndex = index}
            role="option"
            aria-selected={index === activeIndex}
          >
            {#if cmd.icon}
              <span class="mdv-palette__icon">
                <Icon icon={cmd.icon} size={14} strokeWidth={1.5} />
              </span>
            {/if}
            <span class="mdv-palette__label">
              {cmd.label}
              {#if cmd.hint}
                <span class="mdv-palette__hint"> · {cmd.hint}</span>
              {/if}
            </span>
            {#if cmd.shortcut}
              <Kbd class="mdv-kbd--muted">{shortcutLabel(cmd.shortcut)}</Kbd>
            {/if}
          </li>
        {/if}
      {/each}
    {/if}
  </ul>
  <div class="mdv-palette__footer">
    <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> {t("command.navigate")}</span>
    <span><Kbd>↵</Kbd> {t("command.run")}</span>
    <span><Kbd>esc</Kbd> {t("command.close")}</span>
  </div>
</Overlay>
