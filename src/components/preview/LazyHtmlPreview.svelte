<script lang="ts">
import { basename } from "@/lib";

let {
  value = "",
  filePath = null as string | null,
}: {
  value?: string;
  filePath?: string | null;
} = $props();

let title = $derived(filePath ? basename(filePath) : "preview");
</script>

<div class="mdv-html-preview">
  <iframe
    sandbox="allow-same-origin"
    srcdoc={value}
    title={title}
    style="width:100%;height:100%;border:none;background:#fff"
  />
</div>

<style>
.mdv-html-preview {
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
