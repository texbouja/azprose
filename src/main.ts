import { mount } from "svelte";
import "./styles/globals.css";
import { initBoot } from "@/shell/boot";
import { initPresentation } from "@/shell/presentation";

// Superviseur commun aux deux fenêtres (vague 2, phase 2.1) — AVANT tout
// rendu : classe de plateforme, surface de crash, thème + polices. NAV aura
// son propre point d'entrée dédié en phase 2.2 (nav.html/nav-main.ts) ; en
// attendant, ce fichier sert encore les deux fenêtres via ?browse=.
initBoot();
initPresentation();

const _mjPkgs: string[] = JSON.parse(
  localStorage.getItem("mdview.mathjax.packages") ?? "[]"
);
(window as any).MathJax = {
  // document.currentScript is null in ESM context so MathJax can't detect its
  // own base URL — set it explicitly so autoload and loader.load resolve correctly.
  loader: {
    paths: { mathjax: "/mathjax" },
    ...(_mjPkgs.length > 0 && { load: _mjPkgs.map(p => `[tex]/${p}`) }),
  },
  // ProseMark drives its own render cycle — MathJax must not scan the DOM on startup.
  // (V4 default is typeset: true, which conflicts with widget-based rendering.)
  startup: { typeset: false },
  ...(_mjPkgs.length > 0 && { tex: { packages: { "[+]": _mjPkgs } } }),
  // V4 activates a11y extensions by default (unlike V3). SRE crashes under WebKitGTK.
  // Disable the full enrichment pipeline: speech, braille, explorer and complexity
  // all depend on semantic-enrich, so disabling enrichment is the root switch.
  // The menu's default `enrich: true` is also overridden here to prevent SRE loading
  // via the contextual menu pathway.
  options: {
    enableEnrichment: false,
    enableSpeech: false,
    enableBraille: false,
    enableExplorer: false,
    enableComplexity: false,
    menuOptions: {
      settings: {
            enrich: false,
            speech: false,
            braille: false,
            assistiveMml: false,
          },
    },
  },
};

// Deux racines possibles (Phase F) : la fenêtre de PROJET (app complète) et la
// fenêtre fille « browser » (`?browse=<chemin>` — lecture en chaîne, back/
// forward, aide comprise). L'import est DYNAMIQUE des deux côtés : la fenêtre
// de navigation ne charge jamais le bundle de l'éditeur.
const target = document.getElementById("root")!;
if (new URLSearchParams(location.search).has("browse")) {
  const { default: BrowseApp } = await import("./browse-app.svelte");
  mount(BrowseApp, { target });
} else {
  const { default: App } = await import("./app.svelte");
  mount(App, { target });
}
