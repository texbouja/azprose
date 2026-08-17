/**
 * Catalogue des programmes officiels — métadonnées seules.
 *
 * MODULE PUR — aucun import svelte/tauri, testable sous bun.
 *
 * Jumeau de `src/help/catalog.ts`. Il alimente la complétion `programme:` de la
 * barre d'adresse NAV et le filtrage par critères (matière, filière, niveau) :
 * un index de RECHERCHE, jamais un ordre de lecture.
 *
 * ⚠️ Le CONTENU des programmes n'est pas ici, et ne doit jamais y entrer. Le
 * corpus pèse 268 Ko pour quatre programmes et visera les 2,7 Mo à trente : il
 * vit dans son propre chunk, chargé à la demande par ce qui en a besoin
 * (l'assistant aujourd'hui). Le catalogue, lui, est chargé au démarrage — il
 * doit rester de l'ordre du kilo-octet.
 *
 * Le CONTENU de ce module est GÉNÉRÉ par `scripts/build-corpus.mjs` depuis
 * `corpus/` — voir `catalog-data.ts`.
 */

import { catalogue as CATALOGUE, CORPUS_VERSION } from "./catalog-data";

/** Une entrée du catalogue : ce qu'il faut pour filtrer et pour ouvrir. */
export interface EntreeProgramme {
  /** Nom du fichier dans le dépôt applicatif (`$APPDATA/programmes/`). */
  fichier: string;
  /** Identifiant stable, celui que l'utilisateur choisit dans les réglages. */
  id: string;
  /** Titre lisible (premier `# ` du document). */
  titre: string;
  /** Nom complet, minuscules sans accent : `mathematiques`, `physique`… */
  matiere: string;
  /** Classes concernées, telles que les enseignants les nomment. */
  filiere: string[];
  /** 1 ou 2. **Absent** = programme valable pour toutes les années (SI, info). */
  niveau?: number;
}

export const catalogue: EntreeProgramme[] = CATALOGUE as EntreeProgramme[];

/**
 * Version du corpus livré — hash de son contenu. Le dépôt applicatif la compare
 * à son stamp pour ne réécrire que si le contenu a changé.
 */
export { CORPUS_VERSION };
