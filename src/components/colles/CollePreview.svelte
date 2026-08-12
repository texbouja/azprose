<script lang="ts">
  /**
   * Vue « Planches de colles » : découpe la daily note en planches
   * (`parsePlanches`), affiche une carte à la fois (navigation ← →).
   *
   * La liste des élèves est une sidebar INTERNE à ce rendu (jamais la sidebar
   * gauche de l'app) : le colleur la déplie via le bouton « Élèves » de
   * TabActions (wxi-user-list) et clique un nom pour sauter à la planche.
   * L'état d'ouverture est LOCAL au composant ; seul `studentsOpen` est
   * reporté dans le nav-state (état pressé du bouton côté toolbar).
   *
   * LOGIQUE RESPONSIVE (décision utilisateur) : en plein écran VIEWER
   * (`viewerFullscreenOn` — le fullscreen des TabActions side, pas celui de
   * l'app), la sidebar est FIXE : elle s'ouvre à l'entrée et ne disparaît
   * jamais (le toggle, le clic nom et le clic extérieur sont sans effet).
   * Hors fullscreen, comportement overlay flottant actuel + fermeture au clic
   * sur un nom OU au clic extérieur (en dehors de la sidebar et de la toolbar
   * flottante). Le CSS d'overlay (position absolute, ombre portée) est COMMUN
   * aux deux états — seule la logique d'ouverture/fermeture diffère.
   *
   * Le write-back des évaluations est délégué à app.svelte via l'événement
   * `azprose:colle-eval` (pattern azprose:*) : le handler y lit le source LIVE
   * du tab main (même path) pour base — jamais le source du side tab (qui est
   * la dernière version SAUVÉE, pas le buffer non-sauvegardé de l'éditeur).
   */
  import { parsePlanches, sameCreneau } from "@/colles";
  import { getT } from "@/lib/i18n";
  import { language } from "@/lib/i18n";
  import ColleCard from "./ColleCard.svelte";

  let {
    value = "",
    filePath = null as string | null,
    viewerFullscreenOn = false,
  }: {
    value?: string;
    filePath?: string | null;
    viewerFullscreenOn?: boolean;
  } = $props();

  let t = $derived(getT($language));

  // ── Zoom du TEXTE markdown (énoncé + observations) ────────────────────────
  // Même principe que le preview md : boutons zoom de TabActions → commande
  // `azprose:viewer-command` → état local → prop `zoom` transmise aux cartes.
  // Le zoom ne s'applique QU'AUX contenus rendus (`.colle-sec__zoom`), jamais
  // aux cartes ni aux métadonnées YAML ; la largeur de la zone de texte reste
  // inchangée (compensation `width: calc(100% / z)` dans la carte).
  const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];
  let zoom = $state(100);

  function zoomIn() {
    const i = ZOOM_STEPS.indexOf(zoom);
    zoom = i < 0 ? 100 : ZOOM_STEPS[Math.min(i + 1, ZOOM_STEPS.length - 1)];
  }

  function zoomOut() {
    const i = ZOOM_STEPS.indexOf(zoom);
    zoom = i < 0 ? 100 : ZOOM_STEPS[Math.max(i - 1, 0)];
  }

  $effect(() => {
    const handler = (e: Event) => {
      const { cmd } = (e as CustomEvent).detail as { cmd?: string };
      if (cmd === "zoom-in") zoomIn();
      else if (cmd === "zoom-out") zoomOut();
      else if (cmd === "zoom-reset") zoom = 100;
    };
    window.addEventListener("azprose:viewer-command", handler);
    return () => window.removeEventListener("azprose:viewer-command", handler);
  });

  let planches = $derived(parsePlanches(value).planches);
  let current = $state(0);

  // Garde de bornes : si le source change (write-back, édition), l'index reste valide.
  $effect(() => {
    if (planches.length === 0) current = 0;
    else if (current >= planches.length) current = planches.length - 1;
  });

  function prev() {
    if (current > 0) current--;
  }

  function next() {
    if (current < planches.length - 1) current++;
  }

  // ── Sidebar interne « Élèves » ────────────────────────────────────────────
  // Liste des élèves DANS le rendu (accès direct à `planches`/`current` —
  // aucun événement ni store) ; le bouton de TabActions bascule le panneau via
  // `azprose:colle-students-toggle`.
  let studentsOpen = $state(false);

  // Logique responsive : en plein écran VIEWER, la sidebar est FIXE (toujours
  // visible — `studentsVisible` reste vrai quel que soit l'état local, le
  // toggle/les clics ne ferment jamais) ; hors fullscreen, `studentsOpen` seul
  // gouverne et la fermeture se fait au clic nom / clic extérieur.
  let studentsVisible = $derived(viewerFullscreenOn || studentsOpen);

  $effect(() => {
    // Entrée en fullscreen → la sidebar s'ouvre (jamais fermée ensuite).
    if (viewerFullscreenOn) studentsOpen = true;
  });

  $effect(() => {
    const onToggle = () => {
      if (viewerFullscreenOn) return; // en fullscreen : jamais fermée
      studentsOpen = !studentsOpen;
    };
    window.addEventListener("azprose:colle-students-toggle", onToggle);
    return () => window.removeEventListener("azprose:colle-students-toggle", onToggle);
  });

  // Clic EXTÉRIEUR (hors fullscreen) : ferme la sidebar quand on clique en
  // dehors du panneau ET en dehors de la toolbar flottante (TabActions — le
  // bouton « Élèves » y vit, un clic dessus ne doit pas fermer). En fullscreen,
  // aucun clic extérieur ne ferme.
  $effect(() => {
    if (viewerFullscreenOn) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".colle-viewer__students")) return;
      if (target.closest(".ta-wrap")) return;
      if (studentsOpen) studentsOpen = false;
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  });

  // Sélection depuis la liste : saut à la planche ; hors fullscreen, la
  // sidebar se referme après le clic (décision utilisateur).
  function selectStudent(index: number) {
    current = index;
    if (!viewerFullscreenOn) studentsOpen = false;
  }

  // Maintient l'élément actif visible quand la liste est longue (le panneau
  // défile au changement de planche via clic nom / clavier / chevrons).
  let studentsList = $state<HTMLUListElement | null>(null);
  $effect(() => {
    if (!studentsVisible || !studentsList) return;
    const active = studentsList.querySelector<HTMLElement>(".colle-viewer__student--active");
    active?.scrollIntoView({ block: "nearest" });
  });

  // L'état de navigation est reporté à TabActions (chevrons + compteur + état
  // pressé du bouton « Élèves ») — il ne l'écoute que si le fichier correspond
  // au tab side actif. `studentsVisible` (et non `studentsOpen`) : en
  // fullscreen le bouton doit rester pressé tant que la sidebar est affichée.
  function reportNavState() {
    window.dispatchEvent(
      new CustomEvent("azprose:colle-nav-state", {
        detail: {
          filePath,
          index: current,
          total: planches.length,
          studentsOpen: studentsVisible,
        },
      }),
    );
  }

  $effect(() => {
    reportNavState();
  });

  // Commandes de navigation (chevrons TabActions) + resync d'état à la demande
  // (TabActions à l'entrée en mode colle). La navigation par clic sur un nom
  // est interne (accès direct à `current`), pas d'événement.
  $effect(() => {
    const onNav = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        filePath?: string | null;
        dir?: "prev" | "next";
      };
      if (d.filePath !== filePath) return;
      if (d.dir === "prev") prev();
      else if (d.dir === "next") next();
    };
    const onSync = (e: Event) => {
      const d = (e as CustomEvent).detail as { filePath?: string | null };
      if (d.filePath !== filePath) return;
      reportNavState();
    };
    window.addEventListener("azprose:colle-nav", onNav);
    window.addEventListener("azprose:colle-nav-sync", onSync);
    return () => {
      window.removeEventListener("azprose:colle-nav", onNav);
      window.removeEventListener("azprose:colle-nav-sync", onSync);
    };
  });

  function handleEval(
    index: number,
    keys: {
      notes?: Record<string, number | string> | null;
      observations?: string | null;
      programme?: string | null;
      colleur?: string | null;
      creneau?: string | null;
      salle?: string | null;
    },
    propagateProgramme = false,
  ) {
    const updates: Array<{
      index: number;
      keys: {
        notes?: Record<string, number | string> | null;
        observations?: string | null;
        programme?: string | null;
        colleur?: string | null;
        creneau?: string | null;
        salle?: string | null;
      };
    }> = [{ index, keys }];

    // Propagation VOLONTAIRE du programme : le bouton « Propager » de la carte
    // déclenche la copie de la valeur saisie (non vide — le bouton est désactivé
    // sinon) vers les autres planches du même créneau (date + créneau
    // identiques). Un seul événement porte toutes les écritures — app.svelte
    // les chaîne sur le même source (une seule sauvegarde, pas de course entre
    // plusieurs événements successifs).
    if (propagateProgramme) {
      const value = keys.programme?.trim();
      const current = planches[index];
      if (value && current) {
        for (const p of planches) {
          if (p.index === index || !sameCreneau(p.meta, current.meta)) continue;
          updates.push({ index: p.index, keys: { programme: value } });
        }
      }
    }

    window.dispatchEvent(
      new CustomEvent("azprose:colle-eval", {
        detail: { path: filePath, updates },
      }),
    );
  }

  // Navigation clavier ← → (hors champs de saisie)
  $effect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      return (
        !!target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      );
    };
    const handler = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === "ArrowLeft" && current > 0) {
        e.preventDefault();
        current--;
      } else if (e.key === "ArrowRight" && current < planches.length - 1) {
        e.preventDefault();
        current++;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
</script>

<div class="colle-viewer">
  {#if planches.length === 0}
    <div class="colle-viewer__empty">
      <p>{t("colle.empty")}</p>
    </div>
  {:else}
    <div class="colle-viewer__body">
      {#if studentsVisible}
        <aside class="colle-viewer__students" aria-label={t("colle.students")}>
          <div class="colle-viewer__students-head">{t("colle.students")}</div>
          <ul class="colle-viewer__students-list" bind:this={studentsList}>
            {#each planches as p (p.index)}
              <li>
                <button
                  type="button"
                  class="colle-viewer__student"
                  class:colle-viewer__student--active={p.index === current}
                  onclick={() => selectStudent(p.index)}
                  title={p.meta.eleve || t("colle.noEleve")}
                  aria-current={p.index === current ? "true" : undefined}
                >
                  <span class="colle-viewer__student-n">{p.index + 1}</span>
                  <span class="colle-viewer__student-name">
                    {p.meta.eleve || t("colle.noEleve")}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        </aside>
      {/if}
      <div class="colle-viewer__stage">
        {#key planches[current].index}
          <ColleCard
            planche={planches[current]}
            {filePath}
            {zoom}
            onEval={handleEval}
          />
        {/key}
      </div>
    </div>
  {/if}
</div>
