// Modèle ACTIF et modèle par DÉFAUT — deux notions longtemps confondues.
//
// Avant (jusqu'au 2026-08-22) : cliquer une ligne du sélecteur persistait le
// choix. Essayer un modèle changeait donc le défaut pour toujours, en
// silence, et une entrée « Défaut OpenCode » — qui n'était pas un modèle mais
// un effacement de surcharge déguisé en ligne sélectionnable — servait de
// sortie de secours.
//
// Depuis : deux gestes distincts. Un clic sur la ligne ESSAIE (session
// courante, rien sur disque) ; un clic sur le PIN fixe le défaut (persisté).
// Le pin est un bouton RADIO : au plus un défaut, et recliquer l'épinglé n'a
// aucun effet — décision utilisateur, une bascule rendrait trop facile de
// perdre son défaut par mégarde.
//
// Premier lancement = aucun pin : AZprose n'injecte AUCUNE clé `model` au
// spawn, donc l'assistant suit le comportement par défaut ou configuré
// d'OpenCode (sa chaîne de priorité, `opencode.json` compris). État voulu,
// pas un manque.

/** Le strict nécessaire de `localStorage` — injecté (P6 : jamais mock.module,
 *  et le runtime bun n'a pas de localStorage). */
export interface StockageModele {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  removeItem(cle: string): void;
}

export interface EtatModele {
  /** Le DÉFAUT, persisté. null = suivre OpenCode. */
  readonly pin: string | null;
  /** L'essai en cours, jamais persisté. Vit le temps du panneau. */
  readonly session: string | null;
}

/** Ce qu'on demande à l'agent : l'essai en cours masque le défaut. */
export function modeleVoulu(etat: EtatModele): string | null {
  return etat.session ?? etat.pin;
}

/** Clic sur une ligne : applique maintenant, ne persiste rien. */
export function essayer(etat: EtatModele, id: string): EtatModele {
  return { ...etat, session: id };
}

/**
 * Clic sur le pin : nouveau défaut. L'essai en cours est effacé — sans ça un
 * essai plus ancien continuerait de masquer le défaut qu'on vient de fixer,
 * et le chip mentirait. Recliquer l'épinglé rend l'état INCHANGÉ (identité
 * préservée : l'appelant peut tester `nouveau === etat` pour ne rien écrire).
 */
export function epingler(etat: EtatModele, id: string): EtatModele {
  if (id === etat.pin) return etat;
  return { pin: id, session: null };
}

/**
 * Le modèle voulu s'avère inapplicable (absent de la liste de l'agent,
 * refusé par le binaire). On oublie l'essai en cours d'abord, puisque c'est
 * lui qui était demandé ; si c'était le PIN, il tombe aussi — garder un
 * défaut invalide referait échouer chaque session.
 */
export function oublier(etat: EtatModele): EtatModele {
  if (etat.session !== null) return { ...etat, session: null };
  return { pin: null, session: null };
}

/**
 * Lit le pin persisté. **Migration** : « premier lancement » veut dire
 * AUCUNE valeur mémorisée. La clé portait déjà la surcharge globale des
 * versions précédentes — cette valeur devient le pin initial, sinon la mise
 * à jour effacerait en silence le choix d'un utilisateur existant.
 */
export function lirePin(stockage: StockageModele | null, cle: string): string | null {
  if (!stockage) return null;
  try {
    const brut = stockage.getItem(cle);
    if (!brut) return null;
    const v = JSON.parse(brut);
    return typeof v === "string" && v ? v : null;
  } catch {
    return null; // contenu invalide : premier lancement, pas une erreur
  }
}

export function ecrirePin(stockage: StockageModele | null, cle: string, id: string | null): void {
  if (!stockage) return;
  try {
    if (id) stockage.setItem(cle, JSON.stringify(id));
    else stockage.removeItem(cle);
  } catch {
    /* stockage indisponible : le défaut ne survivra pas à la fenêtre */
  }
}
