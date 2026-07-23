import type { HandlerContext, FileHandler } from "./types"

export type { HandlerContext, FileHandler }

type HandlerFactory = (ctx: HandlerContext) => FileHandler

const FACTORIES: Record<string, () => Promise<{ createLatexHandler: HandlerFactory } | { createMarkdownHandler: HandlerFactory } | { createCsvHandler: HandlerFactory }>> = {
  tex: () => import("./latex"),
  md:  () => import("./markdown"),
  csv: () => import("./csv"),
  tsv: () => import("./csv"),
}

function getFactory(mod: Awaited<ReturnType<NonNullable<typeof FACTORIES[string]>>>, ext: string): HandlerFactory {
  if (ext === "tex") return (mod as { createLatexHandler: HandlerFactory }).createLatexHandler
  if (ext === "csv" || ext === "tsv") return (mod as { createCsvHandler: HandlerFactory }).createCsvHandler
  return (mod as { createMarkdownHandler: HandlerFactory }).createMarkdownHandler
}

export function createHandlers(ctx: HandlerContext) {
  const loaded: Record<string, FileHandler> = {}
  const loading: Record<string, boolean> = {}

  async function ensureHandler(ext: string) {
    if (loaded[ext] || !FACTORIES[ext] || loading[ext]) return
    loading[ext] = true
    try {
      const mod = await FACTORIES[ext]()
      const factory = getFactory(mod, ext)
      const handler = factory(ctx)
      handler.setupEffects()
      loaded[ext] = handler
    } finally {
      loading[ext] = false
    }
  }

  function cleanupHandler(ext: string) {
    if (loaded[ext]) {
      loaded[ext].cleanup?.()
      delete loaded[ext]
    }
  }

  // Reactive watcher: load handler on first file open, cleanup on last file close
  let lastExt = ctx.currentExt()
  const tick = () => {
    const ext = ctx.currentExt()
    if (ext !== lastExt) {
      if (ext && FACTORIES[ext]) void ensureHandler(ext)
      lastExt = ext
    }
    setTimeout(tick, 50)
  }
  tick()

  return {
    cleanup() {
      for (const ext of Object.keys(loaded)) cleanupHandler(ext)
    },
  }
}
