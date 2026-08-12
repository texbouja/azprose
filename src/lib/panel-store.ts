import { basename, isOpenablePath, isPdfPath, isImagePath } from "@/lib";
import { readText, writeText } from "@/lib/files";
import { saveDraft, loadDraft, clearDraft } from "@/lib/session";
import { ContentStore } from "@/lib/content-store";

export type RenderMode = "raw" | "prose" | "preview" | "presentation" | "colle";
export type TabSource = "latex";
export type TabKind = "file" | "custom" | "spreadsheet" | "datafilter" | "doc";

/**
 * Espace d'un tab (Phase A « pinned tabs ») : `"pinned"` (sphère épinglée —
 * au plus un éditeur par format, décidé par l'UTILISATEUR) ou `"free"`
 * (par défaut). RUNTIME uniquement : jamais persisté en session (toJSON ne
 * l'écrit pas, fromJSON restaure tout libre — R9). Les deux espaces sont
 * ISOLÉS : la dédup par contenu s'applique DANS chaque espace, jamais entre
 * eux (R3 — le même fichier peut exister épinglé ET libre).
 */
export type TabSpace = "pinned" | "free";

/** Normalisation de chemin partagée (drop des segments `.`). */
export function normPath(p: string): string {
  return p.split("/").filter(s => s !== ".").join("/");
}

/**
 * Clé d'IDENTITÉ PAR CONTENU d'un tab (Phase A) — remplace la recherche par
 * chemin seul : l'identité dérive de la nature du contenu, pas de l'id de tab
 * (les ids sont régénérés à chaque restore). Un même contenu ne peut exister
 * qu'UNE fois par espace (dédup), jamais de doublon dans le même espace.
 * - fichier / doc / custom / spreadsheet : chemin normalisé (les paths
 *   `custom://…`, `spreadsheet://…` sont déjà uniques par identité) ;
 * - datafilter : identité = ENSEMBLE TRIÉ des ids (le path `datafilter://stack`
 *   est partagé par toutes les piles — la clé seule les distingue).
 */
export function tabContentKey(tab: Pick<Tab, "path" | "kind" | "datafilterIds">): string {
  if (tab.kind === "datafilter") {
    return `datafilter:${[...(tab.datafilterIds ?? [])].sort().join("\u0000")}`;
  }
  return normPath(tab.path);
}

/** Clé d'une CIBLE à ouvrir (même convention que `tabContentKey`). */
export function targetContentKey(path: string, kind?: TabKind, datafilterIds?: string[]): string {
  if (kind === "datafilter") {
    return `datafilter:${[...(datafilterIds ?? [])].sort().join("\u0000")}`;
  }
  return normPath(path);
}

/** Espace effectif d'un tab (le champ absent vaut `"free"`). */
export function tabSpace(tab: { space?: TabSpace }): TabSpace {
  return tab.space ?? "free";
}

/**
 * Format d'épinglage d'un fichier = son extension (un seul éditeur épinglé par
 * format : md, tex, typ, …). `null` pour un path sans extension.
 */
export function tabPinFormat(path: string): string | null {
  const i = path.lastIndexOf(".");
  if (i === -1) return null;
  return path.slice(i + 1).toLowerCase();
}

/**
 * Un tab est ÉPINGLABLE s'il est un tab de FICHIER TEXTE éditable (jamais un
 * outil, jamais l'aide, jamais un PDF/image — le pin est l'état d'un ÉDITEUR).
 * Le pinnage se décide dans le MAIN panel (R1, round 5) : `canPinTab` ne
 * dépend pas du panel — c'est le composant qui ne l'affiche que là.
 */
export function canPinTab(tab: Tab): boolean {
  if (tabContentKind(tab.kind) !== "file") return false;
  if (isPdfPath(tab.path) || isImagePath(tab.path)) return false;
  return tabPinFormat(tab.path) !== null;
}

/**
 * Classification exhaustive du kind d'un tab (phase 4, idée G du rapport
 * architecture-review). Tout nouveau `TabKind` ajouté à l'union DOIT être
 * traité ici — le `default` du switch est un check `never` : ajouter un kind
 * sans le classer devient une ERREUR DE COMPILATION dans ce fichier.
 *
 * - `"file"` — tab de fichier texte (kind `undefined` = legacy) OU `kind:
 *   "file"` explicite (préservé par un restore de session) : contenu éditable
 *   (md/tex/…), brouillons, politique A.
 * - `"doc"` — article de la documentation intégrée : contenu fichier en
 *   lecture seule (jamais dirty, jamais ré-affecté, jamais de brouillon).
 * - `"data"` — tab d'OUTIL (custom/spreadsheet/datafilter) : PAS de contenu
 *   fichier (`source` reste `""`, `savedContent` `""`), l'état vit dans
 *   SQLite/les stores. Jamais de brouillon, jamais de lecture disque, jamais
 *   ré-affecté par une navigation fichier.
 */
