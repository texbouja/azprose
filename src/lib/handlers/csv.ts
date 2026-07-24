import type { HandlerContext, FileHandler } from "./types"
import { extFromPath } from "@/lib/editor-languages"

export function createCsvHandler(context: HandlerContext): FileHandler {
  const ctx = context
  const cleanups: (() => void)[] = []
  const timers: ReturnType<typeof setTimeout>[] = []

  function setupEffects() {
    // Side panel source sync for CSV/TSV preview
    {
      let lastSource = ctx.source()
      const tick = () => {
        const path = ctx.activePath()
        const src = ctx.source()
        if (src !== lastSource && path && (extFromPath(path) === "csv" || extFromPath(path) === "tsv")) {
          lastSource = src
          const sideTab = ctx.pm.side.tabs.find((t: any) => t.path === path)
          if (sideTab && sideTab.source !== src) {
            ctx.pm.side.tabs = ctx.pm.side.tabs.map((t: any) => t.id === sideTab.id ? { ...t, source: src } : t)
            ctx.bumpPanelVersion()
          }
        } else {
          lastSource = src
        }
        timers.push(setTimeout(tick, 50))
      }
      tick()
    }

    // Save → side panel sync for CSV
    {
      let lastSaved = ctx.savedContent()
      const tick = () => {
        const saved = ctx.savedContent()
        if (saved !== lastSaved) {
          lastSaved = saved
          const path = ctx.activePath()
          if (path && (extFromPath(path) === "csv" || extFromPath(path) === "tsv")) {
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
