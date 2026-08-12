import { PanelState, isPinnedCompanionOf, normPath, tabContentKind, tabContentKey, tabSpace, type Tab, type TabSource, type TabSpace } from "./panel-store";
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

  /** Link registry (Phase 2 B) : for each SIDE viewer tab, the id of the MAIN
   *  editor tab it is COUPLED to. Coupling is EXPLICIT, per tab, cumulative —
   *  created ONLY by the editor Preview/Presentation/Colles buttons and by a
   *  double-click / « Ouvrir dans l'éditeur » from the viewer (OUTSIDE nav
   *  mode). Entering nav mode RELEASES the coupling; exiting does NOT
   *  re-couple. While coupled, a sidebar click makes the viewer follow the
   *  editor. Persisted as `linkedTo` (path of the coupled main tab) on the
   *  side tab session entries by `toJSON` — the registry itself is ids-only
   *  runtime state (ids are REGENERATED at restore), `fromJSON` rebuilds it
   *  by resolving the saved paths.
   *
   *  Invariant « un seul viewer couplé par éditeur » : coupling a viewer to an
   *  editor tab automatically de-couples any OTHER viewer already coupled to
   *  that editor (enforced in `linkPreview`). The registry replaces the single
   *  `previewLinkedTabId` field: one side panel shows ONE preview tab at a
   *  time, but its identity is a session concern (tab ids change on relaunch)
   *  — callers must pass the side tab id they just opened/activated
   *  explicitly, never read it back speculatively. */
  private previewLinks = new Map<string, string>();
  private onSessionChange?: (data: PanelManagerSession) => void;

  /** Main editor tab linked to the ACTIVE side tab, if any (legacy getter
   *  used by followPreviewNavigation and the reducer guard). */
  get previewLinkedTabId(): string | null {
    const sideId = this.side.activeTabId;
    if (!sideId) return null;
    return this.previewLinks.get(sideId) ?? null;
  }

  /** Link `sideTabId` (a side viewer tab) to `mainTabId` (an editor main
   *  tab). Passing `null` breaks the link. Invariant « un seul viewer couplé
   *  par éditeur » : coupling a viewer to `mainTabId` de-couples any OTHER
   *  viewer already coupled to that same editor tab. */
  linkPreview(sideTabId: string, mainTabId: string | null): void {
    if (mainTabId === null) {
      this.previewLinks.delete(sideTabId);
    } else {
      for (const [sId, mId] of this.previewLinks) {
        if (sId !== sideTabId && mId === mainTabId) this.previewLinks.delete(sId);
      }
      this.previewLinks.set(sideTabId, mainTabId);
    }
    // Le couplage est un ÉTAT DE SESSION : notifier déclenche onSessionChange →
    // toJSON (qui persiste `linkedTo` sur les tabs side) → saveSession. Sans
    // quoi un couplage créé par linkPreview seul (ex. bouton Preview) n'était
    // JAMAIS persisté — localStorage gardait `linkedTo: null` (bug constaté :
    // couplage perdu au redémarrage). Idempotent : toJSON est un getter pur.
    this.onSessionChange?.(this.toJSON());
  }

  /** Side viewer tab coupled to `mainTabId`, or null (reverse lookup). */
  sideTabLinkedTo(mainTabId: string): string | null {
    for (const [sId, mId] of this.previewLinks) {
      if (mId === mainTabId) return sId;
    }
    return null;
  }

  /** Editor main tab linked to `sideTabId`, or null. */
  linkedEditorTabId(sideTabId: string): string | null {
    return this.previewLinks.get(sideTabId) ?? null;
  }

  /** Break every editor↔preview link (no preview tab left in the side panel). */
  clearPreviewLinks(): void {
    this.previewLinks.clear();
  }

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
    this.onSessionChange = opts?.onSessionChange;
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

  /** Ouvre `path` dans le tab ACTIF du MAIN panel (clic sidebar simple) :
   *  dédup (un tab affichant déjà le fichier est activé), sinon re-point du
   *  tab actif — le brouillon non enregistré est parké, l'onglet courant
   *  reste accessible via back/forward. */
  openInMainActiveTab(
    path: string,
    opts?: { preferDraft?: boolean; silent?: boolean; sourceType?: TabSource },
  ): Promise<void> {
    return this.main.openInActiveTab(path, opts);
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
      this.side.setSpace(t.id, "pinned", editor.id);
      // Couplage du compagnon : le viewer affiche le MÊME contenu que
      // l'éditeur épinglé (invariant « couplé ⇒ même fichier » respecté), donc
      // il le suit dès la prochaine navigation du pinned slot.
      this.linkPreview(t.id, editor.id);
    }
  }

  /** Le viewer compagnon de la sphère pinned de `editorTabId`, ou null. */
  pinnedCompanion(editorTabId: string): Tab | null {
    return this.side.tabs.find(t => isPinnedCompanionOf(t, editorTabId)) ?? null;
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
      fallbackToActive?: boolean;
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

  /** Ouvre `path` dans le tab ACTIF du SIDE panel (clic sidebar simple sur
   *  PDF/image) : dédup sinon re-point du tab actif. Force la visibilité du
   *  side panel. */
  openInSideActiveTab(
    path: string,
    opts?: { preferDraft?: boolean; silent?: boolean },
  ): Promise<void> {
    this.side.visible = true;
    this.layout = "main+side";
    return this.side.openInActiveTab(path, opts);
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

    // Couplage éditeur↔viewer reconstruit PAR CONTENU (Phase E — D1 : aucun
    // état de couplage persisté ; les ids de tabs sont régénérés au restore,
    // le contenu est le seul identifiant stable). Un couple divergent est
    // structurellement impossible : la seule porte d'entrée est l'égalité des
    // chemins.
    this.previewLinks.clear();
    for (const sideTab of this.side.tabs) {
      if (tabContentKind(sideTab.kind) !== "file" || !sideTab.path) continue;
      const mainTab = this.main.tabs.find(
        (t) => tabContentKind(t.kind) === "file" && normPath(t.path) === normPath(sideTab.path),
      );
      if (mainTab) this.previewLinks.set(sideTab.id, mainTab.id);
    }
  }

  async restoreContent(preferDraft?: boolean): Promise<void> {
    await Promise.all([
      this.main.restoreContent(preferDraft),
      this.side.restoreContent(preferDraft),
    ]);
  }
}
