import type { HandlerContext, FileHandler } from "./types"
import { extFromPath } from "@/lib/editor-languages"

export function createMarkdownHandler(context: HandlerContext): FileHandler {
  const ctx = context
  const cleanups: (() => void)[] = []
  const timers: ReturnType<typeof setTimeout>[] = []
  let proseWarmupDone = false

  function setupEffects() {
    // Ensure .moxide.toml exists at project root
    void (async () => {
      const { ensureMoxideConfig } = await import("@/lib/lsp/markdown-oxide")
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

    // wikilink navigation from preview
    void (async () => {
      const { resolveWikilink } = await import("@/lib/lsp/markdown-oxide")
      const { walkSupportedTextFiles } = await import("@/lib/files")
      const onWikilinkNavigate = (e: Event) => {
        const detail = (e as CustomEvent).detail as { path?: string; target?: string; heading?: string | null }
        const heading = detail.heading ?? null

        const resolve = (path: string) => {
          if (ctx.sideActivePath()) ctx.navPush(ctx.sideActivePath()!)
          if (heading) ctx.setScrollTarget(heading)
          ctx.setSideVisible(true)
          ctx.pm.openInSide(path).catch((err: any) => console.error("[azprose] wikilink open failed", err))
        }
        if (detail.path) {
          resolve(detail.path)
          return
        }
        const target = detail.target
        if (!target) return

        void (async () => {
          const currentPath = ctx.activePath()
          const sourceText = ctx.source()
          if (currentPath && extFromPath(currentPath) === "md") {
            const resolved = await resolveWikilink(currentPath, sourceText, target)
            if (resolved) { resolve(resolved); return }
          }
          const root = ctx.rootPath()
          if (!root) return
          const files = await walkSupportedTextFiles(root)
          const match = files.find((f) => {
            const dot = f.name.lastIndexOf(".")
            const base = dot > 0 ? f.name.slice(0, dot) : f.name
            return base === target
          })
          if (match) resolve(match.path)
        })()
      }
      window.addEventListener("azprose:wikilink-navigate", onWikilinkNavigate)
      cleanups.push(() => window.removeEventListener("azprose:wikilink-navigate", onWikilinkNavigate))
    })()

    // PDF rect navigation from preview
    void (async () => {
      const onPdfRectNavigate = (e: Event) => {
        const detail = (e as CustomEvent).detail as { path: string; page?: number; rect?: string }
        if (!detail.path) return
        ctx.openFileInTab(detail.path, { silent: true }).catch(() => {})
        // Tell PdfViewer to scroll to page/rect after the file opens
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

    // oxide show-document listener
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event")
      const unlisten = await listen<{ path: string }>("azprose:oxide-show-document", (ev) => {
        const p = ev.payload.path
        if (p) ctx.openFileInTab(p, { silent: true }).catch(() => {})
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
