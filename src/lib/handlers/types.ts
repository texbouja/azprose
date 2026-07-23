import type { LatexState } from "@/latex"
import type { PanelManager } from "@/lib/panel-manager"

export interface HandlerContext {
  activePath:     () => string | null
  source:         () => string
  savedContent:   () => string
  consoleOpen:    () => boolean
  rootPath:       () => string | null
  sideActivePath: () => string | null

  setConsoleOpen:  (v: boolean) => void
  setConsoleTab:   (tab: "diagnostics" | "terminal" | "log") => void
  setSideVisible:  (v: boolean) => void
  setScrollTarget: (target: string) => void
  setSyncLine:     (line: number) => void
  navPush:         (path: string) => void

  ls: LatexState

  pm: PanelManager
  openFileInTab: (path: string, opts?: { silent?: boolean; asDraft?: boolean }) => Promise<void>
  bumpPanelVersion: () => void

  currentExt: () => string | null

  handleSave:    () => Promise<void>
  handleSaveAll: (deps: string[]) => Promise<void>

  t: (key: string, params?: Record<string, string>) => string
  notify: { setInfo: (msg: string) => void }
}

export interface FileHandler {
  setupEffects: () => void
  cleanup?: () => void
}
