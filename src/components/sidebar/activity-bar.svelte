<script lang="ts">
import { Folder, Calendar } from "@/lib/icons";
import { Icon } from "@/components/primitives";
import { language, getT } from "@/lib/i18n";
import { sidebarView, type SidebarView } from "@/stores/sidebar-view.svelte";

let { onToggle }: { onToggle?: () => void } = $props();
let t = $derived(getT($language));

const items: { view: SidebarView; icon: typeof Folder | typeof Calendar; label: string }[] = [
  { view: "files",    icon: Folder,     label: "Explanateur" },
  { view: "journal",  icon: Calendar,   label: "Journal" },
];

function setView(view: SidebarView) {
  if (sidebarView.current === view) {
    onToggle?.();
  } else {
    sidebarView.current = view;
  }
}
</script>

<nav class="mdv-activity-bar" aria-label={t("sidebar.explorer")}>
  {#each items as item (item.view)}
    <button
      type="button"
      class="mdv-activity-bar__btn{sidebarView.current === item.view ? ' is-active' : ''}"
      aria-label={item.label}
      data-tooltip={item.label}
      onclick={() => setView(item.view)}
    >
      <Icon icon={item.icon} size={18} strokeWidth={1.5} />
    </button>
  {/each}
</nav>
