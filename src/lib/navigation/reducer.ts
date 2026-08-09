/**
 * Reducer de navigation (phase 1, idée A) — le canal « navigate » du rapport
 * architecture-review.
 *
 * Les sagas ci-dessous sont PURES : elles ne touchent ni à Svelte, ni aux
 * stores runes, ni au monde Tauri/LSP. Toutes leurs dépendances passent par
 * l'interface `NavDeps` injectée par l'hôte (app.svelte fournit les
 * implémentations réelles ; les tests fournissent des fakes). La règle 9 du
 * rapport : ce reducer est le SEUL endroit qui modifie la session de
 * navigation (tabs, panneaux, lien preview↔éditeur, historique back/forward,
 * cibles de rendu scroll/syncLine).
 *
 * Les modules réutilisables déjà PURS sont importés directement :
 *   - `@/lib/files` (prédicats de chemin) — testé sous bun ;
 *   - `@/lib/index-home` (findLinkedIndexMd, DI readText) — testé ;
 *   - `@/lib/preview-follow` (followPreviewNavigation) — testé ;
 *   - `@/lib/help-install` (isHelpPath, helpIndexPath — fonctions pures) ;
 *   - `@/lib/panel-store` (PanelState.open exerce la garde `kind !== "doc"`
 *     de pickOpenTarget en bout de chaîne).
 */

import type { PanelManager } from "@/lib/panel-manager";
import { findLinkedIndexMd } from "@/lib/index-home";
import { followPreviewNavigation } from "@/lib/preview-follow";
import { isOpenablePath, isImagePath, isPdfPath, isMarkdownPath } from "@/lib/files";
import { isHelpPath, helpIndexPath } from "@/lib/help-install";
import { basename } from "@/lib/paths-utils";
import type { NavIntent, OpenInTabOptions } from "./intents";

/** Fonctions impures injectées par l'hôte (app.svelte) ou des fakes (tests). */
export interface NavDeps {
  /** PanelManager de session (MAIN + SIDE). */
  pm: PanelManager;
  // ── état session lu (getters) ──
  rootPath: () => string | null;
  /** Chemin du tab éditeur main actif. */
  activePath: () => string | null;
  /** Chemin du tab side actif (rendu : preview/colle/presentation/doc). */
  sideActivePath: () => string | null;
  /** Panneau en plein écran, `null` si split. */
  expandedPanel: () => "main" | "side" | null;
  /** Mode navigation du tab preview side ACTIF (bouton « mode nav »). Hors
   *  mode nav, un clic wikilink ouvre un onglet éditeur ; en mode nav, il
   *  navigue IN-PLACE dans le preview (l'éditeur lié ne suit plus). */
  isPreviewNavMode: () => boolean;
  /** Sort de la maximisation du side (retour au ratio sauvegardé) + sync de
   *  la rune splitRatio de l'app. */
  unexpandSide: () => void;
  // ── actions stores (historique preview + cibles de rendu) ──
  navPush: (path: string) => void;
  navBack: () => string | null;
  navForwardStep: (path: string) => string | null;
  navPushForward: (path: string) => void;
  setScrollTarget: (heading: string) => void;
  setSyncLine: (line: number, path?: string) => void;
  /** Setter de la rune `jumpToLine` (0-based) de l'éditeur main. */
  setJumpToLine: (line: number) => void;
  /** `setEditorModeUtil(editorModeCtx, "raw")` + bump panel version. */
  setEditorModeRaw: () => void;
  /** Affiche le side panel (double-set rune app + pm.sideVisible). */
  setSideVisible: (v: boolean) => void;
  // ── notifications / i18n ──
  notifyError: (title: string, message: string) => void;
  notifyInfo: (message: string) => void;
  /** Signature du type `Translate` de l'app (locale key + params string/number). */
  t: (key: string, params?: Record<string, string | number>) => string;
  // ── helpers métier (monde réel : Tauri / LSP / FS) ──
  /** Lit un fichier texte (implémentation réelle : plugin-fs). */
  readText: (path: string) => Promise<string>;
  /** `trackMtime` (synchronisation du watcher FS). */
  trackMtime: (path: string) => Promise<void>;
  /** `jumpToLineUtil(editorModeCtx, line, path, sessionId)` — saut curseur
   *  éditeur. `sessionId` (phase 3 C) = id du tab side émetteur, résolu via
   *  la table de liens preview↔éditeur par l'util. */
  jumpToLine: (line: number, path?: string | null, sessionId?: string | null) => void;
  /** Ouvre/active un tab doc (DocPreview) — le store lit le disque. */
  openDocArticle: (path: string, heading?: string) => Promise<void>;
  /** Crée (si absent) puis retourne la daily note pour `date`. */
  ensureDailyNote: (date: string) => Promise<string | null>;
  /** Re-scan du journal (pour refléter une daily note créée). */
  journalScan: () => Promise<void>;
}

