/**
 * Autorité UNIQUE de la racine du coffre, pour une fenêtre.
 *
 * ── Pourquoi ce module existe ────────────────────────────────────────────────
 * La notion « projet courant » était portée par SIX valeurs (`urlRoot`,
 * `folders.current[0]`, `rootPath`, le `scope` de `session.ts`, le `const
 * projectRoot` d'app.svelte, et `VaultRoot` côté Rust), chacune mise à jour par
 * son propre chemin, aucune n'étant l'autorité. Deux d'entre elles étaient même
 * partagées entre fenêtres alors qu'elles décrivent un état PAR fenêtre. D'où,
 * entre autres : la session lue au scope d'un projet puis ouverte dans la
 * fenêtre d'un autre, et le miroir disque écrit dans un coffre pendant que le
 * localStorage l'était dans un second.
 *
 * ── L'invariant, et pourquoi il est plus fort qu'un ordonnancement ───────────
 * **La racine est IMMUABLE pendant la vie de la fenêtre.** Seules deux
 * transitions existent :
 *   - `null → racine` — au démarrage (`?root=`, repli sur le dernier projet)
 *     ou depuis la porte de projet (ProjectGate) ;
 *   - `racine → null` — à la fermeture du projet, qui ramène à cette porte.
 * Jamais `racine → autre racine` : ouvrir un autre projet ouvre une autre
 * FENÊTRE (`handleOpenProjectByPath` le fait déjà pour les projets disjoints).
 *
 * C'est ce qui distingue ce module d'un simple regroupement des appels
 * existants. Les défauts corrigés étaient des COURSES — deux promesses de boot
 * sans ordre garanti, un `$effect` de synchronisation, un `const` figé face à
 * un `$state` mobile. Une valeur qui ne change pas n'a pas d'ordre à garantir :
 * le problème disparaît au lieu d'être ordonné.
 *
 * ── Le périmètre ─────────────────────────────────────────────────────────────
 * `perimetre()` = `[racine, ...invités]` (arbitrage A du 2026-08-31). Les
 * dossiers invités sont ouverts à côté du projet et sont, par décision, du
 * contenu légitime. C'est la seule définition de « appartient à ce projet »
 * dans l'application ; tout le reste (restauration de session, garde d'écriture
 * de `lib/files.ts`) la consomme via `dansPerimetre`.
 */

import { setSessionScope, loadGuests, saveGuests } from "@/lib/session";
import { dansPerimetre } from "@/lib/paths";
import { brancherPerimetreCoffre } from "@/lib/files";
import { STORAGE_KEYS } from "@/lib/storage";

/** Signalement d'anomalie (Diagnostics). INJECTÉ plutôt qu'importé : garder ce
 *  module compilable seul est ce qui permet de tester l'invariant d'immuabilité,
 *  qui est la garantie centrale de tout le cloisonnement. Non branché, les
 *  refus sont muets — ils décrivent de toute façon un « ne devrait jamais
 *  arriver ». */
let signaler: (message: string) => void = () => {};

export function brancherSignalementCoffre(fn: (message: string) => void): void {
  signaler = fn;
}

let _racine: string | null = $state(null);
let _invites: string[] = $state([]);

/** Racine du projet ouvert dans CETTE fenêtre, ou `null` avant toute ouverture. */
export function racine(): string | null {
  return _racine;
}

/** Dossiers invités, ouverts à côté du projet. Vide tant qu'aucun projet ne l'est. */
export function invites(): readonly string[] {
  return _invites;
}

/**
 * Périmètre du coffre : la racine puis les invités, dans l'ordre d'affichage de
 * la sidebar (la racine en premier, `isPrimary`). Vide sans projet ouvert —
 * n'autorise donc rien, ce qui est l'état voulu derrière la porte de projet.
 */
export function perimetre(): readonly string[] {
  return _racine ? [_racine, ..._invites] : [];
}

/** Ce chemin appartient-il au projet ouvert (racine ou dossier invité) ? */
export function appartientAuCoffre(chemin: string): boolean {
  return dansPerimetre(chemin, perimetre());
}

