<script lang="ts">
import { FileText } from "@/lib/icons";
import { Icon } from "@/components/primitives";
import inspectUrl from "@/assets/mascot/inspect.png";

let { active }: { active: boolean } = $props();
</script>

{#if active}
  <div class="mdv-drop" role="status" aria-live="polite">
    <div class="mdv-drop__panel">
      <img
        src={inspectUrl}
        alt=""
        aria-hidden="true"
        width={120}
        height={120}
        draggable={false}
        class="mdv-drop__art"
      />
      <div class="mdv-drop__icon-row">
        <Icon icon={FileText} size={16} strokeWidth={1.5} />
        <span>drop your markdown here</span>
      </div>
      <span class="mdv-drop__hint">.md · .markdown · .mdx</span>
    </div>
  </div>
{/if}
