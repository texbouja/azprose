/**
 * `workspace/didChangeWatchedFiles` — le CONTRAT que nous avions annoncé sans
 * le tenir.
 *
 * Nous déclarons `didChangeWatchedFiles.dynamicRegistration: true`, et
 * markdown-oxide en a besoin pour fonctionner. En retour, il nous envoie un
 * `client/registerCapability` décrivant les fichiers à surveiller — et nous
 * répondions « OK » sans rien surveiller. Le serveur nous croyant sur parole,
 * il ne balaie jamais le disque de son côté : les fichiers créés, renommés ou
 * supprimés n'entraient donc JAMAIS dans son index, et la complétion des
 * wikilinks restait sur la vue du démarrage.
 *
 * Sa documentation le dit sans détour : « support for features will depend on
 * the extent to which the editor implements the LSP » (oxide.md). Rien ne se
 * règle dans `.moxide.toml` — la page Configuration n'expose aucun réglage
 * d'indexation hormis `excluded_folders`. C'était bien à nous de le faire.
 *
 * Module PUR (aucun import Tauri ni Svelte) : la correspondance de motifs est
 * la partie qu'on peut se tromper en silence, elle doit être testable seule.
 */

/** `FileChangeType` du protocole. */
export const CREE = 1;
export const MODIFIE = 2;
export const SUPPRIME = 3;
export type TypeChangement = typeof CREE | typeof MODIFIE | typeof SUPPRIME;

/** `WatchKind` du protocole — masque de bits, 7 (tout) par défaut. */
const SURVEILLE_CREATION = 1;
const SURVEILLE_MODIFICATION = 2;
const SURVEILLE_SUPPRESSION = 4;

export interface Surveillant {
  motif: string;
  /** Masque `WatchKind`. */
  genre: number;
}

const CARACTERES_SPECIAUX = /[.+^$()|\\]/g;

function echapper(c: string): string {
  return c.replace(CARACTERES_SPECIAUX, "\\$&");
}

/** Index du `}` (ou `]`) fermant, en tenant compte de l'imbrication. */
function fermeture(motif: string, debut: number, ouvrant: string, fermant: string): number {
  let profondeur = 0;
  for (let i = debut; i < motif.length; i++) {
    if (motif[i] === ouvrant) profondeur++;
    else if (motif[i] === fermant) {
      profondeur--;
      if (profondeur === 0) return i;
    }
  }
  return -1;
}

/** Découpe `a,b,{c,d}` en `["a", "b", "{c,d}"]` — virgules de profondeur 0. */
function alternatives(contenu: string): string[] {
  const morceaux: string[] = [];
  let profondeur = 0;
  let courant = "";
  for (const c of contenu) {
    if (c === "{") profondeur++;
    if (c === "}") profondeur--;
    if (c === "," && profondeur === 0) {
      morceaux.push(courant);
      courant = "";
    } else {
      courant += c;
    }
  }
  morceaux.push(courant);
  return morceaux;
}

/**
 * Traduit un motif glob LSP en expression régulière ancrée.
 *
 * Sémantique du protocole : `*` ne franchit pas les séparateurs, `**` traverse
 * les segments, `?` vaut un caractère, `{a,b}` alterne, `[abc]` / `[!abc]` sont
 * des classes.
 *
 * Le piège est le double astérisque SUIVI D'UN SÉPARATEUR : il doit accepter
 * **zéro** segment. Sans cela, le motif qu'enregistre markdown-oxide (double
 * astérisque, séparateur, `*.md`) raterait tous les fichiers situés à la racine
 * du coffre — c'est-à-dire, en pratique, la moitié d'un vault.
 */
