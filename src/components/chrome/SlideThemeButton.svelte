<script lang="ts">
  import { Palette, Check } from "@/lib/icons";
  import { Button, Icon, Popover } from "@/components/primitives";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import { slideSettings, SLIDE_THEMES, type SlideTheme } from "@/stores/slide-settings.svelte";

  let t = $derived(getT($language));

  let menuOpen = $state(false);
  let anchorEl: HTMLDivElement | null = null;

  function pick(id: SlideTheme) {
    slideSettings.theme = id;
    menuOpen = false;
  }
</script>

<div class="mdv-slide-theme-btn" bind:this={anchorEl}>
  <Button
    data-tooltip={t("slideThemeButton.label")}
    aria-label={t("slideThemeButton.label")}
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    onclick={() => (menuOpen = !menuOpen)}
  >
    {#snippet icon()}
      <Icon icon={Palette} size={14} strokeWidth={1.5} />
    {/snippet}
  </Button>
  <Popover open={menuOpen} onClose={() => (menuOpen = false)} anchorRef={{ current: anchorEl }}>
    <div class="mdv-menu">
      {#each SLIDE_THEMES as th (th.id)}
        {@const active = slideSettings.theme === th.id}
        <button
          type="button"
          class="mdv-menu__item"
          class:is-active={active}
          onclick={() => pick(th.id)}
          role="menuitemradio"
          aria-checked={active}
        >
          <span class="mdv-menu__item-label">{th.label}</span>
          {#if active}
            <span class="mdv-menu__item-check">
              <Icon icon={Check} size={13} strokeWidth={2} />
            </span>
          {/if}
        </button>
      {/each}
    </div>
  </Popover>
</div>
