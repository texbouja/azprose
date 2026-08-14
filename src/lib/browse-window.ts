/**
 * Fenêtre fille « browser » (Phase F — D2/R5 des rounds « pinned tabs »).
 *
 * Le mode navigation d'un viewer est REMPLACÉ par une vraie fenêtre : la
 * lecture en chaîne (wikilink après wikilink, back/forward) sort des panneaux.
 * Le tab de lancement reste actif tel quel — plus de changement d'identité de
 * tab, plus de doublon transitoire, plus de conflit de règles.
 *
 * Conventions (R5, round 5 ; révisé 2026-08-14 — retrait de `parent`) :
 * - taille = celle du lancement de l'app : JAMAIS maximisée, dépendante de
 *   l'écran, même si la fenêtre de projet l'est ;
 * - si la fenêtre de LANCEMENT est en plein écran (viewer en fullscreen), la
 *   fenêtre fille l'est aussi ;
 * - la fenêtre NAV se ferme avec sa fenêtre de projet — cascade EXPLICITE
 *   (`closeBrowseChildren`, appelée par `close-handler.ts` avant destruction
 *   de la fenêtre de projet), indépendante de toute relation Tauri `parent` ;
 * - fenêtre AUTONOME (2026-08-14) : PAS de relation `parent` Tauri. Un
 *   `parent` fait de NAV une « owned window » (Windows) / `transient_for`
 *   (Linux) — l'OS la maintient alors TOUJOURS au-dessus de son propriétaire
 *   (empilement figé, indépendant du clic) et certains WM lui refusent une
 *   minimisation ou un focus indépendants. NAV doit se comporter comme
 *   n'importe quelle fenêtre : clic = focus + premier plan, minimisable,
 *   entrée de taskbar propre — seule la fermeture reste liée au parent,
 *   via la cascade explicite ci-dessus.
 */
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { WebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { emitTo } from "@tauri-apps/api/event";
import { basename } from "@/lib";
import { windowTitle } from "@/lib/window-title";

/** Préfixe de label d'une fenêtre fille ; le label du PARENT y est encodé
 *  (séparateur `__`) pour retrouver la descendance d'une fenêtre de projet. */
const BROWSE_PREFIX = "azprose-browse";

export function browseWindowLabel(parentLabel: string, seed: number): string {
  return `${BROWSE_PREFIX}__${parentLabel}__${seed}`;
}

/** Le label désigne-t-il une fenêtre fille de `parentLabel` ? */
export function isBrowseChildOf(label: string, parentLabel: string): boolean {
  return label.startsWith(`${BROWSE_PREFIX}__${parentLabel}__`);
}

/** Extrait le label de la fenêtre PARENTE depuis le label d'une fenêtre
 *  fille (chantier fenêtre NAV, phase 4 — R10 : « ouvrir dans l'éditeur »
 *  cible la fenêtre de projet qui a lancé CETTE fenêtre NAV, via
 *  `emitTo(parentLabelOf(label), …)`). `null` si `label` n'est pas une
 *  fenêtre fille. Le SEED (dernier segment) est retiré via le DERNIER `__` —
 *  robuste même si `parentLabel` contenait lui-même `__`. */
export function parentLabelOf(label: string): string | null {
  const prefix = `${BROWSE_PREFIX}__`;
  if (!label.startsWith(prefix)) return null;
  const rest = label.slice(prefix.length);
  const idx = rest.lastIndexOf("__");
  return idx === -1 ? null : rest.slice(0, idx);
}

/** Compteur de fenêtres filles de CETTE fenêtre — un label Tauri doit être
 *  unique et deux ouvertures peuvent tomber dans la même milliseconde. */
let browseSeq = 0;

/**
 * Taille de la fenêtre fille : proportionnelle à l'écran courant, bornée par
 * la taille de lancement de l'app (1240×820, tauri.conf.json) — jamais
 * maximisée. Repli sur ces valeurs si le moniteur est inconnu.
 */
export function browseWindowSize(
  monitor: { size: { width: number; height: number }; scaleFactor: number } | null,
): { width: number; height: number } {
  const MAX_W = 1240;
  const MAX_H = 820;
  if (!monitor || !monitor.scaleFactor) return { width: MAX_W, height: MAX_H };
  const logicalW = monitor.size.width / monitor.scaleFactor;
  const logicalH = monitor.size.height / monitor.scaleFactor;
  return {
    width: Math.max(640, Math.round(Math.min(MAX_W, logicalW * 0.8))),
    height: Math.max(480, Math.round(Math.min(MAX_H, logicalH * 0.85))),
  };
}

export interface BrowseWindowOptions {
  /** Fichier de départ de la navigation. */
  path: string;
  /** Racine du projet (résolution des wikilinks, index du vault). */
  root: string | null;
}

/** Ouvre une fenêtre fille de navigation sur `path`. */
export async function openBrowseWindow(opts: BrowseWindowOptions): Promise<WebviewWindow> {
  const launcher = getCurrentWindow();
  const [monitor, fullscreen, decorated] = await Promise.all([
    currentMonitor().catch(() => null),
    launcher.isFullscreen().catch(() => false),
    // État de FENÊTRE (vague 4, phase 4.2) : la fenêtre native de LANCEMENT
    // est la source de vérité, aucun stockage — on l'interroge directement
    // au lieu de lire un réglage. Repli `true` (décorations WM) si l'appel
    // échoue : c'est aussi l'état de démarrage par défaut de toute fenêtre.
    launcher.isDecorated().catch(() => true),
  ]);
  const { width, height } = browseWindowSize(monitor);
  const params = new URLSearchParams({ browse: opts.path });
  if (opts.root) params.set("root", opts.root);
  // Transporté en paramètre d'URL (comme `root`/`browse`) plutôt que lu par
  // NAV via isDecorated() à son propre montage : cette lecture est ASYNCHRONE
  // (IPC Tauri) et la fenêtre a déjà l'ANIMATION long JS à charger — l'écart,
  // même bref, reproduirait le flash que la pose à la création évite déjà ici.
  params.set("decorated", decorated ? "1" : "0");
  return new WebviewWindow(browseWindowLabel(launcher.label, ++browseSeq), {
    url: `nav.html?${params.toString()}`,
    title: windowTitle(basename(opts.path)),
    width,
    height,
    center: true,
    // Décorations posées à la CRÉATION, pas dans un $effect au montage
    // (correction 2026-08-14) : une fenêtre créée décorée puis re-décorée à
    // chaud montre un flash « chrome WM → chrome app » au démarrage. NAV est
    // créée depuis le JS de PROJET, qui connaît déjà le réglage — il n'y a
    // aucune raison d'attendre son propre bundle. (La fenêtre PROJET, elle,
    // est créée par Rust avant tout JS : son flash relève de la séquence de
    // boot, traité en vague 4 du plan.)
    decorations: decorated,
    // PAS de `parent` (2026-08-14) : NAV est une fenêtre AUTONOME — clic =
    // focus + premier plan comme n'importe quelle fenêtre, minimisation et
    // taskbar indépendantes. Sa fermeture avec la fenêtre de projet reste
    // garantie par la cascade explicite de close-handler.ts (voir le
    // commentaire de tête de ce fichier).
    // R5 : le plein écran du viewer de lancement se propage ; sinon fenêtre
    // normale — jamais maximisée, même si la fenêtre de projet l'est.
    fullscreen,
  });
}

/** Fenêtre(s) NAV existante(s) pour CETTE fenêtre de projet. */
async function findBrowseChildren(parentLabel: string): Promise<WebviewWindow[]> {
  const windows = await getAllWebviewWindows().catch(() => []);
  return windows.filter((w) => isBrowseChildOf(w.label, parentLabel));
}

/**
 * Ouvre `path` dans la fenêtre NAV — SINGLETON par fenêtre de projet (R2,
 * chantier fenêtre NAV, phase 7) : si une fenêtre NAV existe déjà pour CETTE
 * fenêtre de projet, `path` est monté dans un NOUVEL onglet de cette fenêtre
 * (`azprose:nav-open`, symétrique de R10 — `azprose:open-file`) et la
 * fenêtre reprend le focus ; sinon une nouvelle fenêtre NAV est ouverte
 * (`openBrowseWindow`). Utilisé par TOUS les lanceurs de NAV (aide, bouton
 * de la toolbar side, icône compass du breadcrumb — phase 8) : une seule
 * fenêtre NAV par projet, jamais un doublon silencieux.
 */
export async function openOrFocusBrowseWindow(opts: BrowseWindowOptions): Promise<void> {
  const launcher = getCurrentWindow();
  const [existing] = await findBrowseChildren(launcher.label);
  if (existing) {
    await emitTo(existing.label, "azprose:nav-open", opts.path);
    await existing.setFocus().catch(() => {});
    return;
  }
  await openBrowseWindow(opts);
}

/** Ferme toutes les fenêtres filles de la fenêtre courante (cascade — les
 *  fenêtres de navigation ne survivent JAMAIS à leur fenêtre de projet). */
export async function closeBrowseChildren(parentLabel: string): Promise<void> {
  const windows = await findBrowseChildren(parentLabel);
  await Promise.all(windows.map((w) => w.destroy().catch(() => {})));
}

/** Propage la bascule de décorations à chaud vers toutes les fenêtres NAV de
 *  ce projet (vague 4, phase 4.2 — « PROJET instaure, NAV suit », jamais
 *  l'inverse : NAV n'a pas de bouton de bascule). Symétrique de
 *  `closeBrowseChildren` ; sans effet si aucune fenêtre NAV n'est ouverte. */
export async function broadcastDecorationsToChildren(parentLabel: string, decorated: boolean): Promise<void> {
  const windows = await findBrowseChildren(parentLabel);
  await Promise.all(windows.map((w) => emitTo(w.label, "azprose:decorations", decorated).catch(() => {})));
}