/** Normalisation de chemin partagée (antislash → `/`, drop `.` segments). */
export function normNavPath(p: string): string {
  return p.replace(/\\/g, "/").split("/").filter((s) => s !== ".").join("/");
}

/** Pile d'historique preview : enregistre la page courante avant un saut. */
function pushCurrentIfAny(deps: NavDeps): void {
  const cur = deps.sideActivePath();
  if (cur) deps.navPush(cur);
}

/** `openFileInTab` — routage image/pdf → side, texte → main. */
async function openFile(deps: NavDeps, path: string, opts?: OpenInTabOptions): Promise<void> {
  if (!isOpenablePath(path)) {
    if (!opts?.silent) {
      deps.notifyError("Format", deps.t("app.unsupportedFormat", { name: basename(path) }));
    }
    return;
  }
  if (isImagePath(path) || isPdfPath(path)) {
    await deps.pm.openInSide(path, opts);
    deps.setSideVisible(true);
  } else {
    await deps.pm.openInMain(path, opts);
  }
  void deps.trackMtime(path);
}

/** Clic sidebar — tab ACTIF du bon panel. Règle « click = alt-click » pour
 *  les non-textes (image/pdf → side, dédup — un tab affichant déjà le fichier
 *  est activé, jamais de ré-affectation du tab actif). Les textes vont en
 *  main. PLUS de routage maximisé in-place : si le viewer md est maximisé, on
 *  CONSERVE la maximisation et on ouvre un NOUVEL onglet viewer (sans tab
 *  éditeur associé — le couplage éditeur↔preview ne s'applique qu'aux tabs
 *  preview LIÉS). */
async function openActive(deps: NavDeps, path: string, newTab: boolean): Promise<void> {
  if (!isOpenablePath(path)) {
    deps.notifyError("Format", deps.t("app.unsupportedFormat", { name: basename(path) }));
    return;
  }
  if (isImagePath(path) || isPdfPath(path)) {
    await deps.pm.openInSide(path);
    deps.setSideVisible(true);
    void deps.trackMtime(path);
    return;
  }
  if (newTab) {
    await deps.pm.openInMain(path);
    void deps.trackMtime(path);
    return;
  }
  if (deps.expandedPanel() === "side" && isMarkdownPath(path)) {
    pushCurrentIfAny(deps);
    await deps.pm.openInSide(path, { preview: true, fallbackToActive: true });
    void deps.trackMtime(path);
    return;
  }
  await deps.pm.openInMainActiveTab(path);
  void deps.trackMtime(path);
}

/** Navigation wikilink. Hors mode nav : ouvre un NOUVEL ONGLET ÉDITEUR
 *  (dédup si déjà ouvert — `openFile`), le preview ne navigue pas (il est le
 *  miroir de l'éditeur lié). En mode nav (bouton) : navigation IN-PLACE dans
 *  le preview, l'éditeur lié NE suit PLUS (ni link, ni follow). `newTab`
 *  (intent wikilink-open-new) n'est plus émis par les liens de preview —
 *  conservé pour Home alt + autres émetteurs. */
async function wikilinkNavigate(deps: NavDeps, path: string, heading: string | null | undefined, newTab: boolean): Promise<void> {
  if (newTab) {
    await openFile(deps, path, { silent: true });
    if (heading) deps.setScrollTarget(heading);
    void deps.trackMtime(path);
    return;
  }
  if (!deps.isPreviewNavMode()) {
    // Hors mode nav : la cible va à l'ÉDITEUR (main), jamais au preview.
    await openFile(deps, path, { silent: true });
    if (heading) deps.setScrollTarget(heading);
    void deps.trackMtime(path);
    return;
  }
  // Mode nav : in-place dans le preview, l'éditeur lié ne suit pas.
  const cur = deps.sideActivePath();
  if (cur) deps.navPush(cur);
  await deps.pm.openInSide(path, { preview: true, fallbackToActive: true });
  if (heading) deps.setScrollTarget(heading);
  void deps.trackMtime(path);
}

/** Saut TOC/backlinks/tags — ouvre dans le tab éditeur actif (routage max
 *  vers la preview si fullscreen), applique line (1-based → 0-based) et/ou
 *  heading. */
