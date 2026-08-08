# Cas particulier : les planches de colles

Les **planches de colles** sont les fiches d'interrogation d'une note quotidienne (une fiche par élève, bloc de métadonnées + énoncé — voir [[colles]]). Elles s'impriment via le **même dialogue d'impression** que les notes, mais dans un mode dédié : c'est le cas particulier du *PrintOverlay*.

## Le point d'entrée

1. Ouvrez la **note quotidienne** du jour de colle et passez son aperçu en **mode colle** (l'icône colle de la barre d'outils de l'aperçu) — voir [[journal]].
2. Dans la barre d'outils, cliquez le bouton **imprimante** (« Imprimer »).
3. Le dialogue d'impression s'ouvre en mode *planches* : il compte les planches de la note et propose la mise en page.

## Ce qui change dans le dialogue

Le mode planches est **simplifié** par rapport au mode note :

- **plus de gabarit** — les planches utilisent toujours le **gabarit du rapport de colle** (le même visuel que le rapport envoyé par email) ;
- **plus d'« inclure les fichiers liés »** ;
- s'ajoutent la **case à cocher « Avec évaluation »** et un **compteur** indiquant le nombre de planches trouvées dans la note.

Tous les autres réglages restent disponibles : **papier, orientation, marges, colonnes, en-tête et pied de page, échelle, fonds** — voir [[print-overlay]] pour leur description.

## La case « Avec évaluation »

La case (décochée par défaut) décide si la section **Évaluation** de chaque planche — les notes par rubrique et les observations — est incluse :

| État | Contenu des planches | Usage |
|------|----------------------|-------|
| **Sans** (défaut) | Métadonnées, programme, énoncé — **sans** les notes ni les observations | La **feuille d'examen** à découper et distribuer aux élèves le jour de la colle |
| **Avec** | La planche complète, notes et observations comprises | La version **administration / archivage** de la séance |

> [!note] L'élève, lui, reçoit toujours le compte rendu complet
> Le rapport envoyé par email à chaque famille contient toujours l'évaluation (note, rubriques, observations) — la case ne concerne que l'impression des planches. Voir [[colles]].

## La mise en page par défaut

Par défaut, les planches s'impriment en **A4 paysage avec deux planches par page**, côte à côte — une feuille à découper en deux. Vous pouvez tout changer : **une planche par page** (colonne = 1) pour un format plus grand, trois par page pour économiser le papier, ou l'**orientation portrait**. Le groupe de planches d'une même page ne se sépare jamais entre deux pages.

## La planche : le gabarit du rapport

Chaque planche reprend le **gabarit du rapport de colle** configurable dans les réglages — 5 zones (titre, sous-titre, métadonnées, corps, évaluation), variables, blocs conditionnels — voir [[reglages]]. Particularités des planches imprimées :

- la **salle** est omise (le PDF est une feuille d'examen, pas un courrier — l'email la conserve) ;
- la **signature** n'apparaît dans aucun rendu ;
- la **mise en page** de la planche s'adapte à sa colonne (hauteur naturelle, fond blanc).

## Aperçu et export

Comme pour les notes : le bouton **Aperçu** ouvre la page dans une fenêtre Chromium (et **Ctrl+P** dans cette fenêtre donne l'aperçu d'impression du navigateur), le bouton **Exporter** demande l'emplacement du fichier — le nom suggéré est la note avec le suffixe `-planches` — puis écrit le PDF. La notification affiche le chemin.

## Une mémoire séparée

Les réglages du mode planches sont mémorisés **séparément** de ceux des notes (`.azprose/print-planches.json`) : vous pouvez donc avoir, par exemple, un export de notes en A4 portrait et des planches en A4 paysage sans rien reconfigurer à chaque fois.

> [!tip] Une note sans planche
> Si la note ne contient **aucune planche** (pas de bloc `colle`), le dialogue l'indique et l'export est désactivé — impossible de produire un PDF vide.

## Voir aussi

- Le cas d'usage complet des colles : [[colles]]
- Le dialogue d'impression pas à pas : [[print-overlay]]
- Le gabarit du rapport de colle : [[reglages]]
- Les notes quotidiennes : [[journal]]

#guide #impression #colles