export function globVersRegExp(motif: string): RegExp {
  let re = "";
  let i = 0;
  while (i < motif.length) {
    const c = motif[i];
    if (c === "*") {
      if (motif[i + 1] === "*") {
        if (motif[i + 2] === "/") {
          re += "(?:[^/]*/)*"; // zéro segment ou plus
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else if (c === "{") {
      const fin = fermeture(motif, i, "{", "}");
      if (fin === -1) {
        re += "\\{";
        i += 1;
      } else {
        const options = alternatives(motif.slice(i + 1, fin));
        re += "(?:" + options.map((o) => globVersRegExp(o).source.slice(1, -1)).join("|") + ")";
        i = fin + 1;
      }
    } else if (c === "[") {
      const fin = motif.indexOf("]", i + 1);
      if (fin === -1) {
        re += "\\[";
        i += 1;
      } else {
        const contenu = motif.slice(i + 1, fin);
        re += "[" + (contenu.startsWith("!") ? "^" + contenu.slice(1) : contenu) + "]";
        i = fin + 1;
      }
    } else {
      re += echapper(c);
      i += 1;
    }
  }
  return new RegExp("^" + re + "$");
}

/** Sépare l'URI `file://` de son chemin. Rend le chemin tel quel sinon. */
export function cheminDeLUri(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  try {
    return decodeURIComponent(uri.slice("file://".length));
  } catch {
    return uri.slice("file://".length);
  }
}

/**
 * Extrait les surveillants d'un `client/registerCapability`.
 *
 * `globPattern` est soit une chaîne, soit un `RelativePattern`
 * (`{ baseUri, pattern }`) : dans le second cas le motif est relatif à sa base,
 * on le recompose en chemin absolu pour pouvoir le comparer tel quel.
 */
export function surveillantsDeLEnregistrement(params: unknown): Surveillant[] {
  const p = params as { registrations?: Array<{ method?: string; registerOptions?: unknown }> } | undefined;
  const sortie: Surveillant[] = [];
  for (const enr of p?.registrations ?? []) {
    if (enr?.method !== "workspace/didChangeWatchedFiles") continue;
    const opts = enr.registerOptions as { watchers?: Array<{ globPattern?: unknown; kind?: number }> } | undefined;
    for (const w of opts?.watchers ?? []) {
      const brut = w?.globPattern;
      let motif: string | null = null;
      if (typeof brut === "string") {
        motif = brut;
      } else if (brut && typeof brut === "object") {
        const rp = brut as { baseUri?: string; pattern?: string };
        if (typeof rp.pattern === "string") {
          motif = rp.baseUri
            ? cheminDeLUri(rp.baseUri).replace(/\/$/, "") + "/" + rp.pattern.replace(/^\//, "")
            : rp.pattern;
        }
      }
      if (motif) sortie.push({ motif, genre: typeof w?.kind === "number" ? w.kind : 7 });
    }
  }
  return sortie;
}

function genreAttendu(type: TypeChangement): number {
  if (type === CREE) return SURVEILLE_CREATION;
  if (type === SUPPRIME) return SURVEILLE_SUPPRESSION;
  return SURVEILLE_MODIFICATION;
}

/**
 * Ce changement est-il de ceux que le serveur a demandé à recevoir ?
 *
 * Un motif enregistré peut être relatif au coffre ou absolu, et **la forme du
 * motif décide de ce à quoi on le compare** : un motif absolu se confronte au
 * chemin complet, un motif relatif à la seule forme relative à la racine.
 * Confronter un motif relatif au chemin absolu paraît plus permissif et sans
 * risque ; ça ne l'est pas — le double astérisque avale alors le préfixe, et
 * `<double>/*.md` accepterait n'importe quel Markdown du disque, coffre voisin
 * compris.
 *
 * **Aucun surveillant enregistré = tout Markdown passe.** Le serveur peut
 * n'avoir pas encore envoyé son enregistrement quand les premiers événements
 * arrivent ; se taire dans ce cas rejouerait exactement le défaut qu'on
 * corrige. Mieux vaut une notification de trop qu'un index qui reste faux.
 */
export function estSurveille(
  chemin: string,
  type: TypeChangement,
  surveillants: readonly Surveillant[],
  racine: string | null,
): boolean {
  const normalise = chemin.replace(/\\/g, "/");
  if (surveillants.length === 0) return /\.(md|markdown)$/i.test(normalise);

  const base = racine ? racine.replace(/\\/g, "/").replace(/\/$/, "") + "/" : null;
  const relatif = base && normalise.startsWith(base) ? normalise.slice(base.length) : null;

  return surveillants.some((s) => {
    if ((s.genre & genreAttendu(type)) === 0) return false;
    const motif = s.motif.replace(/\\/g, "/");
    const re = globVersRegExp(motif);
    if (/^([a-zA-Z]:)?\//.test(motif)) return re.test(normalise);
    // Motif relatif sans racine connue : on ne peut pas construire la forme
    // relative, on compare au mieux — cas de repli, pas le cas normal.
    if (base === null) return re.test(normalise);
    // Racine connue mais chemin en dehors : un motif relatif au coffre ne peut
    // pas décrire un fichier qui n'y est pas.
    return relatif !== null && re.test(relatif);
  });
}
