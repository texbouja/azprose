/**
 * Séquence de démarrage COMMUNE aux deux fenêtres — SANS logique métier
 * (aucune notion d'onglet, de projet ou de session). Extrait de main.ts
 * (vague 2, phase 2.1) : platformClass et le handler de crash y étaient déjà
 * appliqués inconditionnellement pour les deux fenêtres — cette extraction ne
 * change aucun comportement, elle donne un nom et un test d'isolation
 * (`src/shell/**` ne doit importer ni panel-store, ni session, ni navigation,
 * ni aucun composant de PROJET) à ce qui l'était déjà de fait.
 *
 * `removeBootSplash()` est la seule pièce dont le MOMENT d'appel reste au
 * choix de chaque fenêtre : PROJET attend la config du projet
 * (`themeBootDone`, cf. app.svelte), NAV peut l'appeler dès son montage —
 * c'est précisément la frontière entre « commun » et « métier ».
 *
 * La config MathJax (phase 2.2) rejoint ce fichier pour la même raison que
 * platformClass/crash : elle est déjà commune de fait (NAV monte le MÊME
 * MarkdownPreview.svelte), il ne restait qu'à éviter sa duplication entre
 * les deux points d'entrée JS (main.ts, nav-main.ts).
 */

/** is-mac / is-windows / is-linux sur <html> — styles spécifiques à la
 *  plateforme (ex. espace réservé aux traffic lights macOS dans
 *  TitleBar.svelte, `html.is-mac .mdv-titlebar`). */
function applyPlatformClass(): void {
  const ua = navigator.userAgent;
  const platformClass = /Mac|iPhone|iPad|iPod/i.test(ua)
    ? "is-mac"
    : /Windows/i.test(ua)
      ? "is-windows"
      : /Linux/i.test(ua)
        ? "is-linux"
        : "is-unknown";
  document.documentElement.classList.add(platformClass);
}

/**
 * Surface de crash non destructive : un overlay dismissible plutôt que de
 * remplacer tout le corps du document (comme avant), pour laisser l'app
 * réagir (flush FS, log Diagnostics — cf. `@/lib/crash-handler.ts`, propre à
 * PROJET, qui ÉCOUTE l'événement `azprose:crash` dispatché ici).
 */
function installCrashHandler(): void {
  function showCrashOverlay(kind: string, err: unknown) {
    try {
      window.dispatchEvent(
        new CustomEvent("azprose:crash", {
          detail: {
            kind,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          },
        }),
      );
    } catch {
      /* dispatch must never throw */
    }

    if (document.getElementById("azprose-crash")) return; // never stack overlays
    const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
    const el = document.createElement("div");
    el.id = "azprose-crash";
    el.setAttribute(
      "style",
      [
        "position:fixed",
        "right:12px",
        "bottom:12px",
        "z-index:2147483647",
        "max-width:min(520px,90vw)",
        "max-height:50vh",
        "overflow:auto",
        "background:#1e1e2e",
        "color:#cdd6f4",
        "border:1px solid #45475a",
        "border-radius:8px",
        "box-shadow:0 8px 30px rgba(0,0,0,.4)",
        "font-family:monospace",
        "font-size:12px",
        "padding:12px 14px",
      ].join(";"),
    );
    el.innerHTML =
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">` +
      `<strong style="color:#e64553;"></strong><span style="flex:1"></span>` +
      `<button id="azprose-crash-reload" style="cursor:pointer;background:#45475a;color:#cdd6f4;border:none;border-radius:5px;padding:3px 8px;">Recharger</button>` +
      `<button id="azprose-crash-dismiss" style="cursor:pointer;background:transparent;color:#a6adc8;border:none;border-radius:5px;padding:3px 6px;">Ignorer</button>` +
      `</div><pre style="margin:0;white-space:pre-wrap;word-break:break-word;line-height:1.45;"></pre>`;
    // textContent (not innerHTML) for the error → no HTML injection from the stack.
    (el.querySelector("strong") as HTMLElement).textContent = kind;
    (el.querySelector("pre") as HTMLElement).textContent = text;
    document.body.appendChild(el);
    el.querySelector("#azprose-crash-reload")?.addEventListener("click", () => location.reload());
    el.querySelector("#azprose-crash-dismiss")?.addEventListener("click", () => el.remove());
  }

  window.addEventListener("error", (e) => {
    if (!e.error) return; // resource load failure — not a JS exception, ignore
    showCrashOverlay("RUNTIME ERROR", e.error);
  });
  window.addEventListener("unhandledrejection", (e) => {
    showCrashOverlay("UNHANDLED PROMISE REJECTION", e.reason);
  });
}

