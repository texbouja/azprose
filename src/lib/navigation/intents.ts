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
  fallbackToActive?: boolean;
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
   *  `handleSidebarFileSelect(path, newTab=false)`. */
  | { type: "open-active"; path: string; newTab?: boolean }
  /** Navigation wikilink IN-PLACE du tab preview (associé à l'éditeur via
   *  previewLinkedTabId). C'est le remplaçant typé de
   *  `azprose:wikilink-navigate`. */
  | { type: "wikilink-navigate"; path: string; heading?: string | null }
  /** Alt+clic wikilink : NOUVEL onglet éditeur. Remplaçant typé de
   *  `azprose:wikilink-open-new`. */
  | { type: "wikilink-open-new"; path: string; heading?: string | null }
  /** Saut TOC/backlinks/tags : ouvre dans le tab éditeur actif (routage max
   *  vers la preview si fullscreen), applique line (1-based, convertie en
   *  0-based) et/ou heading. Remplaçant typé de `azprose:jump-to-file`. */
  | { type: "jump-to-file"; path: string; line?: number | null; heading?: string | null }
  /** Saut dbl-clic preview : cible le fichier RENDU (tab side), 0-based.
   *  Remplaçant typé de `azprose:jump-to-line`. `sessionId` = id du tab side
   *  émetteur (phase 3 C) : le reducer le résout via la table de liens
   *  preview↔éditeur — si le fichier rendu est celui du tab éditeur LIÉ, le
   *  saut y va directement (jamais un doublon créé par une recherche par
   *  chemin). Sans sessionId (legacy), résolution par chemin. */
  | { type: "jump-to-line"; line: number; path?: string | null; sessionId?: string | null }
  /** Bouton « Ouvrir dans l'éditeur » du tab side : le fichier RENDU par ce
   *  tab preview s'ouvre dans l'éditeur main (dédup — jamais de doublon).
   *  Si le side est maximisé : bascule d'abord en 2 panneaux. */
  | { type: "preview-open-editor"; path: string }
  /** Bouton Home du preview : navigation vers l'index.md lié. Remplaçant
   *  typé de `azprose:preview-home`. */
  | { type: "preview-home"; newTab?: boolean }
  /** Historique preview : retour arrière. Remplaçant typé de navGoBack. */
  | { type: "preview-back" }
  /** Historique preview : retour avant. Remplaçant typé de navGoForward. */
  | { type: "preview-forward" }
  /** Navigation doc intégrée (DocPreview) — jamais l'éditeur main.
   *  Remplaçant typé de `azprose:doc-navigate`. */
  | { type: "doc-navigate"; path: string; heading?: string }
  /** Ouvre la racine de la doc intégrée. Remplaçant typé de `openHelp()`. */
  | { type: "open-help" }
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