// Arme la garde d'écriture de `lib/files.ts` dès le chargement de CE module.
// Ici plutôt qu'au point d'entrée : ce module est importé par `root-path.svelte`,
// donc par tout ce qui touche au coffre — la garde est armée avant qu'une
// écriture soit seulement possible, sans dépendre d'un appel qu'on pourrait
// oublier d'ajouter à un futur point d'entrée.
brancherPerimetreCoffre(perimetre);

/**
 * Ouvre `chemin` comme projet de cette fenêtre. **Seul** appelant légitime de
 * `setSessionScope` : le scope est posé AVANT toute lecture d'état scopé (les
 * invités ci-dessous en dépendent, la session restaurée aussi).
 *
 * Idempotent sur la même racine — le démarrage peut l'appeler plusieurs fois
 * sans conséquence. Une racine DIFFÉRENTE est refusée et tracée : c'est le
 * symptôme d'un appelant qui n'a pas compris l'invariant, pas une situation à
 * rattraper silencieusement.
 *
 * `memoriser: false` pour la fenêtre NAV : elle adopte la racine d'un coffre
 * pour résoudre les wikilinks de ses aperçus, mais elle n'OUVRE pas ce projet —
 * lui laisser écrire « dernier projet ouvert » ferait rouvrir un coffre que
 * l'utilisateur n'a fait que consulter.
 */
export function ouvrirCoffre(chemin: string, opts?: { memoriser?: boolean }): void {
  if (_racine === chemin) return;
  if (_racine !== null) {
    signaler(
      `Changement de racine refusé : cette fenêtre est ouverte sur « ${_racine} », ` +
        `« ${chemin} » doit s'ouvrir dans une autre fenêtre.`,
    );
    return;
  }
  // Ordre NON négociable : le scope d'abord, la lecture des invités ensuite —
  // `loadGuests()` lit une clé scopée.
  setSessionScope(chemin);
  _racine = chemin;
  _invites = loadGuests().filter((g) => g !== chemin);
  if (opts?.memoriser !== false) memoriserDernierProjet(chemin);
}

/**
 * Ferme le projet et ramène à la porte de projet. Les invités partent avec lui :
 * ils n'ont de sens que relativement à un coffre, et leur clé est scopée par
 * celui-ci — les garder en mémoire les ferait réécrire sous le scope suivant.
 */
export function fermerCoffre(): void {
  _racine = null;
  _invites = [];
  setSessionScope(null);
}

/** Ajoute un dossier invité. Sans projet ouvert, le dossier DEVIENT le projet. */
export function ajouterInvite(chemin: string): void {
  if (!_racine) {
    ouvrirCoffre(chemin);
    return;
  }
  if (chemin === _racine || _invites.includes(chemin)) return;
  _invites = [..._invites, chemin];
  saveGuests(_invites);
}

/**
 * Retire un dossier du périmètre. Retirer la RACINE ferme le projet (retour à
 * la porte) au lieu de promouvoir un invité : cette promotion re-scopait tout
 * l'état de la fenêtre sans que rien ne le dise, et elle est exclue par
 * l'invariant d'immuabilité.
 */
export function retirerDuPerimetre(chemin: string): void {
  if (chemin === _racine) {
    fermerCoffre();
    return;
  }
  if (!_invites.includes(chemin)) return;
  _invites = _invites.filter((g) => g !== chemin);
  saveGuests(_invites);
}

// ── Mémoire du dernier projet ouvert ────────────────────────────────────────
//
// Clé GLOBALE et volontairement distincte de la liste affichée : c'est le seul
// repli quand la fenêtre démarre sans `?root=`. Confondre les deux — une clé
// unique servant à la fois de mémoire et de contenu de la sidebar — est
// exactement ce qui laissait le boot d'une fenêtre réécrire l'arborescence
// d'une autre. Elle est déclarée dans `CLES_PAR_FENETRE`, donc jamais reçue
// d'une autre fenêtre : sa valeur est celle qu'a écrite CETTE fenêtre.

function memoriserDernierProjet(chemin: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.lastProject, JSON.stringify(chemin));
  } catch {
    /* quota : la mémoire du dernier projet est un confort, pas un invariant */
  }
}

/** Dernier projet ouvert par cette fenêtre — repli de `?root=` au démarrage. */
export function dernierProjet(): string | null {
  try {
    const brut = localStorage.getItem(STORAGE_KEYS.lastProject);
    if (!brut) return null;
    const v: unknown = JSON.parse(brut);
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}
