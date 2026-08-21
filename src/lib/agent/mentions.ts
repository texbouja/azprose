// Mentions de fichiers dans le message de l'assistant — calque du `@` de la
// TUI OpenCode (opencode.ai/docs/tui) : « The content of the file is added
// to the conversation automatically ». Mesuré à charge réelle (sonde ACP du
// 2026-08-21, OpenCode 1.18.11) : un bloc `resource_link` dans session/prompt
// est converti par le serveur en pièce jointe dont le contenu arrive à
// l'agent SANS appel fs/read_text_file. Le mécanisme est donc côté CLIENT :
// compléter la saisie, puis joindre les blocs au prompt — aucun Rust, aucun
// changement serveur.
//
// Module PUR : détection du token en cours au curseur, extraction des
// mentions d'un message complet, filtrage de la liste de fichiers. La source
// des fichiers (walkSupportedTextFiles) reste l'affaire du panneau.

/** Une entrée de fichier du coffre — forme structurelle de FlatFileEntry
 *  (src/lib/files.ts) sans en importer les dépendances Tauri. */
export interface EntreeFichier {
  /** Nom avec extension (« note.md »). */
  name: string;
  /** Chemin ABSOLU sur disque (pour l'URI du resource_link). */
  path: string;
  /** Chemin relatif à la racine du coffre (affiché et inséré après @). */
  rel: string;
}

/** Une mention @chemin repérée dans un message. */
export interface MentionFichier {
  chemin: string;
  /** Position du « @ » inclus, fin exclue. */
  debut: number;
  fin: number;
}

/**
 * Le token @ en cours de saisie au curseur, ou null si le curseur n'est pas
 * dans une mention. Le token commence en début de ligne ou après un blanc
 * (un « a@b » est une adresse, pas une mention) et ne contient aucun blanc ;
 * la requête peut être vide (@ fraîchement tapé).
 */
export function mentionAuCurseur(
  texte: string,
  caret: number,
): { debut: number; query: string } | null {
  const borne = Math.max(0, Math.min(caret, texte.length));
  const avant = texte.slice(0, borne);
  const m = /(^|\s)@([^\s]*)$/.exec(avant);
  if (!m) return null;
  return { debut: borne - 1 - m[2].length, query: m[2] };
}

/** Toutes les mentions d'un message complet — pour joindre un bloc
 *  `resource_link` par mention au moment de l'envoi. */
export function extraireMentions(texte: string): MentionFichier[] {
  const out: MentionFichier[] = [];
  for (const m of texte.matchAll(/(^|\s)@([^\s]+)/g)) {
    const debut = (m.index ?? 0) + m[1].length;
    out.push({ chemin: m[2], debut, fin: debut + 1 + m[2].length });
  }
  return out;
}

/** Filtrage de la liste de fichiers pour la complétion : sous-chaîne
 *  insensible à la casse sur le chemin relatif, tronqué au plafond du popup.
 *  Le fuzzy proprement dit serait un raffinement — sous-chaîne suffit v1. */
export function filtrerFichiers(
  fichiers: readonly EntreeFichier[],
  query: string,
  max = 8,
): EntreeFichier[] {
  const aiguille = query.trim().toLowerCase();
  const base = aiguille
    ? fichiers.filter((f) => f.rel.toLowerCase().includes(aiguille))
    : fichiers;
  return base.slice(0, max);
}

/** URI file:// d'un chemin absolu. Linux/macOS direct ; Windows slashé et
 *  précédé d'un « / » (file:///C:/…) par prudence, même si l'app ne cible
 *  pas cette plateforme aujourd'hui. */
export function uriFichier(cheminAbsolu: string): string {
  const p = cheminAbsolu.split("\\").join("/");
  return "file://" + (p.startsWith("/") ? p : "/" + p);
}
