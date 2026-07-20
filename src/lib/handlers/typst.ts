import type { HandlerContext, FileHandler } from "./types"
import { extFromPath } from "@/lib/editor-languages"

let forwardTimer: ReturnType<typeof setTimeout> | null = null
let onTypeTimer: ReturnType<typeof setTimeout> | null = null

export function createTypstHandler(context: HandlerContext): FileHandler {
  const ctx = context
  const cleanups: (() => void)[] = []

  async function onTypstBuild() {
    const path = ctx.activePath()
    if (!path) return
    const typst = await import("@/typst")
    await typst.build(
      ctx.ts,
      path,
      ctx.source(),
      ctx.handleSave,
      () => ctx.setConsoleOpen(true),
      () => ctx.setConsoleTab("log"),
      (name: string) => ctx.notify.setInfo(ctx.t("app.savedTo", { name })),
    )
  }

  function setupEffects() {
    // Transport outFilter: suppress didChange at transport level
    void (async () => {
      const { getTinymistTransport } = await import("@/lib/lsp/tinymist")
      const transport = getTinymistTransport()
      transport.setOutFilter((raw: string) => {
        try {
          const msg = JSON.parse(raw)
          if (msg.method === "textDocument/didChange") return true
        } catch { /* ignore */ }
        return false
      })
    })()

    // Sync tinymist settings when they change
    void (async () => {
      const { typstSettings } = await import("@/stores/typst-settings.svelte")
      const { sendTinymistConfig, isTinymistReady } = await import("@/lib/lsp/tinymist")
      let disposed = false
      cleanups.push(() => { disposed = true })
      let prev = JSON.stringify(typstSettings.current)
      const tick = () => {
        if (disposed) return
        const cur = JSON.stringify(typstSettings.current)
        if (cur !== prev) {
          prev = cur
          if (isTinymistReady()) sendTinymistConfig(typstSettings.current, ctx.rootPath())
        }
        setTimeout(tick, 50)
      }
      tick()
    })()

    // Auto-export Typst PDF while typing (debounced 1.5s)
    void (async () => {
      const { typstSettings } = await import("@/stores/typst-settings.svelte")
      let disposed = false
      cleanups.push(() => { disposed = true; if (onTypeTimer) { clearTimeout(onTypeTimer); onTypeTimer = null } })
      let prev = `${JSON.stringify(typstSettings.current)}|${ctx.activePath()}`
      const tick = () => {
        if (disposed) return
        const cur = `${JSON.stringify(typstSettings.current)}|${ctx.activePath()}`
        if (cur !== prev) {
          prev = cur
          const mode = typstSettings.current.exportPdf
          const p = ctx.activePath()
          if (mode !== "onType" || !p || extFromPath(p) !== "typ") {
            if (onTypeTimer) { clearTimeout(onTypeTimer); onTypeTimer = null }
          } else {
            if (onTypeTimer) clearTimeout(onTypeTimer)
            onTypeTimer = setTimeout(() => {
              onTypeTimer = null
              if (ctx.ts.exporting || ctx.ts.compiling) return
              onTypstBuild()
            }, 1500)
          }
        }
        setTimeout(tick, 50)
      }
      tick()
    })()

    // Cleanup state when switching tabs
    void (async () => {
      let disposed = false
      cleanups.push(() => { disposed = true })
      let lastExt = ctx.currentExt()
      const tick = () => {
        if (disposed) return
        const ext = ctx.currentExt()
        if (ext !== lastExt) {
          if (lastExt !== "typ") {
            ctx.ls.viewerPdfPath = null
          }
          import("@/typst").then(m => m.clearDiagnostics())
          lastExt = ext
        }
        setTimeout(tick, 50)
      }
      tick()
    })()

    // Live diagnostics when console is open and no side preview
    void (async () => {
      const { liveDiagnostics } = await import("@/typst/diagnostics")
      let disposed = false
      cleanups.push(() => { disposed = true })
      const tick = () => {
        if (disposed) return
        const path = ctx.activePath()
        const text = ctx.source()
        if (ctx.consoleOpen() && path && extFromPath(path) === "typ" && ctx.pm.findTabByPath(path)?.panel !== "side") {
          setTimeout(() => { liveDiagnostics(path, text, true, false) }, 300)
        }
        setTimeout(tick, 50)
      }
      tick()
    })()

    // Forward sync: editor cursor → typst live preview (debounced 100ms)
    void (async () => {
      const { scrollPreview, getPreviewTaskForFile } = await import("@/typst/backend")
      const { cursorLine } = await import("@/stores/cursor-line.svelte")
      let disposed = false
      cleanups.push(() => { disposed = true; if (forwardTimer) { clearTimeout(forwardTimer); forwardTimer = null } })
      const tick = () => {
        if (disposed) return
        const line = cursorLine()
        const path = ctx.activePath()
        if (line != null && path && extFromPath(path) === "typ") {
          const taskId = getPreviewTaskForFile(path)
          if (taskId) {
            if (forwardTimer) clearTimeout(forwardTimer)
            forwardTimer = setTimeout(() => {
              scrollPreview(taskId, { event: "changeCursorPosition", filepath: path, line: line - 1, character: 0 })
                .catch((err: unknown) => console.warn("[typst:forward] scrollPreview failed:", err))
            }, 100)
          }
        }
        setTimeout(tick, 50)
      }
      tick()
    })()

    // Save → side panel sync + auto-export + update preview
    void (async () => {
      const { updatePreview, scrollToCursor, getPreviewTaskForFile } = await import("@/typst/backend")
      const { typstSettings } = await import("@/stores/typst-settings.svelte")
      let disposed = false
      cleanups.push(() => { disposed = true })
      let lastSaved = ctx.savedContent()
      const tick = () => {
        if (disposed) return
        const saved = ctx.savedContent()
        if (saved !== lastSaved) {
          lastSaved = saved
          const path = ctx.activePath()
          if (path && extFromPath(path) === "typ") {
            // Side panel source sync
            const norm = (p: string) => p.split("/").filter(s => s !== ".").join("/")
            const sideTab = ctx.pm.side.tabs.find((t: any) => norm(t.path) === norm(path))
            if (sideTab) {
              const cl = ctx.getCursorLine()
              if (cl != null) ctx.setSyncLine(cl - 1)
              ctx.pm.side.setTabSource(sideTab.id, saved)
              ctx.bumpPanelVersion()
            }
            // Auto-export on save
            if (typstSettings.current.exportPdf === "onSave") onTypstBuild()
            // Update live preview + scroll to cursor
            const taskId = getPreviewTaskForFile(path)
            if (taskId) {
              updatePreview(path, saved).catch(() => {})
              scrollToCursor(path, taskId).catch(() => {})
            }
          }
        }
        setTimeout(tick, 50)
      }
      tick()
    })()

    // Side panel typst preview source in sync on source change
    void (async () => {
      let disposed = false
      cleanups.push(() => { disposed = true })
      let lastSource = ctx.source()
      const tick = () => {
        if (disposed) return
        const path = ctx.activePath()
        const src = ctx.source()
        if (src !== lastSource && path && extFromPath(path) === "typ") {
          lastSource = src
          const sideTab = ctx.pm.side.tabs.find((t: any) => t.path === path && t.sourceType === "typst")
          if (sideTab && sideTab.source !== src) {
            ctx.pm.side.tabs = ctx.pm.side.tabs.map((t: any) => t.id === sideTab.id ? { ...t, source: src } : t)
            ctx.bumpPanelVersion()
          }
        } else {
          lastSource = src
        }
        setTimeout(tick, 50)
      }
      tick()
    })()
  }

  function cleanup() {
    for (const fn of cleanups) fn()
    cleanups.length = 0
    if (forwardTimer) { clearTimeout(forwardTimer); forwardTimer = null }
    if (onTypeTimer) { clearTimeout(onTypeTimer); onTypeTimer = null }
  }

  return { setupEffects, cleanup }
}
