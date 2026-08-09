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
   *  Remplaçant typé de `azprose:jump-to-line`. */
  | { type: "jump-to-line"; line: number; path?: string | null }
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
  | { type: "oxide-show-document"; path: string };

export type { TabSource };