export type TabContentKind = "file" | "doc" | "data";

export function tabContentKind(kind: TabKind | undefined): TabContentKind {
  switch (kind) {
    case undefined:
    case "file":
      return "file";
    case "doc":
      return "doc";
    case "custom":
    case "spreadsheet":
    case "datafilter":
      return "data";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Kind legacy accepté par `fromJSON` (avant le merge DataFilter). */
export type LegacyTabKind = TabKind | "datagrid" | undefined;

/**
 * Normalise le kind d'un tab restauré de session (phase 4, idée G). Le switch
 * est EXHAUSTIF sur `LegacyTabKind` : un nouveau `TabKind` rend le `default`
 * non-never → erreur de compilation. La migration legacy « datagrid →
 * datafilter » (vue unique devenue pile d'une carte, avant le merge) vit ici,
 * en un seul endroit.
 */
export function normalizeLegacyKind(raw: LegacyTabKind): TabKind | undefined {
  switch (raw) {
    case undefined:
    case "file":
    case "doc":
    case "custom":
    case "spreadsheet":
    case "datafilter":
      return raw;
    case "datagrid":
      return "datafilter";
    default: {
      const _exhaustive: never = raw;
      return _exhaustive;
    }
  }
}

export type Tab = {
  id: string;
  title: string;
  path: string;
  source: string;
  savedContent: string;
  preview?: boolean;
  renderMode?: RenderMode;
  sourceType?: TabSource;
  kind?: TabKind;
  panelId?: string;
  spreadsheetId?: string;
  datafilterIds?: string[];
  /** Espace pinned/libre (Phase A) — RUNTIME, NON persisté (absent = libre). */
  space?: TabSpace;
};

export type PanelSessionData = {
  tabs: { path: string; title: string; renderMode?: RenderMode; sourceType?: TabSource; kind?: TabKind; panelId?: string; spreadsheetId?: string; datafilterIds?: string[]; /** Couplage éditeur↔viewer persisté — chemin du tab éditeur main couplé, rempli par PanelManager.toJSON pour les tabs side (les ids de tabs ne survivent pas au redémarrage). Absent = viewer indépendant ou session legacy. */ linkedTo?: string | null }[];
  activePath: string | null;
};

export type PanelCallbacks = {
  onSessionChange?: (data: PanelSessionData) => void;
  onFileOpen?: (path: string) => void;
  onError?: (title: string, message: string) => void;
  /** Fermeture d'un onglet (après le retrait de la liste) — permet à l'app de
   *  purger les états PAR TAB (mode nav preview, historique back/forward —
   *  matrice cas 3 : ces états meurent avec l'onglet). */
  onTabClosed?: (tabId: string, tab: Tab) => void;
};

/**
 * Décide du tab à ré-affecter lors d'un `open(path, { preview: true })`.
 * (fonction PURE — testable sans Tauri/fs ; consommée par `PanelState.open`).
 *
 * Priorités :
 * 1. `fallbackToActive` (navigation « tab actif » : wikilink du viewer, sidebar
 *    maximisée, back & forward) → re-pointe le tab ACTIF du panneau (le clic a
 *    lieu dans le tab visible), pourvu que ce soit un tab de FICHIER (kind non
 *    défini — un tab custom/spreadsheet/datafilter ne peut pas être ré-affecté)
 *    ET du MÊME ESPACE que la cible (un tab épinglé n'est JAMAIS ré-affecté
 *    par une ouverture libre — R3, isolation des espaces).
 *    C'est le comportement « clic simple = tab actif », indépendant du flag
 *    `preview` (perdu par un restore de session ou une ré-affectation
 *    openInActiveTab) — sans lui, chaque clic créait un NOUVEL onglet.
 * 2. sinon, un tab existant marqué `preview: true` (mécanique historique de
 *    ré-affectation en place) — du même espace que la cible.
 * 3. sinon → nouveau tab (`id: null`).
 */
export function pickOpenTarget(
  tabs: Tab[],
  activeTabId: string | null,
  wantPreview: boolean,
  fallbackToActive: boolean | undefined,
  space: TabSpace = "free",
): { id: string | null; isFallback: boolean } {
  if (wantPreview && fallbackToActive) {
    const active = tabs.find(t => t.id === activeTabId);
    // Uniquement les tabs de FICHIER (kind undefined legacy ou "file") du même
    // espace que la cible — jamais un tab doc/data (ré-affecter l'aide ou un
    // outil = vampirisation), jamais un tab épinglé (isolation des espaces).
    if (active && tabContentKind(active.kind) === "file" && tabSpace(active) === space) return { id: active.id, isFallback: true };
  }
  if (wantPreview) {
    // Le tab doc (aide intégrée) et les tabs d'OUTILS ne sont JAMAIS
    // ré-affectés par un preview normal — seuls les tabs de fichier le sont,
    // et dans le même espace que la cible.
    const reuse = tabs.find(t => t.preview && tabContentKind(t.kind) === "file" && tabSpace(t) === space);
    if (reuse) return { id: reuse.id, isFallback: false };
  }
  return { id: null, isFallback: false };
}

/**
 * Ré-affectation d'un tab existant (recyclage : changement de fichier) — le
 * viewer repasse en mode GÉNÉRAL (`preview`). Direction utilisateur : « à
 * chaque recyclage d'un tab éditeur, passer immédiatement le viewer en mode
 * général » — le viewer généraliste est le mode d'affichage par défaut, les
 * modes alternatifs (colle, presentation) ne s'atteignent que par leur bascule
 * TabActions et ne survivent PAS au recyclage (un autre fichier s'affiche : on
 * redémarre en mode général, l'utilisateur rebascule s'il le souhaite).
 * Seuls les modes VIEWER (preview/presentation/colle) sont réarmés : les modes
 * ÉDITEUR (raw/prose — tabs du panneau main, `repoint` est aussi utilisé sur
 * les tabs main par preview-follow) sont préservés. `preview`/`undefined` →
 * no-op.
 */
function recycleRenderMode(mode: RenderMode | undefined): RenderMode | undefined {
  return mode === "presentation" || mode === "colle" ? "preview" : mode;
}

export class PanelState {
  readonly id: string;
  visible: boolean = true;
  tabs: Tab[] = [];
  activeTabId: string | null = null;
  private cbs: PanelCallbacks;
  /** Source unique du contenu par chemin (phase 7, idée E). Optionnel : sans
   *  store (tests, contexte non-app), les méthodes lisent/écrivent le disque
   *  directement (comportement historique). Avec store, le CONTENU vit dans
   *  le store (l'autorité) et `source`/`savedContent` des tabs restent des
   *  REFLETS maintenus par l'écrivain unique. */
  private content?: ContentStore;

  constructor(id: string, callbacks: PanelCallbacks = {}, content?: ContentStore) {
    this.id = id;
    this.cbs = callbacks;
    this.content = content;
  }

  /** Lecture disque (+ draft politique A) via l'autorité : le ContentStore si
   *  présent, sinon le chemin historique (readText + loadDraft). Retourne le
   *  couple {source, saved} pour les REFLETS du tab. */
  private async readContent(
    path: string,
    opts?: { preferDraft?: boolean; forceBuffer?: boolean },
  ): Promise<{ source: string; saved: string }> {
    if (this.content) {
      await this.content.load(path, opts);
      return { source: this.content.get(path), saved: this.content.getSaved(path) };
    }
    const fileSource = await readText(path);
    const draft = opts?.preferDraft ? loadDraft(path) : null;
    // Draft vide = artefact (jamais restauré — cf. ContentStore.load)
    const source = draft !== null && draft !== "" && draft !== fileSource ? draft : fileSource;
    return { source, saved: fileSource };
  }

  /** Park politique A (buffer → draft) via l'autorité, sinon historique. */
  private parkContent(path: string, source: string): void {
    if (this.content) this.content.park(path);
    else saveDraft(path, source);
  }

  get activeTab(): Tab | undefined {
    return this.tabs.find(t => t.id === this.activeTabId);
  }

  get activePath(): string | null {
    return this.activeTab?.path ?? null;
  }

  get source(): string {
    return this.activeTab?.source ?? "";
  }

  get savedContent(): string {
    return this.activeTab?.savedContent ?? "";
  }

  private notify(): void {
    this.cbs.onSessionChange?.(this.toJSON());
  }

  async open(path: string, opts?: { preferDraft?: boolean; silent?: boolean; preview?: boolean; sourceType?: TabSource; fallbackToActive?: boolean; forceNew?: boolean; space?: TabSpace }): Promise<void> {
    if (!isOpenablePath(path)) {
      if (!opts?.silent) {
        this.cbs.onError?.("Format", `unsupported format: ${basename(path)}`);
      }
      return;
    }
    // Normalize path to prevent duplicate tabs for /a/./b.md vs /a/b.md
    const normalized = normPath(path);
    const wantPreview = opts?.preview === true;
    // Espace cible (Phase A) : par défaut libre. Dédup PAR ESPACE — le même
    // fichier peut exister épinglé ET libre (R3), jamais deux fois dans le
    // même espace. `forceNew` (bouton Preview de l'éditeur, routage maximisé) :
    // JAMAIS de dédup ni de ré-affectation — un NOUVEL onglet est toujours
    // créé (dans l'espace cible).
    const space = opts?.space ?? "free";
    const existing = opts?.forceNew ? undefined : this.tabs.find(t => normPath(t.path) === normalized && tabSpace(t) === space);
    if (existing) {
      this.tabs = this.tabs.map(t => t.id === existing.id ? { ...t, sourceType: opts?.sourceType ?? t.sourceType } : t);
      this.activeTabId = existing.id;
      if (!wantPreview && existing.preview) {
        this.tabs = this.tabs.map(t => t.id === existing.id ? { ...t, preview: false } : t);
      }
      this.notify();
      return;
    }

    // Navigation « tab actif » (wikilink du viewer / sidebar maximisée / back &
    // forward) : on re-pointe le tab ACTIF (dédup déjà traitée ci-dessus) — le
    // clic a forcément lieu dans le tab visible, donc le tab actif. C'est le
    // comportement attendu « clic simple = tab actif », indépendant du flag
    // `preview` (qui peut être perdu : restore de session, ré-affectations
    // openInActiveTab). Le flag preview est CONSERVÉ (le tab reste un preview ;
    // l'éditeur lié suit via previewLinkedTabId) et le brouillon éventuel est
    // parké avant ré-affectation (politique A, même mécanique que openInActiveTab).
    // `forceNew` : AUCUNE ré-affectation du tab actif (pickOpenTarget) — on
    // crée toujours un nouvel onglet (cas bouton Preview de l'éditeur, où
    // réutiliser un tab preview NON associé casserait le couplage éditeur↔preview).
    const targetInfo = opts?.forceNew
      ? { id: null as string | null, isFallback: false as boolean }
      : pickOpenTarget(this.tabs, this.activeTabId, wantPreview, opts?.fallbackToActive, space);
    const target = targetInfo.id != null ? this.tabs.find(t => t.id === targetInfo.id) : undefined;
    const title = basename(normalized);
    const id = target?.id ?? crypto.randomUUID();
    if (target) {
      if (
        targetInfo.isFallback &&
        tabContentKind(target.kind) !== "data" &&
        !isPdfPath(target.path) &&
        !isImagePath(target.path) &&
        target.source !== target.savedContent
      ) {
        this.parkContent(target.path, target.source);
      }
      this.tabs = this.tabs.map(t => t.id === id ? { ...t, path: normalized, title, source: "", savedContent: "", preview: true, sourceType: opts?.sourceType, renderMode: recycleRenderMode(t.renderMode) } : t);
    } else {
      // Nouveau tab dans l'espace cible (le champ `space` n'est posé que pour
      // un tab épinglé — absent = libre, comportement legacy préservé).
      this.tabs = [...this.tabs, { id, title, path: normalized, source: "", savedContent: "", preview: wantPreview, sourceType: opts?.sourceType, ...(space === "pinned" ? { space } : {}) }];
    }
    this.activeTabId = id;
    this.cbs.onFileOpen?.(normalized);
    this.notify();

    if (!isPdfPath(normalized) && !isImagePath(normalized)) {
      try {
        const { source: src, saved } = await this.readContent(normalized, { preferDraft: opts?.preferDraft });
        this.tabs = this.tabs.map(t => t.id === id ? { ...t, source: src, savedContent: saved } : t);
      } catch (err) {
        this.tabs = this.tabs.filter(t => t.id !== id);
        if (this.activeTabId === id) {
          this.activeTabId = this.tabs[this.tabs.length - 1]?.id ?? null;
        }
        this.notify();
        if (!opts?.silent) throw err;
        return;
      }
    }

    this.notify();
  }

  /**
   * Ouvre un article de la documentation intégrée dans un tab UNIQUE
   * (`kind: "doc"`) : si un tab doc existe déjà, il est ré-affecté à l'article
   * demandé ; sinon un nouveau tab doc est créé. Lecture seule — jamais de
   * brouillon, jamais ré-affecté par `open`/`openInActiveTab`.
   */
  async openDoc(path: string, opts?: { silent?: boolean }): Promise<void> {
    if (!isOpenablePath(path)) {
      if (!opts?.silent) {
        this.cbs.onError?.("Format", `unsupported format: ${basename(path)}`);
      }
      return;
    }
    const norm = (p: string) => p.split("/").filter(s => s !== ".").join("/");
    const normalized = norm(path);
    const existingSame = this.tabs.find(t => t.kind === "doc" && norm(t.path) === normalized);
    if (existingSame) {
      this.activeTabId = existingSame.id;
      this.notify();
      return;
    }
    const existingDoc = this.tabs.find(t => t.kind === "doc");
    const title = basename(normalized);
    const id = existingDoc?.id ?? crypto.randomUUID();
    if (existingDoc) {
      this.tabs = this.tabs.map(t => t.id === id
        ? { ...t, path: normalized, title, source: "", savedContent: "", preview: true, kind: "doc", renderMode: recycleRenderMode(t.renderMode) }
        : t);
    } else {
      this.tabs = [...this.tabs, { id, title, path: normalized, source: "", savedContent: "", preview: true, kind: "doc" }];
    }
    this.activeTabId = id;
    this.cbs.onFileOpen?.(normalized);
    this.notify();

    try {
      const { source: src, saved } = await this.readContent(normalized);
      this.tabs = this.tabs.map(t => t.id === id ? { ...t, source: src, savedContent: saved } : t);
    } catch (err) {
      this.tabs = this.tabs.filter(t => t.id !== id);
      if (this.activeTabId === id) {
        this.activeTabId = this.tabs[this.tabs.length - 1]?.id ?? null;
      }
      this.notify();
      if (!opts?.silent) throw err;
      return;
    }
    this.notify();
  }

  /**
   * - si un tab du panel affiche déjà `path` → simple activation (dédup) ;
   * - sinon RE-POINTE le tab actif vers `path` : le brouillon non enregistré
   *   du tab est PARKÉ avant le mouvement (mécanique `repoint`), la cible est
   *   lue (avec `preferDraft` éventuel), et le tab perd son flag `preview`.
   * L'ancien onglet reste accessible via back/forward du preview (il vient
   * d'être remplacé dans le tab actif, pas fermé).
   * PDF/images : pas de lecture texte — source vide, viewer dédié.
   * Sans tab actif, se comporte comme `open` (nouveau tab).
   */
  async openInActiveTab(path: string, opts?: { preferDraft?: boolean; silent?: boolean; sourceType?: TabSource; space?: TabSpace }): Promise<void> {
    if (!isOpenablePath(path)) {
      if (!opts?.silent) {
        this.cbs.onError?.("Format", `unsupported format: ${basename(path)}`);
      }
      return;
    }
    const normalized = normPath(path);
    // Espace cible (Phase A) : par défaut libre. Dédup PAR ESPACE — un tab
    // épinglé affichant le fichier n'absorbe pas une ouverture libre (et
    // inversement, R3) : seule la dédup intra-espace est activée.
    const space = opts?.space ?? "free";
    // Dédup : un tab du même ESPACE affiche déjà le fichier → activation simple.
    const existing = this.tabs.find(t => normPath(t.path) === normalized && tabSpace(t) === space);
    if (existing) {
      this.activeTabId = existing.id;
      this.notify();
      return;
    }

    const active = this.activeTab;
    // Le tab doc (aide intégrée) et les tabs d'OUTILS ne sont jamais ré-affectés
    // par une navigation « tab actif » : un clic sidebar pendant la lecture de
    // l'aide ne doit pas détruire le lecteur, et un outil (spreadsheet/calendar)
    // ne peut pas être re-pointé vers un fichier — on crée un onglet dédié.
    // Phase A : le tab actif n'est re-pointé que s'il est du MÊME ESPACE que la
    // cible — un clic sidebar avec un éditeur épinglé crée un tab libre au lieu
    // d'écraser le pinned (isolation des espaces, fondation du routage B).
    const previous = active && tabContentKind(active.kind) === "file" && tabSpace(active) === space ? { ...active } : null;
    const id = previous?.id ?? crypto.randomUUID();

    // Park du brouillon du tab actif AVANT de le ré-affecter (mécanique repoint).
    if (previous && tabContentKind(previous.kind) !== "data" && !isPdfPath(previous.path) && !isImagePath(previous.path) && previous.source !== previous.savedContent) {
      this.parkContent(previous.path, previous.source);
    }

    if (previous) {
      this.tabs = this.tabs.map(t =>
        t.id === id
          ? { ...t, path: normalized, title: basename(normalized), source: "", savedContent: "", preview: false, sourceType: opts?.sourceType, renderMode: recycleRenderMode(t.renderMode) }
          : t,
      );
    } else {
      this.tabs = [...this.tabs, { id, title: basename(normalized), path: normalized, source: "", savedContent: "", preview: false, sourceType: opts?.sourceType, ...(space === "pinned" ? { space } : {}) }];
    }
    this.activeTabId = id;
    this.cbs.onFileOpen?.(normalized);
    this.notify();

    if (!isPdfPath(normalized) && !isImagePath(normalized)) {
      try {
        const { source: src, saved } = await this.readContent(normalized, { preferDraft: opts?.preferDraft });
        this.tabs = this.tabs.map(t => t.id === id ? { ...t, source: src, savedContent: saved } : t);
      } catch (err) {
        // Échec de lecture : restaure l'état précédent du tab (le brouillon
        // parké reste intact — l'utilisateur ne perd rien).
        if (previous) {
          this.tabs = this.tabs.map(t => t.id === id ? previous : t);
        } else {
          this.tabs = this.tabs.filter(t => t.id !== id);
          this.activeTabId = this.tabs[this.tabs.length - 1]?.id ?? null;
        }
        this.notify();
        if (!opts?.silent) throw err;
        return;
      }
    }
    this.notify();
  }

  openCustom(panelId: string, title: string): void {
    const existing = this.tabs.find(t => t.kind === "custom" && t.panelId === panelId);
    if (existing) {
      this.activeTabId = existing.id;
      this.notify();
      return;
    }
    const id = crypto.randomUUID();
    this.tabs = [...this.tabs, { id, title, path: `custom://${panelId}`, source: "", savedContent: "", kind: "custom", panelId }];
    this.activeTabId = id;
    this.notify();
  }

  openSpreadsheet(spreadsheetId: string, title: string): void {
    const existing = this.tabs.find(t => t.kind === "spreadsheet" && t.spreadsheetId === spreadsheetId);
    if (existing) {
      this.activeTabId = existing.id;
      this.notify();
      return;
    }
    const id = crypto.randomUUID();
    this.tabs = [...this.tabs, {
      id, title,
      path: `spreadsheet://${spreadsheetId}`,
      source: "", savedContent: "",
      kind: "spreadsheet",
      spreadsheetId,
    }];
    this.activeTabId = id;
    this.notify();
  }

  /**
   * Open a spreadsheet tab without a spreadsheetId (create mode).
   * The tab will show the create/import UI until upgraded with a real ID. */
  openEmptySpreadsheet(title: string): void {
    // Reuse existing "create" tab if one exists
    const existing = this.tabs.find(t => t.kind === "spreadsheet" && !t.spreadsheetId);
    if (existing) {
      this.activeTabId = existing.id;
      this.notify();
      return;
    }
    const id = crypto.randomUUID();
    this.tabs = [...this.tabs, {
      id, title,
      path: "spreadsheet://new",
      source: "", savedContent: "",
      kind: "spreadsheet",
      // no spreadsheetId — SpreadsheetViewer shows the create UI
    }];
    this.activeTabId = id;
    this.notify();
  }

  /** Upgrade a "create" tab (no spreadsheetId) with a real ID. */
  upgradeSpreadsheetTab(id: string, title: string): void {
    const idx = this.tabs.findIndex(t => t.kind === "spreadsheet" && !t.spreadsheetId);
    if (idx === -1) return;
    const tab = this.tabs[idx];
    this.tabs = this.tabs.map(t =>
      t.id === tab.id ? { ...t, spreadsheetId: id, title } : t
    );
    this.notify();
  }

  /** Open (or activate) a DataFilter tab holding a stack of grids at once.
   *  The stack identity is the sorted set of grid ids. */
  openDataFilter(datafilterIds: string[], title: string): void {
    const key = (ids: string[]) => [...ids].sort().join("\u0000");
    const target = key(datafilterIds);
    const existing = this.tabs.find(t => t.kind === "datafilter" && t.datafilterIds && key(t.datafilterIds) === target);
    if (existing) {
      this.activeTabId = existing.id;
      this.notify();
      return;
    }
    const id = crypto.randomUUID();
    this.tabs = [...this.tabs, {
      id, title,
      path: "datafilter://stack",
      source: "", savedContent: "",
      kind: "datafilter",
      datafilterIds: [...datafilterIds],
    }];
    this.activeTabId = id;
    this.notify();
  }

  close(tabId: string): void {
    const idx = this.tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;
    const tab = this.tabs[idx];
    if (tabContentKind(tab.kind) !== "data" && !isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
      this.parkContent(tab.path, tab.source);
    }
    this.tabs = this.tabs.filter(t => t.id !== tabId);
    if (this.activeTabId === tabId) {
      const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activeTabId = next?.id ?? null;
    }
    // Case 3 (matrice) : purge des états par tab APRÈS le retrait — l'app
    // écoute onTabClosed pour purger mode nav + pile d'historique.
    this.cbs.onTabClosed?.(tabId, tab);
    this.notify();
  }

  select(tabId: string): void {
    this.activeTabId = tabId;
    this.notify();
  }

  /**
   * Épingle / dé-épingle un tab (Phase A — R1, rounds 3-5) :
   * - ÉTAT UTILISATEUR RUNTIME : au plus un tab épinglé par FORMAT dans ce
   *   panel ; épingler un tab dé-épingle automatiquement l'autre tab épinglé
   *   du même format (COMMUTATION) ;
   * - NON PERSISTÉ : `toJSON` n'écrit jamais `space`, `fromJSON` restaure
   *   tout libre (R9 — boot sans rien d'épinglé, l'utilisateur ré-épingle) ;
   * - un tab épinglé n'est JAMAIS ré-affecté par une ouverture d'un autre
   *   espace (dédup par espace dans open/openInActiveTab/pickOpenTarget).
   * No-op si le tab n'est pas épinglable (canPinTab : outil, aide, PDF/image).
   */
  setPinned(tabId: string, pinned: boolean): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || !canPinTab(tab)) return;
    const format = tabPinFormat(tab.path)!;
    const isPinned = tabSpace(tab) === "pinned";
    if (pinned === isPinned) return;
    this.tabs = this.tabs.map(t => {
      if (t.id === tabId) {
        return { ...t, space: pinned ? "pinned" : "free" };
      }
      // Commutation : dé-épingler l'autre tab épinglé du même format.
      if (pinned && tabSpace(t) === "pinned" && tabPinFormat(t.path) === format) {
        return { ...t, space: "free" };
      }
      return t;
    });
    this.notify();
  }

  /** Le tab épinglé du `format` (md, tex, …) dans ce panel, ou undefined. */
  pinnedTab(format: string): Tab | undefined {
    return this.tabs.find(t => tabSpace(t) === "pinned" && tabPinFormat(t.path) === format);
  }

  reorder(from: number, to: number): void {
    const next = [...this.tabs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.tabs = next;
    this.notify();
  }

  setSource(next: string): void {
    const tab = this.activeTab;
    if (!tab) return;
    this.tabs = this.tabs.map(t => t.id === tab.id ? { ...t, source: next } : t);
  }

  setTabSource(tabId: string, next: string): void {
    this.tabs = this.tabs.map(t => t.id === tabId ? { ...t, source: next } : t);
  }

  /** Reflet `savedContent` d'un tab (sync après un persist hors save()). */
  setSavedContent(tabId: string, saved: string): void {
    this.tabs = this.tabs.map(t => t.id === tabId ? { ...t, savedContent: saved } : t);
  }

  /**
   * Re-point an EXISTING tab to another file (preview-follow navigation).
   * Policy A (drafts): if the tab carries unsaved edits (source ≠ savedContent)
   * they are PARKED in the drafts store BEFORE moving away — same mechanism as
   * close()/hot-exit, so nothing is lost and the edits come back when the
   * preview navigates back to this file (preferDraft restores them).
   * The target is then read; with preferDraft a parked draft of the target
   * wins over the disk state. The tab is cleared of its `preview` flag so it
   * is never a reuse target for the jumpToLine preview-tab pool.
   * On read failure the tab is left UNCHANGED and `ok` is false (the caller
   * decides — never a half-repointed tab).
   */
  async repoint(
    tabId: string,
    path: string,
    opts?: { preferDraft?: boolean; silent?: boolean },
  ): Promise<{ ok: boolean; parked: boolean }> {
    const idx = this.tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return { ok: false, parked: false };
    const tab = this.tabs[idx];
    const norm = (p: string) => p.split("/").filter(s => s !== ".").join("/");
    const normalized = norm(path);
    if (!isOpenablePath(normalized)) return { ok: false, parked: false };
    if (norm(tab.path) === normalized) return { ok: true, parked: false };

    // Policy A: park unsaved edits BEFORE re-pointing away.
    let parked = false;
    if (tabContentKind(tab.kind) !== "data" && !isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
      this.parkContent(tab.path, tab.source);
      parked = true;
    }

    if (!isPdfPath(normalized) && !isImagePath(normalized)) {
      try {
        const { source: src, saved } = await this.readContent(normalized, { preferDraft: opts?.preferDraft });
        this.tabs = this.tabs.map(t =>
          t.id === tabId
            ? {
                ...t,
                path: normalized,
                title: basename(normalized),
                source: src,
                savedContent: saved,
                preview: false,
                renderMode: recycleRenderMode(t.renderMode),
              }
            : t
        );
        this.cbs.onFileOpen?.(normalized);
        this.notify();
        return { ok: true, parked };
      } catch (err) {
        if (!opts?.silent) console.error(`panel ${this.id}: repoint failed`, err);
        return { ok: false, parked };
      }
    }
    // PDF/images : pas de contenu texte — re-point immédiat (viewer dédié).
    this.tabs = this.tabs.map(t =>
      t.id === tabId
        ? { ...t, path: normalized, title: basename(normalized), source: "", savedContent: "", preview: false, renderMode: recycleRenderMode(t.renderMode) }
        : t
    );
    this.cbs.onFileOpen?.(normalized);
    this.notify();
    return { ok: true, parked };
  }

  setRenderMode(tabId: string, mode: RenderMode): void {
    this.tabs = this.tabs.map(t => t.id === tabId ? { ...t, renderMode: mode } : t);
  }

  async save(): Promise<void> {
    const tab = this.activeTab;
    if (!tab || tabContentKind(tab.kind) === "data" || tab.source === tab.savedContent) return;
    try {
      if (this.content) {
        // L'écrivain unique : le contenu vit dans le store — persist écrit
        // buffer ?? draft ?? saved, clearDraft, et le reflet suit le store.
        await this.content.persist(tab.path);
        const saved = this.content.getSaved(tab.path);
        this.tabs = this.tabs.map(t => t.id === tab.id ? { ...t, savedContent: saved } : t);
      } else {
        await writeText(tab.path, tab.source);
        this.tabs = this.tabs.map(t => t.id === tab.id ? { ...t, savedContent: tab.source } : t);
        clearDraft(tab.path);
      }
      this.notify();
    } catch (err) {
      console.error(`panel ${this.id}: save failed`, err);
      throw err;
    }
  }

  saveDrafts(): void {
    for (const tab of this.tabs) {
      if (tabContentKind(tab.kind) !== "data" && !isPdfPath(tab.path) && !isImagePath(tab.path) && tab.source !== tab.savedContent) {
        this.parkContent(tab.path, tab.source);
      }
    }
  }

  setTabTitle(tabId: string, title: string): void {
    this.tabs = this.tabs.map(t => t.id === tabId ? { ...t, title } : t);
    this.notify();
  }

  toJSON(): PanelSessionData {
    return {
      tabs: this.tabs.map(t => ({
        path: t.path,
        title: t.title,
        renderMode: t.renderMode,
        sourceType: t.sourceType,
        kind: t.kind,
        panelId: t.panelId,
        spreadsheetId: t.spreadsheetId,
        datafilterIds: t.datafilterIds ? [...t.datafilterIds] : undefined,
      })),
      activePath: this.activePath,
    };
  }

  fromJSON(data: PanelSessionData): void {
    // Le filtre `kind !== "custom"` est un comportement DOCUMENTÉ (phase 4,
    // idée G) : les panneaux custom (calendrier, éditeur calendar, journal)
    // ne sont PAS restaurés en session — l'outil s'ouvre depuis le journal à
    // la demande. Ne pas « corriger » par accident : c'est volontaire.
    this.tabs = data.tabs
      .filter(t => t.kind !== "custom")
      .map(t => {
        // Reconstruct spreadsheetId from path if not stored directly
        let spreadsheetId = t.spreadsheetId;
        if (!spreadsheetId && t.path.startsWith("spreadsheet://")) {
          spreadsheetId = t.path.slice("spreadsheet://".length);
        }
        // Normalisation EXHAUSTIVE du kind (check `never` de
        // `normalizeLegacyKind`) — la migration legacy « datagrid →
        // datafilter » (vue unique devenue pile d'une carte) vit ici.
        const kind = normalizeLegacyKind((t as { kind?: LegacyTabKind }).kind);
        let datafilterIds = t.datafilterIds ? [...t.datafilterIds] : undefined;
        if (!datafilterIds && (t as { datagridIds?: string[] }).datagridIds) {
          datafilterIds = [...(t as { datagridIds?: string[] }).datagridIds!];
        }
        if (!datafilterIds && t.path.startsWith("datagrid://")) {
          const legacyId = t.path.slice("datagrid://".length);
          if (legacyId && legacyId !== "stack") datafilterIds = [legacyId];
        }
        return {
          id: crypto.randomUUID(),
          path: t.path,
          title: t.title,
          source: "",
          savedContent: "",
          renderMode: t.renderMode,
          sourceType: t.sourceType,
          kind,
          spreadsheetId,
          datafilterIds,
        } as Tab;
      });
    if (data.activePath) {
      const tab = this.tabs.find(t => t.path === data.activePath);
      this.activeTabId = tab?.id ?? this.tabs[0]?.id ?? null;
    }
  }

  async restoreContent(preferDraft?: boolean): Promise<void> {
    const toRemove: string[] = [];
    for (const tab of this.tabs) {
      // Les tabs d'OUTILS (kind data) n'ont PAS de contenu fichier — leur état
      // vit dans SQLite/les stores, chargé live au rendu. Ne jamais les lire
      // depuis le disque (invariant documenté, phase 4 idée G).
      if (tabContentKind(tab.kind) === "data") continue;
      try {
        const { source: src, saved } = await this.readContent(tab.path, { preferDraft });
        this.tabs = this.tabs.map(t => t.id === tab.id ? { ...t, source: src, savedContent: saved } : t);
      } catch {
        toRemove.push(tab.id);
      }
    }
    if (toRemove.length > 0) {
      this.tabs = this.tabs.filter(t => !toRemove.includes(t.id));
      if (this.activeTabId && toRemove.includes(this.activeTabId)) {
        this.activeTabId = this.tabs[0]?.id ?? null;
      }
    }
  }
}