/** Efface l'écran de boot (`#boot`, peint par le script inline d'index.html/
 *  nav.html avant tout JS) avec un fondu — idempotent, sans effet si l'élément
 *  est déjà retiré. Chaque fenêtre l'appelle quand ELLE juge son contenu prêt
 *  (cf. docstring de tête) ; la mécanique du retrait, elle, est commune. */
export function removeBootSplash(): void {
  const boot = document.getElementById("boot");
  if (!boot) return;
  requestAnimationFrame(() => {
    boot.style.opacity = "0";
    boot.addEventListener("transitionend", () => boot.remove(), { once: true });
  });
}

/**
 * Configure `window.MathJax` — DOIT s'exécuter avant que le chunk MathJax
 * (chargé paresseusement par le pipeline de rendu) ne lise cet objet.
 * Découvert en phase 2.2 : NAV monte `MarkdownPreview.svelte`, le MÊME
 * composant que PROJET (aucun pipeline parallèle, cf. tête de
 * browse-app.svelte) — donc les MÊMES maths, donc la MÊME configuration.
 * Extrait ici plutôt que dupliqué entre main.ts et nav-main.ts : c'est
 * exactement le défaut que la phase 1.7 avait déjà corrigé une fois
 * (index.html vs main.ts) — pas de raison de le laisser réapparaître entre
 * deux points d'entrée JS.
 */
function initMathJaxConfig(): void {
  const mjPkgs: string[] = JSON.parse(
    localStorage.getItem("mdview.mathjax.packages") ?? "[]"
  );
  (window as any).MathJax = {
    // document.currentScript is null in ESM context so MathJax can't detect
    // its own base URL — set it explicitly so autoload/loader.load resolve.
    loader: {
      paths: { mathjax: "/mathjax" },
      ...(mjPkgs.length > 0 && { load: mjPkgs.map((p) => `[tex]/${p}`) }),
    },
    // ProseMark drives its own render cycle — MathJax must not scan the DOM
    // on startup (V4 default is typeset: true, conflicts with widgets).
    startup: { typeset: false },
    ...(mjPkgs.length > 0 && { tex: { packages: { "[+]": mjPkgs } } }),
    // V4 activates a11y extensions by default (unlike V3). SRE crashes under
    // WebKitGTK — disable the full enrichment pipeline (speech/braille/
    // explorer/complexity all depend on semantic-enrich, so disabling
    // enrichment is the root switch) ; the menu's default enrich:true is
    // also overridden to prevent SRE loading via the contextual menu.
    options: {
      enableEnrichment: false,
      enableSpeech: false,
      enableBraille: false,
      enableExplorer: false,
      enableComplexity: false,
      menuOptions: {
        settings: { enrich: false, speech: false, braille: false, assistiveMml: false },
      },
    },
  };
}

/** Classe de plateforme + surface de crash + config MathJax — à appeler UNE
 *  fois par fenêtre, au tout début du point d'entrée (avant même
 *  `initPresentation()`). */
export function initBoot(): void {
  applyPlatformClass();
  installCrashHandler();
  initMathJaxConfig();
}
