// Canal d'infrastructure de l'assistant — la MACHINE, sans DOM.
//
// Deux canaux routés indépendamment (décision 2026-08-22, calquée sur
// l'extension OpenCode pour VSCode) : le corps du panneau porte la
// conversation ACP, un PIED de panneau porte tout ce qui relève de la
// tuyauterie (connexion, catalogue, quota, modèle).
//
// Critère de routage, unique et suffisant : **est-ce que ça figurerait dans
// la transcription exportée ?** Oui → le fil. Non → ici.
//
// Pourquoi un pied de panneau et pas la `StatusBar` globale : elle est
// centrée sur le document, et l'assistant peut être fermé — retour
// utilisateur explicite, « il m'arrive souvent de rater des reports
// importants dans la statusbar ».
//
// Pourquoi pas de toast : un toast s'efface tout seul, or deux des trois
// niveaux doivent survivre à leur apparition.

/** Gravité — commande la couleur, le rôle ARIA et la durée de vie. */
export type NiveauStatut = "info" | "avertissement" | "erreur";

/** Ce qui a produit le message. Sert à l'auto-effacement : quand la condition
 *  se résout de façon OBSERVABLE (une session démarre, un catalogue arrive),
 *  l'appelant annonce la source et le message correspondant tombe. */
export type SourceStatut =
  /** Cycle de vie de la session ACP (binaire absent, spawn, démarrage). */
  | "agent"
  /** Catalogue de fournisseurs (serveur headless). */
  | "catalogue"
  /** Choix de modèle (application différée, note de connexion). */
  | "modele"
  /** Verdict de la passerelle maison (refus de quota, diagnostic). */
  | "quota";

export interface MessageStatut {
  niveau: NiveauStatut;
  texte: string;
  /** Lien contextuel (ex. l'URL d'espace de travail que renvoie un 429). */
  url?: string;
  source: SourceStatut;
}

/** État du canal. UN seul message vivant à la fois — voir `poser`. */
export interface EtatCanal {
  readonly message: MessageStatut | null;
  /** Tours restants avant expiration d'un avertissement (0 sinon). */
  readonly toursRestants: number;
  /** Un tour d'agent est en cours — décide si l'avertissement posé doit
   *  encore vivre la fin du tour courant EN PLUS du suivant. */
  readonly tourEnCours: boolean;
}

export function canalVide(): EtatCanal {
  return { message: null, toursRestants: 0, tourEnCours: false };
}

const RANGS: Record<NiveauStatut, number> = { info: 0, avertissement: 1, erreur: 2 };

/**
 * Pose un message. **Priorité stricte, SANS file** : un message moins grave
 * que celui affiché est jeté, pas mis en attente — une file ferait resurgir
 * des informations périmées une fois l'erreur résolue.
 *
 * Exception : la MÊME source passe toujours devant elle-même, quel que soit
 * le niveau. C'est elle qui sait que sa propre condition a changé (une
 * passerelle qui refusait puis répond → son info remplace son erreur).
 */
export function poser(etat: EtatCanal, message: MessageStatut): EtatCanal {
  if (
    etat.message &&
    message.source !== etat.message.source &&
    RANGS[message.niveau] < RANGS[etat.message.niveau]
  ) {
    return etat;
  }
  // Un avertissement posé PENDANT un tour doit survivre à la fin de ce
  // tour-là puis à celle du suivant ; posé hors tour, au seul suivant.
  const toursRestants =
    message.niveau === "avertissement" ? (etat.tourEnCours ? 2 : 1) : 0;
  return { ...etat, message, toursRestants };
}

/**
 * Une action de l'utilisateur dans le panneau (envoi, changement de modèle,
 * fermeture). Seules les **infos** en meurent : elles sont événementielles,
 * et c'est la prochaine intention de l'utilisateur qui les périme — jamais
 * une horloge.
 */
export function actionUtilisateur(etat: EtatCanal): EtatCanal {
  if (etat.message?.niveau !== "info") return etat;
  return { ...etat, message: null, toursRestants: 0 };
}

export function debutDeTour(etat: EtatCanal): EtatCanal {
  return { ...etat, tourEnCours: true };
}

/** Fin d'un tour d'agent : décompte de l'avertissement, qui meurt à zéro. */
export function finDeTour(etat: EtatCanal): EtatCanal {
  if (etat.message?.niveau !== "avertissement") return { ...etat, tourEnCours: false };
  const restants = etat.toursRestants - 1;
  return restants > 0
    ? { ...etat, toursRestants: restants, tourEnCours: false }
    : { message: null, toursRestants: 0, tourEnCours: false };
}

/**
 * La condition qui avait motivé un message s'est résolue de façon
 * OBSERVABLE : une session démarre → « agent introuvable » tombe seul. C'est
 * la moitié auto-effaçable de l'erreur bloquante ; l'autre moitié — ce qu'on
 * ne peut pas observer, un refus de quota — attend `fermer`.
 */
export function conditionResolue(etat: EtatCanal, source: SourceStatut): EtatCanal {
  if (etat.message?.source !== source) return etat;
  return { ...etat, message: null, toursRestants: 0 };
}

/** Fermeture manuelle (la croix). Le seul geste qui retire une erreur dont
 *  la résolution n'est pas observable. */
export function fermer(etat: EtatCanal): EtatCanal {
  return { ...etat, message: null, toursRestants: 0 };
}

/** Une erreur bloquante est vivante → l'en-tête du panneau porte un marqueur
 *  persistant (contre l'accoutumance périphérique : le pied peut sortir du
 *  champ de vision, pas l'en-tête). */
export function estBloquant(etat: EtatCanal): boolean {
  return etat.message?.niveau === "erreur";
}
