<script lang="ts">
import { Button, Shortcut } from "@/components/primitives";
import { getT } from "@/lib/i18n";
import { language } from "@/lib/i18n";
import logoUrl from "@/assets/mascot/az-logo.svg";

let t = $derived(getT($language));

let {
  onChooseFolder,
}: {
  /** Ouvre le sélecteur de dossier système : un dossier existant OU un nouveau
   *  (le dialogue natif permet de créer un dossier). Le dossier choisi devient
   *  le projet courant. */
  onChooseFolder: () => void;
} = $props();

// Raccourci ⌘⇧O (ou Ctrl⇧O) : ouvrir le sélecteur. Le gate est monté
// UNIQUEMENT tant qu'aucun projet n'est ouvert — la touche est donc toujours
// active dans cet état.
$effect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
      e.preventDefault();
      onChooseFolder();
    }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
});
</script>

{#snippet folderOpenIcon()}
  <i class="wxi-folder-open" style="font-size:16px"></i>
{/snippet}

<!--
  Dialogue de récupération de projet : affiché tant que rootPath === null.
  L'application ne doit JAMAIS être utilisable sans projet — si le démarrage
  ne trouve aucun dossier projet connu (?root= absent et liste de dossiers
  vide), ou si l'utilisateur ferme le dernier dossier, ce dialogue avertit de
  la situation et propose UNE action unique : choisir un dossier dans le
  dialogue système (qui permet aussi d'en créer un nouveau). Aucun bouton de
  fermeture : tant qu'aucun projet n'est choisi, l'éditeur est inutilisable.
-->
<div class="mdv-gate" role="dialog" aria-modal="true" aria-label={t("gate.title")}>
  <div class="mdv-gate__card">
    <div class="mdv-gate__logo">
      <img
        src={logoUrl}
        alt=""
        aria-hidden="true"
        width={96}
        height={96}
        draggable={false}
      />
    </div>
    <h1 class="mdv-gate__title">{t("gate.title")}</h1>
    <p class="mdv-gate__subtitle">{t("gate.subtitle")}</p>

    <div class="mdv-gate__actions">
      <Button variant="solid" size="md" icon={folderOpenIcon} onclick={onChooseFolder}>
        {t("gate.chooseFolder")}
      </Button>
    </div>

    <div class="mdv-gate__hint">
      <Shortcut keys="⌘+⇧+O" /> <span>{t("gate.hintChooseFolder")}</span>
    </div>
  </div>
</div>

<style>
  .mdv-gate {
    position: fixed;
    inset: 0;
    /* Au-dessus de tous les overlays (1000/1001) et du DropOverlay (1200). */
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
  }

  .mdv-gate__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 460px;
    padding: 40px 48px;
    text-align: center;
  }

  .mdv-gate__logo img {
    filter: drop-shadow(0 2px 8px color-mix(in srgb, var(--accent) 30%, transparent));
  }

  .mdv-gate__title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: var(--fg);
  }

  .mdv-gate__subtitle {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: var(--muted);
  }

  .mdv-gate__actions {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 8px;
  }

  .mdv-gate__actions :global(.mdv-btn--md) {
    padding: 9px 22px;
    font-size: 14px;
  }

  .mdv-gate__hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    font-size: 12px;
    color: var(--muted);
  }
</style>