async function jumpToFile(deps: NavDeps, path: string, line: number | null | undefined, heading: string | null | undefined): Promise<void> {
  const rp = deps.rootPath();
  if (isHelpPath(path, rp)) {
    await deps.openDocArticle(path, heading ?? undefined);
    return;
  }
  pushCurrentIfAny(deps);
  const normFile = normNavPath(path);
  const found = deps.pm.findTabByPath(normFile);
  if (found && found.panel === "main") {
    deps.pm.main.select(found.tab.id);
  } else {
    await deps.pm.openInMain(normFile, { silent: true, preview: true });
  }
  if (line != null || heading != null) {
    const line0 = line != null ? line - 1 : undefined;
    if (line0 != null) {
      deps.setJumpToLine(line0);
      deps.setEditorModeRaw();
    }
    if (heading != null) {
      deps.setScrollTarget(heading);
    } else if (line0 != null) {
      deps.setSyncLine(line0, normFile);
    }
  }
}

/** Bouton « Ouvrir dans l'éditeur » du tab side (matrice) : le fichier RENDU
 *  par le tab preview s'ouvre dans l'éditeur main, dédup (jamais de doublon).
 *  Si le side est maximisé : bascule d'abord en 2 panneaux (le dbl-clic viewer
 *  partage exactement cette logique via `jumpToLine` + `unexpandSide`). */
async function previewOpenEditor(deps: NavDeps, path: string): Promise<void> {
  const normFile = normNavPath(path);
  if (deps.expandedPanel() === "side") deps.unexpandSide();
  const found = deps.pm.findTabByPath(normFile);
  if (found && found.panel === "main") {
    deps.pm.main.select(found.tab.id);
  } else {
    await deps.pm.openInMain(normFile, { silent: true });
  }
  void deps.trackMtime(normFile);
}

/** Saut dbl-clic preview — 0-based, cible le fichier RENDU. Si le side est
 *  maximisé : bascule d'abord en 2 panneaux (unexpand), puis saut vers
 *  l'éditeur (le tab éditeur est ouvert si non disponible — jumpToLineUtil). */
async function jumpToLine(deps: NavDeps, line: number, path: string | null | undefined, sessionId?: string | null): Promise<void> {
  if (deps.expandedPanel() === "side") deps.unexpandSide();
  deps.jumpToLine(line, path ?? undefined, sessionId ?? undefined);
}

/** Bouton Home du preview — index.md lié, in-place ou nouvel onglet. */
async function previewHome(deps: NavDeps, newTab: boolean): Promise<void> {
  const rp = deps.rootPath();
  const cur = deps.pm.side.activePath ?? deps.activePath();
  if (!rp || !cur) return;
  const target = await findLinkedIndexMd({ rootPath: rp, currentFilePath: cur, readText: deps.readText });
  if (!target) return;
  await wikilinkNavigate(deps, target, null, newTab);
}

/** Historique preview : back / forward (le tab preview navigue, l'éditeur
 *  lié suit ; les brouillons non sauvegardés sont parqués — politique A). */
async function navHistory(deps: NavDeps, direction: "back" | "forward"): Promise<void> {
  const cur = deps.sideActivePath();
  if (!cur) return;
  const next = direction === "back" ? deps.navBack() : deps.navForwardStep(cur);
  if (!next) return;
  if (direction === "back") deps.navPushForward(cur);
  deps.setSideVisible(true);
  await deps.pm.openInSide(next, { preview: true, fallbackToActive: true });
  const r = await followPreviewNavigation(deps.pm, next);
  if (r.parked) deps.notifyInfo(deps.t("preview.draftParked"));
}

/** Navigation doc intégrée (jamais l'éditeur main). */
async function docNavigate(deps: NavDeps, path: string, heading?: string): Promise<void> {
  await deps.openDocArticle(path, heading);
}

/** Ouvre la racine de la doc intégrée dans un tab doc (side). */
async function openHelp(deps: NavDeps): Promise<void> {
  const rp = deps.rootPath();
  if (!rp) return;
  const index = helpIndexPath(rp);
  const existing = deps.pm.side.tabs.find((t) => t.kind === "doc" && t.path === index);
  if (existing) {
    deps.pm.side.select(existing.id);
  } else {
    await deps.openDocArticle(index);
  }
}

/** Navigation PDF rect — ouvre le PDF en side. La cible de scroll
 *  (page/rect) reste un événement de RENDU (`azprose:pdf-scroll-to-rect`),
 *  émis par le handler APRÈS l'intention — le store scroll-target est
 *  réservé aux headings du rendu preview. */
async function pdfRectNavigate(deps: NavDeps, path: string): Promise<void> {
  await deps.pm.openInSide(path, { silent: true });
  deps.setSideVisible(true);
  void deps.trackMtime(path);
}

