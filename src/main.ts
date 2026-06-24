import { mount } from "svelte";
import App from "./app.svelte";
import "./styles/globals.css";

window.addEventListener("error", (e) => {
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
