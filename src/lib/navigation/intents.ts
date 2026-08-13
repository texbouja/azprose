/**
 * Alphabet d'intentions de navigation (phase 1, idée A du rapport
 * architecture-review) — canal 1 « navigate ».
 *
 * Une intention est une demande de navigation PURE, typée, débarassée de la
 * couche CustomEvent. Le reducer (`reducer.ts`) applique l'intention sur la
 * session (PanelManager + stores) ; `dispatch.ts` fait le pont CustomEvent →
 * intention pour les listeners hérités.
 *
 * Règle 9 (rapport architecture-review) : le reducer de navigation est le
 * SEUL endroit qui modifie la session de navigation (tabs, panneaux, liens
 * preview↔éditeur, historique back/forward). Les orchestrateurs métier (canal
 * 3, `data/commands.ts`) terminent par `navigate()` — jamais d'appels directs
 * à PanelManager depuis un composant.
 */

import type { TabSource } from "@/lib/panel-store";

/** Options d'ouverture — sous-ensemble de l'API PanelState.open/openInMain. */
export interface OpenOptions {
  preferDraft?: boolean;
  silent?: boolean;
  preview?: boolean;
  sourceType?: TabSource;
}

/** Options d'ouverture éditeur (openFileInTab legacy). */
export interface OpenInTabOptions {
  preferDraft?: boolean;
  silent?: boolean;
  preview?: boolean;
  sourceType?: TabSource;
}

