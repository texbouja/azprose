import type { HandlerContext, FileHandler } from "./types"
import { extFromPath } from "@/lib/editor-languages"
import { invoke } from "@tauri-apps/api/core"

export function createLatexHandler(context: HandlerContext): FileHandler {
  const ctx = context
  const cleanups: (() => void)[] = []

  async function onLatexBuild() {
    const { handleLatexBuild } = await import("@/latex")
    await handleLatexBuild(
      ctx.ls,
      ctx.activePath(),
      ctx.handleSave,
      ctx.handleSaveAll,
      () => ctx.setConsoleOpen(true),
      () => ctx.setConsoleTab("log"),
    )
    if (ctx.ls.viewerPdfPath) {
      await ctx.pm.openInSide(ctx.ls.viewerPdfPath, { sourceType: "latex" })
      ctx.setSideVisible(true)
    }
  }

  function setupEffects() {
    // LaTeX log listener
    void (async () => {
      const { setupLatexLogListener } = await import("@/latex")
      const unlisten = setupLatexLogListener()
      cleanups.push(unlisten)
    })()

    // Cleanup non-latex state when switching away
    {
      let lastExt = ctx.currentExt()
      const tick = () => {
        const ext = ctx.currentExt()
        if (ext !== lastExt) {
          if (lastExt !== "tex") {
            ctx.ls.latexBuilding = false
            import("@/stores/diagnostics.svelte").then(m => m.diagnosticsStore.clear("latex"))
            import("@/latex").then(m => m.clearLatexDeps(ctx.ls))
          }
          lastExt = ext
        }
        setTimeout(tick, 50)
      }
      tick()
    }

    // Root file detection on tex tab switch
    {
      let lastPath = ctx.activePath()
      const tick = () => {
        const p = ctx.activePath()
        if (p !== lastPath) {
          lastPath = p
          if (p && extFromPath(p) === "tex" && !ctx.ls.rootFilePath) {
            invoke<{ root_file: string | null; method: string }>("latex_find_root", { path: p })
              .then((res: { root_file: string | null; method: string }) => {
                if (res.root_file && res.root_file !== p) {
                  ctx.ls.rootFilePath = res.root_file
                }
              })
              .catch(() => {})
          }
        }
        setTimeout(tick, 50)
      }
      tick()
    }

    // Auto-build on dependency save
    {
      let lastSaved = ctx.savedContent()
      const tick = async () => {
        const saved = ctx.savedContent()
        if (saved !== lastSaved) {
          lastSaved = saved
          const path = ctx.activePath()
          if (path && extFromPath(path) === "tex") {
            const { autoBuildIfDepChanged } = await import("@/latex")
            autoBuildIfDepChanged(ctx.ls, path, onLatexBuild)
          }
        }
        setTimeout(tick, 50)
      }
      tick()
    }
  }

  function cleanup() {
    for (const fn of cleanups) fn()
    cleanups.length = 0
  }

  return { setupEffects, cleanup }
}
