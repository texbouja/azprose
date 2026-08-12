import type { HandlerContext, FileHandler } from "./types"
import { extFromPath } from "@/lib/editor-languages"
import type { NavIntent } from "@/lib/navigation"
// Imports STATIQUES (jamais mélangés avec du dynamique) : ces modules sont déjà
// chargés en eager via app.svelte (markdown-oxide, files) ou par le graphe
// statique (tauri/api/event — transport/markdown-oxide) — un `await import()`
// ici ne découperait AUCUN chunk et mentirait sur la laziness réelle.
import { ensureMoxideConfig, resolveWikilink } from "@/lib/lsp/markdown-oxide"
import { walkSupportedTextFiles } from "@/lib/files"
import { listen } from "@tauri-apps/api/event"

/**
 * Pont handler → canal « navigate » : le handler résout la cible (monde réel :
 * LSP oxide, walk du vault) puis POSTE l'intention typée sur l'événement
 * `azprose:navigate`. app.svelte branche cet événement sur
 * `bridgeEvent(navDeps, "azprose:navigate", …)` — le reducer de navigation
 * (seul endroit qui modifie la session) exécute l'intention.
 */
function postNavIntent(intent: NavIntent): void {
  window.dispatchEvent(new CustomEvent("azprose:navigate", { detail: intent }))
}

