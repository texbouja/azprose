import { mount } from "svelte";
import App from "./app.svelte";
import "./styles/globals.css";

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
        voicing: false,
      },
    },
  },
};

// Non-destructive crash surface. The previous version replaced document.body
// with a stack trace on ANY uncaught error, wiping the whole app — the slightest
// bug made the UI unusable. Instead we show a dismissible overlay, let the app
// flush drafts/session and log the error (azprose:crash), and offer a reload.
function showCrashOverlay(kind: string, err: unknown) {
  // Let the running app react (flush FS, push to the Diagnostics console).
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

const ua = navigator.userAgent;
const platformClass = /Mac|iPhone|iPad|iPod/i.test(ua)
  ? "is-mac"
  : /Windows/i.test(ua)
    ? "is-windows"
    : /Linux/i.test(ua)
      ? "is-linux"
      : "is-unknown";
document.documentElement.classList.add(platformClass);

mount(App, { target: document.getElementById("root")! });