export type NavIntent =
  /** Ouvre un fichier (routage image/pdf → side, texte → main). C'est le
   *  remplaçant typé de `openFileInTab`. */
  | { type: "open-file"; path: string; opts?: OpenInTabOptions }
  /** Clic sidebar : tab ACTIF du bon panel (main pour texte, side pour
   *  pdf/image), avec dédup. C'est le remplaçant typé de
   *  `handleSidebarFileSelect(path, newTab=false)`.
   *
   *  Routage par espace (Phase B) : clic SIMPLE sur un texte → le PINNED slot
   *  du format s'il existe (re-point du tab épinglé, jamais de doublon
   *  pinned), sinon le tab libre. `newTab` (alt+clic) → espace LIBRE
   *  explicite. `viewer` (alt+maj+clic) → viewer libre side (dédup, jamais
   *  l'éditeur ni le pinned). */
  | { type: "open-active"; path: string; newTab?: boolean; viewer?: boolean }
  /** Navigation wikilink depuis un viewer : ouvre un tab viewer side avec
   *  dédup par contenu — JAMAIS l'éditeur main (l'éditeur ne s'atteint que par
   *  double-clic / « Ouvrir dans l'éditeur »), JAMAIS en place (Phase G : le
   *  mode navigation est retiré des panneaux — la lecture EN CHAÎNE se fait
   *  dans la fenêtre fille browser). */
  | { type: "wikilink-navigate"; path: string; heading?: string | null }
  /** Alt+clic wikilink : NOUVEL onglet éditeur. */
  | { type: "wikilink-open-new"; path: string; heading?: string | null }
  /** Saut TOC/backlinks/tags : ouvre dans le tab éditeur actif (routage max
   *  vers la preview si fullscreen), applique line (1-based, convertie en
   *  0-based) et/ou heading. Remplaçant typé de `azprose:jump-to-file`. */
  | { type: "jump-to-file"; path: string; line?: number | null; heading?: string | null }
  /** Saut TOC (table des matières sidebar) : la cible remonte dans le VIEWER
   *  side — jamais l'éditeur main (décision utilisateur). Même politique que
   *  le wikilink : tab viewer side avec dédup par contenu. L'aide intégrée
   *  reste routée en doc. Scroll : `heading` prioritaire (id immune aux
   *  décalages de transclusion), sinon `line` 1-based (racines de branches). */
  | { type: "toc-navigate"; path: string; line?: number | null; heading?: string | null }
  /** Saut dbl-clic preview : cible le fichier RENDU (tab side), 0-based.
   *  Remplaçant typé de `azprose:jump-to-line` : le saut vise le fichier RENDU
   *  (identité par contenu — Phase G, plus de table de liens). */
  | { type: "jump-to-line"; line: number; path?: string | null }
  /** Bouton « Ouvrir dans l'éditeur » du tab side : le fichier RENDU par ce
   *  tab preview s'ouvre dans l'éditeur main (dédup — jamais de doublon). Si le
   *  side est maximisé : bascule d'abord en 2 panneaux. Aucun couplage créé
   *  (Phase G). */
  | { type: "preview-open-editor"; path: string }
  /** Historique de MONTAGE du pinned slot (Phase D — D6/D7) : remonte au
   *  contenu précédemment monté dans le slot du `format` (md, tex…). Émis par
   *  la tabaction de l'éditeur épinglé ET par celle de son viewer compagnon
   *  (mêmes actions). Le retour retrouve le buffer dans son dernier état, sans
   *  rebuild. Concerne les PINNED SEULS (les tabs libres n'ont pas de pile de
   *  montage — chaque navigation y ouvre/active un tab). */
  | { type: "pinned-back"; format: string }
  /** Historique de montage du pinned slot : redescend d'un cran. */
  | { type: "pinned-forward"; format: string }
  /** Glisser-déposer d'un onglet SUR le slot épinglé (rectification 2) : le
   *  slot est RECYCLÉ avec le contenu de l'onglet glissé (montage empilé dans
   *  son historique) et l'onglet d'origine est fermé. C'est ainsi que la pile
   *  du slot SURVIT à un changement de contenu, là où commuter l'épingle la
   *  détruit. Un dépôt sur un onglet NON épinglé est ignoré (le glisser entre
   *  deux onglets reste un simple déplacement). */
  | { type: "drop-on-pinned"; draggedTabId: string; pinnedTabId: string }
  /** Navigation PDF rect (clic sur un lien/embed rect) : ouvre le PDF puis
   *  scroll vers la page/rect. Remplaçant typé de `azprose:pdf-rect-navigate`. */
  | { type: "pdf-rect-navigate"; path: string; page?: number; rect?: string }
  /** Clic date du journal : crée/ouvre la daily note. Remplaçant typé de
   *  `azprose:journal-date-click`. */
  | { type: "journal-date-click"; date: string }
  /** Saut daily-note venant du LSP oxide (today/yesterday/tomorrow/jump).
   *  Remplaçant typé de `azprose:oxide-show-document`. */
  | { type: "oxide-show-document"; path: string }
  /** Ouvre (dédup) un tableur en side. Remplaçant typé de
   *  `openSpreadsheetInSide` (l'orchestrateur canal 3 lit le nom réel via le
   *  domaine puis poste CETTE intention — le reducer ne connaît pas l'IPC). */
  | { type: "open-spreadsheet"; spreadsheetId: string; title: string }
  /** Ouvre (dédup) une pile DataFilter en side — identité = ensemble trié des
   *  ids de grilles. Remplaçant typé de `openDataFilterInSide`. */
  | { type: "open-datafilter"; datafilterIds: string[]; title: string }
  /** Ouvre (dédup) un panneau custom en side (calendrier, …). Remplaçant typé
   *  de `openCustomInSide`. */
  | { type: "open-custom"; panelId: string; title: string }
  /** Transition create→upgrade : fixe spreadsheetId + titre sur le tab tableur
   *  « create » (sans id). Remplaçant typé de `setSpreadsheetTabId`. */
  | { type: "set-spreadsheet-id"; spreadsheetId: string; title: string }
  /** Met à jour le titre d'un tab tableur (après chargement du nom réel).
   *  Remplaçant typé de `setSpreadsheetTabTitle`. */
  | { type: "set-spreadsheet-title"; spreadsheetId: string; title: string };

export type { TabSource };
