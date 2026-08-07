import { PanelState, type Tab, type TabSource } from "./panel-store";

export type LayoutMode = "main" | "main+side";

export type PanelManagerSession = {
  main: ReturnType<PanelState["toJSON"]>;
  side: ReturnType<PanelState["toJSON"]>;
  layout: LayoutMode;
  splitRatio: number;
};

export class PanelManager {
  main: PanelState;
  side: PanelState;
  layout: LayoutMode = "main";
  splitRatio = 0.45;
  private savedSplitRatio = 0.55;

  /** Id of the MAIN editor tab the side preview is linked to. Set when a
   *  preview is launched from an editor tab (Preview button, wikilink-first-
   *  click); every navigation inside the preview (wikilink, back/forward,
   *  home, TOC) re-points THIS tab to the rendered file — the editor follows
   *  the preview. Never persisted; re-established when the user re-launches
   *  the preview. */
  previewLinkedTabId: string | null = null;

  constructor(opts?: {
    onSessionChange?: (data: PanelManagerSession) => void;
    onFileOpen?: (path: string) => void;
    onError?: (title: string, message: string) => void;
  }) {
    const pm = this;
    this.main = new PanelState("main", {
      onFileOpen: opts?.onFileOpen,
      onSessionChange: opts?.onSessionChange
        ? () => opts.onSessionChange!(pm.toJSON())
        : undefined,
    });
    this.side = new PanelState("side", {
      onFileOpen: opts?.onFileOpen,
      onError: opts?.onError,
      onSessionChange: opts?.onSessionChange
        ? () => opts.onSessionChange!(pm.toJSON())
        : undefined,
    });
  }

  get sideVisible(): boolean {
    return this.side.visible;
  }

  set sideVisible(v: boolean) {
    this.side.visible = v;
    this.layout = v ? "main+side" : "main";
  }

  openInMain(
    path: string,
    opts?: {
      preferDraft?: boolean;
      silent?: boolean;
      preview?: boolean;
      sourceType?: TabSource;
    },
  ): Promise<void> {
    return this.main.open(path, opts);
  }

  openInSide(
    path: string,
    opts?: {
      preferDraft?: boolean;
      silent?: boolean;
      preview?: boolean;
      sourceType?: TabSource;
    },
  ): Promise<void> {
    this.side.visible = true;
    this.layout = "main+side";
    return this.side.open(path, opts);
  }

  openCustomInSide(panelId: string, title: string): void {
    this.side.visible = true;
    this.layout = "main+side";
    this.side.openCustom(panelId, title);
  }

  /** Ouvre (ou active) un tableur dans le SIDE panel. Le panneau principal
   *  est réservé EXCLUSIVEMENT à CodeMirror — il n'existe volontairement
   *  aucun `openSpreadsheetInMain`/`openCustomInMain` : la règle est
   *  garantie par la surface d'API, pas par convention. */
  openSpreadsheetInSide(spreadsheetId: string, title: string): void {
    const existing = this.findSpreadsheetTab(spreadsheetId);
    if (existing) {
      const panel = existing.panel === "main" ? this.main : this.side;
      panel.select(existing.tab.id);
      if (existing.panel === "side") {
        this.side.visible = true;
        this.layout = "main+side";
      }
      return;
    }
    this.side.visible = true;
    this.layout = "main+side";
    this.side.openSpreadsheet(spreadsheetId, title);
  }

  /** Check if a spreadsheet is already open in either panel and return the tab info. */
  findSpreadsheetTab(spreadsheetId: string): { panel: "main" | "side"; tab: Tab } | null {
    for (const panel of [this.main, this.side]) {
      const tab = panel.tabs.find(t => t.kind === "spreadsheet" && t.spreadsheetId === spreadsheetId);
      if (tab) return { panel: panel.id as "main" | "side", tab };
    }
    return null;
  }

  /** Open (or activate) a DataFilter tab in the SIDE panel.
   *  Several grids are loaded at once into a single tab (DataFilterViewer);
   *  the stack identity is the sorted set of grid ids.
   *  NOTE: the main panel is reserved EXCLUSIVELY for the CodeMirror editor —
   *  all tool views (data filter, spreadsheet, calendar, …) open in side. */
  openDataFilterInSide(datafilterIds: string[], title: string): void {
    const key = (ids: string[]) => [...ids].sort().join("\u0000");
    const target = key(datafilterIds);
    for (const panel of [this.main, this.side]) {
      const tab = panel.tabs.find(t => t.kind === "datafilter" && t.datafilterIds && key(t.datafilterIds) === target);
      if (tab) {
        panel.select(tab.id);
        if (panel.id === "side") {
          this.side.visible = true;
          this.layout = "main+side";
        }
        return;
      }
    }
    this.side.visible = true;
    this.layout = "main+side";
    this.side.openDataFilter(datafilterIds, title);
  }

