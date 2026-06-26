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
  ...(_mjPkgs.length > 0 && { tex: { packages: { "[+]": _mjPkgs } } }),
  options: { enableSpeech: false },
};

window.addEventListener("error", (e) => {
  if (!e.error) return; // resource load failure — not a JS exception, ignore
  document.body.innerHTML = `<pre style="padding:24px;font-family:monospace;font-size:14px;color:#e64553;background:#1e1e2e;">RUNTIME ERROR\n\n${e.error instanceof Error ? e.error.stack : String(e.error)}</pre>`;
});
window.addEventListener("unhandledrejection", (e) => {
  document.body.innerHTML = `<pre style="padding:24px;font-family:monospace;font-size:14px;color:#e64553;background:#1e1e2e;">UNHANDLED PROMISE REJECTION\n\n${e.reason instanceof Error ? e.reason.stack : String(e.reason)}</pre>`;
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
