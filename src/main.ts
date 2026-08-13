import { mount } from "svelte";
// Cœur MINIMAL du boot (vague 2, phase 2.4) — reset + tokens + icônes +
// polices UI. Tout le reste (polices de document, thème SVAR, diapositives)
// voyage désormais avec son consommateur (R3), plus avec le boot.
import "./styles/core.css";
import "./styles/fonts-ui.css";
import { initBoot } from "@/shell/boot";
import { initPresentation } from "@/shell/presentation";

// Point d'entrée de la fenêtre PROJET SEULE (vague 2, phase 2.2) — NAV a
// désormais son propre point d'entrée dédié, nav.html/nav-main.ts. AVANT tout
// rendu : classe de plateforme, surface de crash, config MathJax (boot.ts),
// puis thème + polices (presentation.ts).
initBoot();
initPresentation();

const target = document.getElementById("root")!;
const { default: App } = await import("./app.svelte");
mount(App, { target });
