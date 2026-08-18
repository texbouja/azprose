/**
 * Filtrage des programmes officiels par critères (chantier `programme:` NAV).
 * MODULE PUR — aucun import svelte/tauri, testable sous bun.
 *
 * Le corpus est un ensemble FINI : on ne cherche pas dans du texte, on réduit
 * un ensemble par des critères validés — matière, filière, niveau. C'est le
 * motif du champ « Critères à inclure » de prepas.org.
 *
 * ⚠️ La recherche PLEIN TEXTE n'est pas ici et n'a pas à y venir : elle
 * reviendra au moteur d'indexation prévu (cf. `nav-window-rapport.md`). Ce
 * module lui prépare le terrain — il rend le PÉRIMÈTRE sur lequel ce moteur
 * cherchera, ce qui est exactement ce qui rend une recherche abordable quand le
 * corpus atteindra 2,7 Mo.
 */

import type { EntreeProgramme } from "@/programmes/catalog";

export type CategorieCritere = "matiere" | "filiere" | "niveau";

export interface Critere {
  categorie: CategorieCritere;
  /** Valeur normalisée, telle qu'elle est comparée au catalogue. */
  valeur: string;
  /** Valeur telle qu'on l'affiche à l'utilisateur. */
  libelle: string;
}

/** Deux critères désignent-ils la même chose ? */
export function memeCritere(a: Critere, b: Critere): boolean {
  return a.categorie === b.categorie && a.valeur === b.valeur;
}

// ── Manipulation des jetons ─────────────────────────────────────────────────
// Extraites du composant pour être testables : ce sont ces trois gestes que
// l'utilisateur enchaîne au clavier, et qu'une refonte du gabarit casserait
// sans bruit.

/** Pose un critère. Reposer le même est sans effet (jamais de doublon). */
export function ajouterCritere(actifs: Critere[], c: Critere): Critere[] {
  return actifs.some((a) => memeCritere(a, c)) ? actifs : [...actifs, c];
}

/** Retire le dernier critère posé (Retour arrière sur champ vide). */
export function retirerDernierCritere(actifs: Critere[]): Critere[] {
  return actifs.slice(0, -1);
}

/** Retire un critère désigné (croix du jeton). */
export function retirerCritere(actifs: Critere[], c: Critere): Critere[] {
  return actifs.filter((a) => !memeCritere(a, c));
}

function normaliser(v: string): string {
  return v.trim().toLowerCase();
}

/** Un programme satisfait-il un critère ? */
function satisfait(e: EntreeProgramme, c: Critere): boolean {
  switch (c.categorie) {
    case "matiere":
      return normaliser(e.matiere) === c.valeur;
    case "filiere":
      return e.filiere.some((f) => normaliser(f) === c.valeur);
    case "niveau":
      // Un `niveau` ABSENT vaut pour TOUTES les années (sciences industrielles,
      // informatique). L'écarter d'un filtre « seconde année » retirerait un
      // programme qui s'y applique bel et bien.
      return e.niveau === undefined || String(e.niveau) === c.valeur;
  }
}

/**
 * Programmes retenus.
 *
 * Sémantique à facettes : les catégories se combinent en **ET** (matière ET
 * filière), les valeurs d'une même catégorie en **OU** (MP ou MPI). C'est ce
 * qu'attend quiconque a déjà utilisé un tel champ : cocher une seconde filière
 * élargit, cocher une matière restreint.
 *
 * `texte` filtre en plus sur le titre, la matière et les filières — jamais sur
 * le contenu.
 */
export function filtrerProgrammes(
  catalogue: EntreeProgramme[],
  criteres: Critere[],
  texte = "",
): EntreeProgramme[] {
  const q = normaliser(texte);

  const parCategorie = new Map<CategorieCritere, Critere[]>();
  for (const c of criteres) {
    const liste = parCategorie.get(c.categorie) ?? [];
    liste.push(c);
    parCategorie.set(c.categorie, liste);
  }

  return catalogue.filter((e) => {
    for (const [, groupe] of parCategorie) {
      if (!groupe.some((c) => satisfait(e, c))) return false;
    }
    if (!q) return true;
    const champs = [e.titre, e.matiere, ...e.filiere].map(normaliser);
    return champs.some((v) => v.includes(q));
  });
}

/** Libellé affiché pour un niveau. */
function libelleNiveau(n: number): string {
  return n === 1 ? "1re année" : "2e année";
}

/**
 * Critères encore PROPOSABLES, dans l'ordre matière → filière → niveau.
 *
 * On ne propose que ce qui **discrimine réellement** : un critère déjà posé, ou
 * qui ne retirerait aucun programme de l'ensemble courant, n'apparaît pas.
 * Proposer « MP » quand tous les programmes restants sont déjà MP ne ferait
 * qu'allonger la liste sans rien apprendre.
 */
export function criteresProposables(
  catalogue: EntreeProgramme[],
  criteres: Critere[],
  texte = "",
): Critere[] {
  const q = normaliser(texte);
  const courant = filtrerProgrammes(catalogue, criteres, "");
  const out: Critere[] = [];

  const ajouter = (c: Critere) => {
    if (criteres.some((a) => memeCritere(a, c))) return;
    if (out.some((a) => memeCritere(a, c))) return;
    // Discriminant : appliquer ce critère change l'ensemble courant.
    const restant = courant.filter((e) => satisfait(e, c));
    if (restant.length === 0 || restant.length === courant.length) return;
    if (q && !normaliser(c.libelle).includes(q)) return;
    out.push(c);
  };

  for (const e of courant) ajouter({ categorie: "matiere", valeur: normaliser(e.matiere), libelle: e.matiere });
  for (const e of courant) {
    for (const f of e.filiere) ajouter({ categorie: "filiere", valeur: normaliser(f), libelle: f });
  }
  for (const e of courant) {
    if (e.niveau !== undefined) {
      ajouter({ categorie: "niveau", valeur: String(e.niveau), libelle: libelleNiveau(e.niveau) });
    }
  }
  return out;
}
