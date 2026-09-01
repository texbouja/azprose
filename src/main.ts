import { mount } from "svelte";
// Cœur MINIMAL du boot (vague 2, phase 2.4) — reset + tokens + icônes +
// polices UI. Tout le reste (polices de document, thème SVAR, diapositives)
// voyage désormais avec son consommateur (R3), plus avec le boot.
import "./styles/core.css";
import "./styles/fonts-ui.css";
import { initBoot } from "@/shell/boot";
import { initPresentation } from "@/shell/presentation";
import { initPreferences } from "@/shell/preferences";
import { resoudreRacineInitiale } from "@/lib/vault-boot";

// Point d'entrée de la fenêtre PROJET SEULE (vague 2, phase 2.2) — NAV a
// désormais son propre point d'entrée dédié, nav.html/nav-main.ts. AVANT tout
// rendu : classe de plateforme, surface de crash, config MathJax (boot.ts),
// puis thème + polices (presentation.ts).
initBoot();
initPresentation();
// Filet de durabilité des préférences globales, et relecture des clés
// restaurées. Attendu AVANT le mount : mieux vaut retarder l'affichage de
// quelques millisecondes que peindre avec des réglages par défaut.
await initPreferences();
// La racine du coffre est fixée AVANT le montage, et ne bougera plus de la vie
// de la fenêtre : tout état scopé (session, brouillons, invités, favoris) est
// donc lu sous le bon scope dès la première ligne du composant. C'est ce
// séquencement, et non un ordonnancement d'effets, qui garantit qu'une fenêtre
// ne peut pas restaurer la session d'un autre projet.
await resoudreRacineInitiale();

const target = document.getElementById("root")!;
const { default: App } = await import("./app.svelte");
mount(App, { target });
