import type { HandlerContext, FileHandler } from "./types"
import { extFromPath } from "@/lib/editor-languages"
import { invoke } from "@tauri-apps/api/core"
import { applyDetectedRoot, autoBuildIfDepChanged, clearLatexDeps, handleLatexBuild, setupLatexLogListener } from "@/latex"
import { diagnosticsStore } from "@/stores/diagnostics.svelte" // statique : déjà eager (app.svelte) — l'import() ne découpait aucun chunk
import { getRootPath } from "@/stores/root-path.svelte"

export function createLatexHandler(context: HandlerContext): FileHandler {
  const ctx = context
  const cleanups: (() => void)[] = []
  const timers: ReturnType<typeof setTimeout>[] = []

  async function onLatexBuild() {
    await handleLatexBuild(
      ctx.ls,
      ctx.activePath(),
      ctx.handleSave,
      ctx.handleSaveAll,
      () => ctx.setConsoleOpen(true),
      () => ctx.setConsoleTab("log"),
    )
    if (ctx.ls.viewerPdfPath) {
      await ctx.pm.openLatexViewerPdf(ctx.ls.viewerPdfPath)
      ctx.setSideVisible(true)
    }
  }

  function setupEffects() {
    // LaTeX log listener
    void (async () => {
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
            diagnosticsStore.clear("latex")
            clearLatexDeps(ctx.ls)
          }
          lastExt = ext
        }
        timers.push(setTimeout(tick, 50))
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
          // Détection à CHAQUE changement d'onglet .tex — plus seulement
          // quand aucune racine n'est connue. L'ancienne garde
          // (`!ctx.ls.rootFilePath`) faisait hériter la racine d'un document
          // à l'autre : après avoir compilé `A/master.tex`, ouvrir
          // `B/master.tex` laissait la racine sur A, et « compiler »
          // recompilait A. Voir `applyDetectedRoot`.
          if (p && extFromPath(p) === "tex") {
            // La racine du coffre BORNE la recherche : sans elle, la remontée
            // allait jusqu'à `/` et un `master.tex` situé au-dessus du projet
            // pouvait devenir la cible de « compiler ».
            invoke<{ root_file: string | null; method: string }>("latex_find_root", { path: p, projectRoot: getRootPath() })
              .then((res: { root_file: string | null; method: string }) => {
                // L'onglet a pu changer pendant l'aller-retour : ne rien
                // appliquer si la réponse ne concerne plus le fichier actif.
                if (ctx.activePath() !== p) return
                applyDetectedRoot(ctx.ls, res.root_file ?? p)
              })
              .catch(() => {})
          }
        }
        timers.push(setTimeout(tick, 50))
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
            autoBuildIfDepChanged(ctx.ls, path, onLatexBuild)
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
