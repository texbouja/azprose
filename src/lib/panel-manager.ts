import { PanelState, isPinnedCompanionOf, normPath, tabContentKey, tabSpace, type Tab, type TabSource, type TabSpace } from "./panel-store";
import type { ContentStore } from "./content-store";

export type LayoutMode = "main" | "main+side";

// `normPath` (panel-store) : normalisation de chemin partagée (drop des
// segments `.`) — utilisée par le couplage persisté (linkedTo) et
// findTabByPath : une session ne doit pas perdre un couplage à cause d'un
// `/a/./b.md` vs `/a/b.md`.

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

  /**
   * Le REGISTRE DE COUPLAGE éditeur↔viewer est SUPPRIMÉ (Phase G — D1) : plus
   * de `previewLinks`, `linkPreview`, `sideTabLinkedTo`, `linkedEditorTabId`,
   * `clearPreviewLinks`, ni `linkedTo` persisté. Les tabs se reconnaissent par
   * leur CONTENU ; la seule relation qui subsiste est celle de la SPHÈRE
   * PINNED : un viewer compagnon porte l'id de son éditeur épinglé
   * (`pinnedOwner`, runtime) et suit ses montages (`pinnedCompanion`).
   */

  constructor(opts?: {
    onSessionChange?: (data: PanelManagerSession) => void;
    onFileOpen?: (path: string) => void;
    onError?: (title: string, message: string) => void;
    /** Fermeture d'un onglet (matrice cas 3) — forwardée aux deux PanelState
     *  pour la purge des états par tab (mode nav, historique). */
    onTabClosed?: (tabId: string, tab: Tab) => void;
    /** Source unique du contenu par chemin (phase 7, idée E) — passée aux
     *  deux PanelState ; optionnelle (tests sans store → lecture disque). */
    content?: ContentStore;
  }) {
    const pm = this;
    this.main = new PanelState("main", {
      onFileOpen: opts?.onFileOpen,
      onSessionChange: opts?.onSessionChange
        ? () => opts.onSessionChange!(pm.toJSON())
        : undefined,
      onTabClosed: opts?.onTabClosed,
    }, opts?.content);
    this.side = new PanelState("side", {
      onFileOpen: opts?.onFileOpen,
      onError: opts?.onError,
      onSessionChange: opts?.onSessionChange
        ? () => opts.onSessionChange!(pm.toJSON())
        : undefined,
      onTabClosed: opts?.onTabClosed,
    }, opts?.content);
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

  /**
   * Épingle / dé-épingle un tab du MAIN panel (Phase A — R1 : le pinnage se
   * décide dans le MAIN panel, les viewers n'ont qu'un badge). Commutation :
   * au plus un tab épinglé par format (épingler dé-épingle l'autre du même
   * format). État RUNTIME NON PERSISTÉ — jamais dans la session.
   *
   * Sphère pinned (Phase C — R1 round 5) : après commutation, les viewers
   * side `space: "pinned"` reflètent les éditeurs épinglés (`syncPinnedViewers`).
   */
  setMainPinned(tabId: string, pinned: boolean): void {
    this.main.setPinned(tabId, pinned);
    this.syncPinnedViewers();
  }

  /**
   * Réaligne les viewers SIDE sur les éditeurs épinglés (Phase C — R1/R2) :
   * - ADOPTION : un viewer LIBRE du même contenu qu'un éditeur épinglé devient
   *   son compagnon (`pinnedOwner` = id de l'éditeur ; jamais deux compagnons
   *   pour un même éditeur) et est COUPLÉ à lui — le compagnon .md suit le
   *   contenu du pinned slot (D4, sync structurelle) ;
   * - LIBÉRATION : un viewer pinned dont l'éditeur propriétaire n'est plus
   *   épinglé (commutation, dé-épinglage, fermeture) redevient libre.
   */
  private syncPinnedViewers(): void {
    const pinnedEditors = this.main.tabs.filter(t => tabSpace(t) === "pinned");
    const pinnedIds = new Set(pinnedEditors.map(t => t.id));
    for (const t of [...this.side.tabs]) {
      if (tabSpace(t) === "pinned") {
        if (!t.pinnedOwner || !pinnedIds.has(t.pinnedOwner)) this.side.setSpace(t.id, "free");
        continue;
      }
      const key = tabContentKey(t);
      const editor = pinnedEditors.find(e => tabContentKey(e) === key);
      if (!editor) continue;
      if (this.side.tabs.some(v => isPinnedCompanionOf(v, editor.id))) continue;
      // `pinnedOwner` = id de l'éditeur épinglé : c'est LA relation qui reste
      // (le compagnon suit ses montages, D4) — plus aucun registre de couplage.
      this.side.setSpace(t.id, "pinned", editor.id);
    }
  }

  /** Le viewer compagnon de la sphère pinned de `editorTabId`, ou null. */
  pinnedCompanion(editorTabId: string): Tab | null {
    return this.side.tabs.find(t => isPinnedCompanionOf(t, editorTabId)) ?? null;
  }

  /**
   * Y a-t-il AU MOINS un slot épinglé dans le MAIN ? (rectification 3 : l'état
   * « il y a un pinned tab » est transcendant — test immédiat, index dérivé.)
   * C'est LUI qui décide du sens de l'alt+clic : sans slot épinglé, alt+clic
   * vaut clic ; avec slot épinglé, alt+clic monte dans le slot du format.
   */
  hasPinnedTab(): boolean {
    return this.main.hasPinned();
  }

  /** Le tab éditeur épinglé du `format` (md, tex, …) dans le MAIN, ou null.
   *  Le « pinned slot » d'un format (Phase A) : son contenu courant est dérivé
   *  du tab (path + source + savedContent) ; la pile d'historique et le buffer
   *  mémorisé du retour sans rebuild arrivent en phase D. */
  pinnedMainTab(format: string): Tab | null {
    return this.main.pinnedTab(format) ?? null;
  }

  /** Ferme un tab éditeur du MAIN panel. Règle couplée (Phase C — R4) :
   *  fermer un tab ÉPINGLÉ ferme AUSSI le viewer de sa sphère (celui dont il
   *  est le PROPRIÉTAIRE : même contenu pour .md, PDF du maître pour .tex) —
   *  l'inverse non (fermer le viewer ne ferme jamais l'éditeur, le bouton
   *  preview le relance). No-op sans tab. */
  closeMainTab(tabId: string): void {
    const tab = this.main.tabs.find(t => t.id === tabId);
    const wasPinned = tab != null && tabSpace(tab) === "pinned";
    this.main.close(tabId);
    if (wasPinned) {
      const viewers = this.side.tabs.filter(t => isPinnedCompanionOf(t, tabId));
      viewers.forEach(v => this.side.close(v.id));
    }
  }

  openInSide(
    path: string,
    opts?: {
      preferDraft?: boolean;
      silent?: boolean;
      preview?: boolean;
      sourceType?: TabSource;
      forceNew?: boolean;
      /** Espace cible (Phase C) : `"pinned"` = viewer de la sphère pinned
       *  (bouton preview d'un éditeur épinglé), défaut libre. Dédup PAR
       *  ESPACE — un viewer libre du même contenu n'est jamais adopté. */
      space?: TabSpace;
      /** Éditeur propriétaire du viewer pinned (`tabContentKey`) — à poser
       *  quand le contenu diffère de celui de l'éditeur (PDF du maître, R7). */
      pinnedOwner?: string;
    },
  ): Promise<void> {
    this.side.visible = true;
    this.layout = "main+side";
    return this.side.open(path, opts);
  }

  /**
   * ADOPTE un viewer PDF déjà ouvert dans la sphère pinned du tex épinglé
   * (Phase C — R7, MÉCANISME MAÎTRE : le PDF appartient au tex épinglé même
   * quand celui-ci est un fichier INCLUS — la liaison tient en excursion).
   * Le propriétaire est mémorisé (`pinnedOwner`) : le viewer n'est pas libéré
   * par l'épinglage d'un autre format et se ferme avec son éditeur (R4).
   * Retourne `true` si un viewer a été adopté (aucune ouverture ici).
   */
  adoptLatexViewer(pdfPath: string): boolean {
    const pinnedTex = this.pinnedMainTab("tex");
    if (!pinnedTex) return false;
    const target = normPath(pdfPath);
    const viewer = this.side.tabs.find((t) => normPath(t.path) === target);
    if (!viewer) return false;
    this.side.setSpace(viewer.id, "pinned", pinnedTex.id);
    return true;
  }

  /** Ouvre le PDF du viewer LaTeX (Phase C — R7). Si l'éditeur tex est épinglé
   *  (pinned slot « tex »), le viewer appartient à la SPHÈRE PINNED :
   *  - un viewer du même PDF déjà ouvert est ADOPTÉ (`adoptLatexViewer` —
   *    jamais un doublon pinned, cohérent R1 « épingler adopte le viewer ») ;
   *  - sinon ouverture `space: "pinned"` avec le tex épinglé pour propriétaire.
   *  Éditeur non épinglé → comportement historique (espace libre). */
  async openLatexViewerPdf(path: string, sourceType: TabSource = "latex"): Promise<void> {
    const pinnedTex = this.pinnedMainTab("tex");
    if (!pinnedTex) return this.openInSide(path, { sourceType });
    if (this.adoptLatexViewer(path)) {
      const viewer = this.side.tabs.find((t) => normPath(t.path) === normPath(path));
      if (viewer) this.side.select(viewer.id);
      this.side.visible = true;
      this.layout = "main+side";
      return;
    }
    return this.openInSide(path, { sourceType, space: "pinned", pinnedOwner: pinnedTex.id });
  }

  openCustomInSide(panelId: string, title: string): void {
    this.side.visible = true;
    this.layout = "main+side";
    this.side.openCustom(panelId, title);
  }

  /** Ouvre (ou ré-affecte) l'onglet d'aide intégrée (DocPreview) dans le SIDE
   *  panel — lecture seule, tab UNIQUE (`kind: "doc"`). Le panneau principal
   *  reste réservé EXCLUSIVEMENT à CodeMirror : il n'existe volontairement
   *  aucun `openDocInMain`. */
  openDoc(docPath: string, opts?: { silent?: boolean }): Promise<void> {
    this.side.visible = true;
    this.layout = "main+side";
    return this.side.openDoc(docPath, opts);
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

  /** Sort de la maximisation du panneau `panelId` (retour au ratio sauvegardé)
   *  si elle était active ; retourne le nouveau ratio. Ne change rien sinon. */
  unexpandPanel(panelId: "main" | "side"): number {
    const expanded =
      (panelId === "main" && this.splitRatio >= 0.99) ||
      (panelId === "side" && this.splitRatio <= 0.01);
    if (!expanded) return this.splitRatio;
    this.splitRatio = this.savedSplitRatio;
    return this.splitRatio;
  }

  findTabByPath(path: string): { panel: "main" | "side"; tab: Tab } | null {
    const target = normPath(path);
    for (const panel of [this.main, this.side]) {
      const tab = panel.tabs.find((t) => normPath(t.path) === target);
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

  /**
   * Session SCHEMA V2 (Phase E) : le contenu des onglets, rien d'autre. Ni
   * espace pinned/propriétaire, ni historique de montage, ni mode navigation,
   * ni couplage (`linkedTo` du schema v1 — le couplage est reconstruit PAR
   * CONTENU au boot, D1). Les états runtime meurent avec la session.
   */
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

    // Aucun couplage à reconstruire (Phase G — D1) : les tabs se reconnaissent
    // par leur contenu, et la sphère pinned est RUNTIME (rien d'épinglé au
    // boot, R9).
  }

  async restoreContent(preferDraft?: boolean): Promise<void> {
    await Promise.all([
      this.main.restoreContent(preferDraft),
      this.side.restoreContent(preferDraft),
    ]);
  }
}
