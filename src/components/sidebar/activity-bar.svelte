<script lang="ts">
import { language, getT } from "@/lib/i18n";
import { sidebarView, type SidebarView } from "@/stores/sidebar-view.svelte";

let {
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle?: () => void;
} = $props();
let t = $derived(getT($language));

const items: { view: SidebarView; icon: string; label: string }[] = [
  { view: "files",    icon: "wxi-folder",     label: "Explanateur" },
  { view: "journal",  icon: "wxi-calendar",   label: "Journal" },
];

function setView(view: SidebarView) {
  if (sidebarView.current === view && isOpen) {
    // VSCode convention: clicking active view icon hides sidebar
    onToggle?.();
  } else {
    // Switch view (and open sidebar if closed)
    sidebarView.current = view;
    if (!isOpen) onToggle?.();
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
      <i class={item.icon} style="font-size:18px"></i>
    </button>
  {/each}
</nav>