export function createMarkdownHandler(context: HandlerContext): FileHandler {
  const ctx = context
  const cleanups: (() => void)[] = []
  const timers: ReturnType<typeof setTimeout>[] = []
  let proseWarmupDone = false

  function setupEffects() {
    // Ensure .moxide.toml exists at project root
    void (async () => {
      let lastRoot = ctx.rootPath()
      const tick = () => {
        const root = ctx.rootPath()
        if (root !== lastRoot) {
          lastRoot = root
          if (root) void ensureMoxideConfig(root)
        }
        timers.push(setTimeout(tick, 50))
      }
      tick()
    })()

    // ProseMark lazy warmup on first .md open
    {
      let lastPath = ctx.activePath()
      const tick = () => {
        const path = ctx.activePath()
        if (path !== lastPath) {
          lastPath = path
          if (path && extFromPath(path) === "md" && !proseWarmupDone) {
            proseWarmupDone = true
            void import("@/components/markdown/ProseMarkEditor.svelte")
          }
        }
        timers.push(setTimeout(tick, 50))
      }
      tick()
    }

    // wikilink navigation from preview : le handler ne décide PAS du routage —
    // il résout la cible (monde réel : LSP oxide, walk du vault) puis poste
    // l'intention. Le routage est UNIQUE depuis la Phase G (tab viewer side
    // avec dédup par contenu) : plus de mode navigation dans les panneaux, la
    // lecture en chaîne vit dans la fenêtre fille browser.
    void (async () => {

      const resolveTarget = async (detail: { path?: string; target?: string }): Promise<string | null> => {
        if (detail.path) return detail.path
        const target = detail.target
        if (!target) return null
        const currentPath = ctx.activePath()
        const sourceText = ctx.source()
        if (currentPath && extFromPath(currentPath) === "md") {
          const resolved = await resolveWikilink(currentPath, sourceText, target)
          if (resolved) return resolved
        }
        const root = ctx.rootPath()
        if (!root) return null
        const files = await walkSupportedTextFiles(root)
        const match = files.find((f) => {
          const dot = f.name.lastIndexOf(".")
          const base = dot > 0 ? f.name.slice(0, dot) : f.name
          return base === target
        })
        return match?.path ?? null
      }

      const onWikilinkNavigate = (e: Event) => {
        const detail = (e as CustomEvent).detail as {
          path?: string; target?: string; heading?: string | null
        }
        const heading = detail.heading ?? null
        void (async () => {
          const path = await resolveTarget(detail)
          if (!path) {
            // Cible introuvable : le DIRE. Un clic de navigation qui ne produit
            // rien est indiscernable d'un bug (c'est exactement ce qui a fait
            // conclure à « les wikilinks ne marchent plus »).
            ctx.notify.setInfo(ctx.t("nav.wikilinkUnresolved", { name: detail.target ?? "?" }))
            return
          }
          postNavIntent({ type: "wikilink-navigate", path, heading })
        })()
      }
      window.addEventListener("azprose:wikilink-navigate", onWikilinkNavigate)
      cleanups.push(() => window.removeEventListener("azprose:wikilink-navigate", onWikilinkNavigate))

      // Lien wikilink « nouvel onglet » (conservé pour compat API — plus émis
      // par les viewers depuis la matrice : la décision cas 1 route
      // directement). Le reducer ouvre en NOUVEL onglet éditeur (dédup par
      // PanelState.open — un tab déjà ouvert est activé, pas dupliqué).
      const onWikilinkOpenNew = (e: Event) => {
        const detail = (e as CustomEvent).detail as {
          path?: string; target?: string; heading?: string | null
        }
        const heading = detail.heading ?? null
        void (async () => {
          const path = await resolveTarget(detail)
          if (!path) return
          postNavIntent({ type: "wikilink-open-new", path, heading })
        })()
      }
      window.addEventListener("azprose:wikilink-open-new", onWikilinkOpenNew)
      cleanups.push(() => window.removeEventListener("azprose:wikilink-open-new", onWikilinkOpenNew))
    })()

    // PDF rect navigation from preview
    void (async () => {
      const onPdfRectNavigate = (e: Event) => {
        const detail = (e as CustomEvent).detail as { path: string; page?: number; rect?: string }
        if (!detail.path) return
        // Le reducer ouvre le PDF dans le tab side actif ; la cible de scroll
        // (page/rect) est un événement de RENDU pour PdfViewer, émis ici APRÈS
        // l'intention (le store scroll-target est réservé aux headings preview).
        postNavIntent({ type: "pdf-rect-navigate", path: detail.path, page: detail.page, rect: detail.rect })
        window.dispatchEvent(new CustomEvent("azprose:pdf-scroll-to-rect", { detail }))
      }
      window.addEventListener("azprose:pdf-rect-navigate", onPdfRectNavigate)
      cleanups.push(() => window.removeEventListener("azprose:pdf-rect-navigate", onPdfRectNavigate))

      const onPdfRegionCopied = () => {
        ctx.notify.setInfo(ctx.t("pdf.regionCopied"))
      }
      window.addEventListener("azprose:pdf-region-copied", onPdfRegionCopied)
      cleanups.push(() => window.removeEventListener("azprose:pdf-region-copied", onPdfRegionCopied))
    })()

    // oxide show-document listener (daily-note jumps from the LSP: today/
    // yesterday/tomorrow/jump). User navigation → le reducer enregistre la
    // page preview courante dans l'historique back puis ouvre la cible.
    void (async () => {
      const unlisten = await listen<{ path: string }>("azprose:oxide-show-document", (ev) => {
        const p = ev.payload.path
        if (p) postNavIntent({ type: "oxide-show-document", path: p })
      })
      cleanups.push(unlisten)
    })()

    // Side panel source sync on save only
    {
      let lastSaved = ctx.savedContent()
      const tick = () => {
        const saved = ctx.savedContent()
        if (saved !== lastSaved) {
          lastSaved = saved
          const path = ctx.activePath()
          if (path && extFromPath(path) === "md") {
            const norm = (p: string) => p.split("/").filter(s => s !== ".").join("/")
            const normActive = norm(path)
            const sideTab = ctx.pm.side.tabs.find((t: any) => norm(t.path) === normActive)
            if (sideTab) {
              ctx.pm.side.setTabSource(sideTab.id, saved)
              ctx.bumpPanelVersion()
            }
          }
        }
        timers.push(setTimeout(tick, 50))
      }
      tick()
    }
  }

  function cleanup() {
    for (const t of timers) clearTimeout(t)
    timers.length = 0
    for (const fn of cleanups) fn()
    cleanups.length = 0
  }

  return { setupEffects, cleanup }
}
