import { mount } from "svelte";
import "./styles/globals.css";
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
