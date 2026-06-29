<script lang="ts">
  let {
    rootName,
  }: {
    rootName?: string;
  } = $props();
</script>

<header class="mdv-titlebar" data-tauri-drag-region>
  <div class="mdv-titlebar__lead" data-tauri-drag-region />

  {#if rootName}
    <div class="mdv-titlebar__center" data-tauri-drag-region>
      <span class="mdv-titlebar__filename" data-tauri-drag-region>
        {rootName}
      </span>
    </div>
  {/if}

  <div class="mdv-titlebar__actions" data-tauri-drag-region />
</header>
