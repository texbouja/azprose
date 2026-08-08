import type { HandlerContext, FileHandler } from "./types"
import { extFromPath } from "@/lib/editor-languages"
import { followPreviewNavigation } from "@/lib/preview-follow"

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

    // wikilink navigation from preview: in-place (re-uses the preview tab and
    // re-associates it with the rendered file) unless Alt+click, which
    // opens a NEW tab via azprose:wikilink-open-new.
    void (async () => {
      const { resolveWikilink } = await import("@/lib/lsp/markdown-oxide")
      const { walkSupportedTextFiles } = await import("@/lib/files")

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
        const detail = (e as CustomEvent).detail as { path?: string; target?: string; heading?: string | null }
        const heading = detail.heading ?? null
        void (async () => {
          const path = await resolveTarget(detail)
          if (!path) return
          // Navigate IN PLACE: reuse the preview tab (preview: true), re-associate
          // it with the rendered file. The tab is never a fresh, unlinked tab.
          // fallbackToActive: si le flag preview a été perdu (restore de session,
          // ré-affectation openInActiveTab), on re-pointe le tab ACTIF au lieu de
          // créer un nouvel onglet — « clic simple = tab actif ».
          if (ctx.sideActivePath()) ctx.navPush(ctx.sideActivePath()!)
          if (heading) ctx.setScrollTarget(heading)
          ctx.setSideVisible(true)
          ctx.pm.openInSide(path, { preview: true, fallbackToActive: true }).catch((err: any) => console.error("[azprose] wikilink open failed", err))
          // Editor-follow (décision utilisateur) : le tab éditeur LIÉ suit la
          // navigation du preview. Au PREMIER clic de la session, on établit le
          // lien vers le tab éditeur actif (celui qui a lancé le browsing) —
          // l'éditeur affiche déjà la source, rien à déplacer. Ensuite, chaque
          // navigation re-pointe ce tab (politique A : edits parkés en brouillon
          // avant le mouvement, notification discrète).
          if (!ctx.pm.previewLinkedTabId) {
            ctx.pm.previewLinkedTabId = ctx.pm.main.activeTabId
          } else {
            void followPreviewNavigation(ctx.pm, path).then(r => {
              if (r.parked) ctx.notify.setInfo(ctx.t("preview.draftParked"))
            })
          }
        })()
      }
      window.addEventListener("azprose:wikilink-navigate", onWikilinkNavigate)
      cleanups.push(() => window.removeEventListener("azprose:wikilink-navigate", onWikilinkNavigate))

      // Alt+clic: open in a NEW tab (dedup handled by PanelState.open —
      // an already-open tab is activated, not duplicated).
      const onWikilinkOpenNew = (e: Event) => {
        const detail = (e as CustomEvent).detail as { path?: string; target?: string; heading?: string | null }
        void (async () => {
          const path = await resolveTarget(detail)
          if (!path) return
          ctx.openFileInTab(path, { silent: true }).catch((err: any) => console.error("[azprose] wikilink open-new failed", err))
          if (detail.heading) ctx.setScrollTarget(detail.heading)
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

    // oxide show-document listener (daily-note jumps from the LSP: today/
    // yesterday/tomorrow/jump). User navigation → record the current preview
    // page in the back history before opening the target.
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event")
      const unlisten = await listen<{ path: string }>("azprose:oxide-show-document", (ev) => {
        const p = ev.payload.path
        if (p) {
          if (ctx.sideActivePath()) ctx.navPush(ctx.sideActivePath()!)
          ctx.openFileInTab(p, { silent: true }).catch(() => {})
        }
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
