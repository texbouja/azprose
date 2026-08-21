// Historique des demandes envoyées dans l'assistant — sémantique shell/TUI :
// ↑ au début du champ remonte dans les envois précédents, ↓ à la fin
// redescend ; le brouillon non envoyé est mis de côté au premier rappel et
// restitué au retour. Les positions comptent DEPUIS LE PRÉSENT : -1 =
// brouillon vivant, 0 = dernier envoi, n-1 = plus ancien.
//
// Module PUR : bornes, lecture d'entrée et détection des bornes verticales
// du champ — sans DOM ni état du panneau.

/** Nouvelle position après un pas de navigation, bornée : delta > 0 va vers
 *  le passé (↑, positions croissantes), delta < 0 vers le présent (↓).
 *  Déjà au plus ancien ou déjà au brouillon vivant → position inchangée ;
 *  une position périmée (session changée) ne peut que redescendre. */
export function cibleHistorique(
  pos: number,
  delta: number,
  taille: number,
): number {
  const cible = pos + delta;
  if (cible >= Math.max(taille, 0) || cible < -1) return pos;
  return cible;
}

/** Texte restauré pour une position : le brouillon mis de côté (-1) ou
 *  l'envoi correspondant (0 = le plus récent). */
export function entreeHistorique(
  hist: readonly string[],
  pos: number,
  brouillon: string,
): string {
  return pos === -1 ? brouillon : hist[hist.length - 1 - pos];
}

/** Le caret est-il sur la première LIGNE LOGIQUE ? ↑ ne doit rappeler
 *  l'historique que là — sinon il déplace le caret dans un texte multiligne. */
export function caretSurPremiereLigne(texte: string, caret: number): boolean {
  const borne = Math.max(0, Math.min(caret, texte.length));
  return !texte.slice(0, borne).includes("\n");
}

/** Le caret est-il sur la dernière ligne logique ? */
export function caretSurDerniereLigne(texte: string, caret: number): boolean {
  const borne = Math.max(0, Math.min(caret, texte.length));
  return !texte.slice(borne).includes("\n");
}
