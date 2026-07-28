<script lang="ts">
let {
  icon,
  size = 16,
  strokeWidth: _strokeWidth,
  title,
}: {
  icon: string;
  size?: number;
  strokeWidth?: number;
  title?: string;
} = $props();
</script>

<i
  class={icon}
  style="font-size:{size}px"
  aria-label={title}
  aria-hidden={title ? undefined : true}
></i>
