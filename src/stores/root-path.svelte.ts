/**
 * Racine du vault courant, partagée entre composants de preview (résolution
 * wikilinks, transclusions, caches, archivage colles…).
 *
 * ⚠️ Ce module ne DÉTIENT plus rien : il réexporte la racine de
 * `lib/vault.svelte.ts`, seule autorité depuis le 2026-08-31. Il ne subsiste
 * que pour ses ~30 consommateurs, dont le chemin d'import reste ainsi stable.
 * Il n'y a plus de `setRootPath` : la racine se pose par `vault.ouvrirCoffre()`
 * et par lui seul — c'est l'existence de DEUX détenteurs (celui-ci et le
 * `const projectRoot` d'app.svelte), mis à jour par des chemins différents, qui
 * laissait le scope localStorage et le miroir disque viser deux projets
 * distincts.
 *
 * INVARIANT : en usage normal, la racine n'est JAMAIS nulle. L'initialisation
 * le garantit structurellement :
 *  - au démarrage, si aucun dossier projet n'est connu (?root= absent et aucun
 *    projet mémorisé), l'éditeur n'est pas monté — une porte de projet
 *    bloquante (ProjectGate) force l'ouverture d'un dossier avant tout usage ;
 *  - fermer le projet ramène à cette porte (la racine repasse à null de façon
 *    TRANSITOIRE, l'éditeur redevient inutilisable).
 * Les consommateurs n'ont donc pas à traiter null comme un état réel ; les
 * gardes `?? undefined` éparses ne sont que des filets défensifs.
 */

import { racine } from "@/lib/vault.svelte";

export function getRootPath(): string | null {
  return racine();
}