  /** Open the spreadsheet panel without loading any sheet (create mode). */
  openEmptySpreadsheetPanel(): void {
    this.side.visible = true;
    this.layout = "main+side";
    this.side.openEmptySpreadsheet("Tableur");
  }

  /** Update the tab title for a spreadsheet (called after loading its real name).
   *  No-op when the title is unchanged — the spreadsheet viewer dispatches
   *  `azprose:spreadsheet-title-change` on EVERY load(), so an unconditional
   *  setTabTitle would cascade notify() → re-render on each reload. */
  setSpreadsheetTabTitle(spreadsheetId: string, title: string): void {
    const sideTab = this.side.tabs.find(
      t => t.kind === "spreadsheet" && t.spreadsheetId === spreadsheetId
    );
    if (sideTab && sideTab.title !== title) this.side.setTabTitle(sideTab.id, title);
    const mainTab = this.main.tabs.find(
      t => t.kind === "spreadsheet" && t.spreadsheetId === spreadsheetId
    );
    if (mainTab && mainTab.title !== title) this.main.setTabTitle(mainTab.id, title);
  }

  /** Set the spreadsheetId + title on the first "create" tab (no spreadsheetId yet).
   *  Called after the user creates a spreadsheet via the dialog. */
  setSpreadsheetTabId(spreadsheetId: string, title: string): void {
    this.side.upgradeSpreadsheetTab(spreadsheetId, title);
    this.main.upgradeSpreadsheetTab(spreadsheetId, title);
  }

  toggleExpandPanel(panelId: "main" | "side"): number {
    const expanded =
      (panelId === "main" && this.splitRatio >= 0.99) ||
      (panelId === "side" && this.splitRatio <= 0.01);
    if (expanded) {
      this.splitRatio = this.savedSplitRatio;
    } else {
      this.savedSplitRatio = this.splitRatio;
      this.splitRatio = panelId === "main" ? 1 : 0;
    }
    return this.splitRatio;
  }

  findTabByPath(path: string): { panel: "main" | "side"; tab: Tab } | null {
    const norm = (p: string) =>
      p
        .split("/")
        .filter((s) => s !== ".")
        .join("/");
    const target = norm(path);
    for (const panel of [this.main, this.side]) {
      const tab = panel.tabs.find((t) => norm(t.path) === target);
      if (tab) return { panel: panel.id as "main" | "side", tab };
    }
    return null;
  }

  findCustomTab(panelId: string): { panel: "main" | "side"; tab: Tab } | null {
    for (const panel of [this.main, this.side]) {
      const tab = panel.tabs.find((t) => t.kind === "custom" && t.panelId === panelId);
      if (tab) return { panel: panel.id as "main" | "side", tab };
    }
    return null;
  }

  saveAllDrafts(): void {
    this.main.saveDrafts();
    this.side.saveDrafts();
  }

  toJSON(): PanelManagerSession {
    return {
      main: this.main.toJSON(),
      side: this.side.toJSON(),
      layout: this.layout,
      splitRatio: this.splitRatio,
    };
  }

  fromJSON(data: PanelManagerSession): void {
    this.main.fromJSON(data.main);
    this.side.fromJSON(data.side);
    this.layout = data.layout ?? "main";
    this.splitRatio = data.splitRatio ?? 0.55;
    this.savedSplitRatio = this.splitRatio;
    this.side.visible = data.layout === "main+side";

    // Consolidation « main réservé EXCLUSIVEMENT à CodeMirror » : une session
    // sauvegardée avant la consolidation peut contenir des onglets d'outils
    // (tableur, DataFilter) dans le panneau principal — on les migre vers le
    // side panel au restore. La règle est ainsi garantie même pour l'héritage,
    // pas seulement à l'ouverture (openDataFilterInSide/openSpreadsheetInSide).
    const toolTabs = this.main.tabs.filter(
      t => t.kind === "spreadsheet" || t.kind === "datafilter",
    );
    if (toolTabs.length > 0) {
      const mainActive = this.main.activeTabId;
      this.main.tabs = this.main.tabs.filter(
        t => t.kind !== "spreadsheet" && t.kind !== "datafilter",
      );
      if (!this.main.tabs.some(t => t.id === this.main.activeTabId)) {
        this.main.activeTabId = this.main.tabs[0]?.id ?? null;
      }
      const movedActive = toolTabs.find(t => t.id === mainActive);
      this.side.tabs = [...this.side.tabs, ...toolTabs];
      if (movedActive) this.side.activeTabId = movedActive.id;
      this.side.visible = true;
      this.layout = "main+side";
    }
  }

  async restoreContent(preferDraft?: boolean): Promise<void> {
    await Promise.all([
      this.main.restoreContent(preferDraft),
      this.side.restoreContent(preferDraft),
    ]);
  }
}