/** Clic date du journal — crée/ouvre la daily note puis re-scanne. */
async function journalDateClick(deps: NavDeps, date: string): Promise<void> {
  const rp = deps.rootPath();
  if (!rp) return;
  pushCurrentIfAny(deps);
  const p = await deps.ensureDailyNote(date);
  if (p) await openFile(deps, p, {});
  await deps.journalScan();
}

/** Saut daily-note venant du LSP oxide — ouvre le fichier (silencieux). */
async function oxideShowDocument(deps: NavDeps, path: string): Promise<void> {
  await openFile(deps, path, { silent: true });
}

/** Ouvre un tableur en side — dédup par spreadsheetId (PanelManager). Jamais
 *  de ré-affectation d'un tab doc : la dédup cherche uniquement les tabs
 *  `kind === "spreadsheet"` du même id, un tab doc ne peut pas être ciblé. */
function openSpreadsheet(deps: NavDeps, spreadsheetId: string, title: string): void {
  deps.pm.openSpreadsheetInSide(spreadsheetId, title);
}

/** Ouvre une pile DataFilter en side — dédup par ensemble trié des ids. */
function openDataFilter(deps: NavDeps, datafilterIds: string[], title: string): void {
  deps.pm.openDataFilterInSide(datafilterIds, title);
}

/** Ouvre un panneau custom en side (calendrier, …) — dédup par panelId. */
function openCustom(deps: NavDeps, panelId: string, title: string): void {
  deps.pm.openCustomInSide(panelId, title);
}

/** Transition create→upgrade : le tab tableur « create » (sans id) reçoit
 *  spreadsheetId + titre. No-op s'il n'y a pas de tab create. */
function setSpreadsheetId(deps: NavDeps, spreadsheetId: string, title: string): void {
  deps.pm.setSpreadsheetTabId(spreadsheetId, title);
}

/** Met à jour le titre d'un tab tableur (no-op si inchangé — évite la cascade
 *  notify → re-render du viewer à chaque load). */
function setSpreadsheetTitle(deps: NavDeps, spreadsheetId: string, title: string): void {
  deps.pm.setSpreadsheetTabTitle(spreadsheetId, title);
}

/**
 * Point d'entrée unique du reducer. Applique une intention de navigation sur
 * la session. Toute navigation applicative passe par ici (règle 9).
 */
export async function reduceNavIntent(deps: NavDeps, intent: NavIntent): Promise<void> {
  switch (intent.type) {
    case "open-file":
      return openFile(deps, intent.path, intent.opts);
    case "open-active":
      return openActive(deps, intent.path, intent.newTab ?? false);
    case "wikilink-navigate":
      return wikilinkNavigate(deps, intent.path, intent.heading ?? null, false);
    case "wikilink-open-new":
      return wikilinkNavigate(deps, intent.path, intent.heading ?? null, true);
    case "jump-to-file":
      return jumpToFile(deps, intent.path, intent.line ?? null, intent.heading ?? null);
    case "jump-to-line":
      return jumpToLine(deps, intent.line, intent.path ?? null, intent.sessionId ?? null);
    case "preview-open-editor":
      return previewOpenEditor(deps, intent.path);
    case "preview-home":
      return previewHome(deps, intent.newTab ?? false);
    case "preview-back":
      return navHistory(deps, "back");
    case "preview-forward":
      return navHistory(deps, "forward");
    case "doc-navigate":
      return docNavigate(deps, intent.path, intent.heading);
    case "open-help":
      return openHelp(deps);
    case "pdf-rect-navigate":
      return pdfRectNavigate(deps, intent.path);
    case "journal-date-click":
      return journalDateClick(deps, intent.date);
    case "oxide-show-document":
      return oxideShowDocument(deps, intent.path);
    case "open-spreadsheet":
      return openSpreadsheet(deps, intent.spreadsheetId, intent.title);
    case "open-datafilter":
      return openDataFilter(deps, intent.datafilterIds, intent.title);
    case "open-custom":
      return openCustom(deps, intent.panelId, intent.title);
    case "set-spreadsheet-id":
      return setSpreadsheetId(deps, intent.spreadsheetId, intent.title);
    case "set-spreadsheet-title":
      return setSpreadsheetTitle(deps, intent.spreadsheetId, intent.title);
    default: {
      // Exhaustivité de l'alphabet (phase 4, idée G) : tout nouveau type de
      // `NavIntent` ajouté à l'union SANS case ici devient une erreur de
      // compilation — jamais un événement ignoré silencieusement.
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}
