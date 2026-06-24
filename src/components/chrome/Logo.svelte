<script lang="ts">
  import logoUrl from "@/assets/mascot/mdview-transpa-bg.png";

  let { size = 22, title = "AZprose" }: { size?: number; title?: string } = $props();
</script>

<img
  src={logoUrl}
  width={size}
  height={size}
  alt={title}
  draggable={false}
  style="display: block; user-select: none;"
/>
