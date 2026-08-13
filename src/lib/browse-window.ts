/**
 * Fenêtre fille « browser » (Phase F — D2/R5 des rounds « pinned tabs »).
 *
 * Le mode navigation d'un viewer est REMPLACÉ par une vraie fenêtre : la
 * lecture en chaîne (wikilink après wikilink, back/forward) sort des panneaux.
 * Le tab de lancement reste actif tel quel — plus de changement d'identité de
 * tab, plus de doublon transitoire, plus de conflit de règles.
 *
 * Conventions (R5, round 5) :
 * - taille = celle du lancement de l'app : JAMAIS maximisée, dépendante de
 *   l'écran, même si la fenêtre de projet l'est ;
 * - si la fenêtre de LANCEMENT est en plein écran (viewer en fullscreen), la
 *   fenêtre fille l'est aussi ;
 * - la fenêtre fille se ferme avec sa fenêtre de projet (cascade explicite —
 *   `parent` gère l'empilement, pas la destruction sur toutes les plateformes).
 */
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { WebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { basename } from "@/lib";

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
  /** Article de l'aide intégrée (même mécanisme — la doc sort des panneaux). */
  help?: boolean;
}

/** Ouvre une fenêtre fille de navigation sur `path`. */
export async function openBrowseWindow(opts: BrowseWindowOptions): Promise<WebviewWindow> {
  const parent = getCurrentWindow();
  const [monitor, fullscreen] = await Promise.all([
    currentMonitor().catch(() => null),
    parent.isFullscreen().catch(() => false),
  ]);
  const { width, height } = browseWindowSize(monitor);
  const params = new URLSearchParams({ browse: opts.path });
  if (opts.root) params.set("root", opts.root);
  if (opts.help) params.set("help", "1");
  return new WebviewWindow(browseWindowLabel(parent.label, ++browseSeq), {
    url: `index.html?${params.toString()}`,
    title: basename(opts.path),
    width,
    height,
    center: true,
    // Empilement au-dessus de la fenêtre de projet (transient-for sous Linux).
    parent,
    // R5 : le plein écran du viewer de lancement se propage ; sinon fenêtre
    // normale — jamais maximisée, même si la fenêtre de projet l'est.
    fullscreen,
  });
}

/** Ferme toutes les fenêtres filles de la fenêtre courante (cascade — les
 *  fenêtres de navigation ne survivent JAMAIS à leur fenêtre de projet). */
export async function closeBrowseChildren(parentLabel: string): Promise<void> {
  const windows = await getAllWebviewWindows().catch(() => []);
  await Promise.all(
    windows
      .filter((w) => isBrowseChildOf(w.label, parentLabel))
      .map((w) => w.destroy().catch(() => {})),
  );
}
