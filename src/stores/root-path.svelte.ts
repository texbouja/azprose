/**
 * Racine du vault courant (projet ouvert), partagée entre composants de
 * preview (résolution wikilinks, transclusions, caches, archivage colles…).
 *
 * INVARIANT : en usage normal, `rootPath` n'est JAMAIS nul. L'initialisation
 * de l'application le garantit structurellement :
 *  - au démarrage, si aucun dossier projet n'est connu (?root= absent et liste
 *    de dossiers vide), l'éditeur n'est pas monté — une porte de projet
 *    bloquante (ProjectGate) force l'ouverture d'un dossier avant tout usage ;
 *  - fermer le DERNIER dossier ramène à cette porte (rootPath repasse à null
 *    de façon TRANSITOIRE, l'éditeur redevient inutilisable).
 * Les consommateurs n'ont donc pas à traiter null comme un état réel ; les
 * gardes `?? undefined` éparses ne sont que des filets défensifs.
 */

let _rootPath: string | null = $state(null);

export function getRootPath(): string | null {
  return _rootPath;
}

export function setRootPath(p: string | null): void {
  _rootPath = p;
}
