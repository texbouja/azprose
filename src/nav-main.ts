import { mount } from "svelte";
// Cœur MINIMAL du boot (vague 2, phase 2.4) — mêmes DEUX feuilles que
// main.ts, aucune de plus : c'est tout le sens de R3 appliqué au boot.
import "./styles/core.css";
import "./styles/fonts-ui.css";
import { initBoot } from "@/shell/boot";
import { initPresentation } from "@/shell/presentation";
// Import STATIQUE (l'ancien main.ts l'importait dynamiquement, pour éviter
// de charger le mauvais composant selon ?browse=) : ce point d'entrée ne
// sert QUE NAV, plus besoin de brancher entre deux composants au runtime.
// (Les imports sont de toute façon hissés en tête de module par JS — la
// position ici ne change ni l'ordre ni le moment d'exécution du code
// ci-dessous : seule l'INSTANCIATION du composant, au mount(), a un effet.)
import BrowseApp from "./browse-app.svelte";

// Point d'entrée DÉDIÉ de la fenêtre NAV (vague 2, phase 2.2, ★A) — avant
// cette phase, NAV chargeait index.html/main.ts en entier (le socle de
// PROJET) pour un `?browse=` détecté au runtime. AVANT tout rendu : classe
// de plateforme, surface de crash, config MathJax (boot.ts), puis thème +
// polices (presentation.ts) — même séquence que main.ts, aucune logique
// propre à PROJET.
initBoot();
initPresentation();

const target = document.getElementById("root")!;
mount(BrowseApp, { target });
