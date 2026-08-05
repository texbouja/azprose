# La vue Liens — backlinks et sommaire

Quand vous écrivez `[[une-note]]` dans vos notes, vous créez un lien **sortant**. Mais l'intérêt d'un réseau, c'est aussi de connaître les liens **entrants** : quelles notes pointent vers la note que je suis en train de lire ? Ce sont les *backlinks* (liens retour).

## La vue Liens

La vue **Liens** est la troisième icône de la barre latérale gauche (le maillon de chaîne). Elle s'ouvre aussi avec la commande **Ouvrir les liens** de la palette de commandes. Elle contient **trois sections**, qui se replient et se déplient comme les sections de l'explorateur :

1. **Sommaire** — le plan de la note ouverte (ses titres), cliquable pour sauter directement au passage voulu.
2. **Backlinks** — les notes qui pointent vers la note ouverte, avec le badge du nombre de liens.
3. **Tags** — tous les tags du coffre, triés par fréquence, avec le badge du nombre de notes par tag.

> [!tip] Le badge, c'est le compteur
> Le petit nombre affiché à droite du titre d'une section est un compteur : nombre de sections dans le sommaire, de liens entrants pour la note, de notes pour chaque tag.

## Lire les backlinks

Ouvrez une note, puis regardez la section **Backlinks** : chaque entrée est une note qui contient un `[[lien]]` vers la note courante, avec l'extrait du passage concerné. Un clic vous y amène.

> [!example] L'illustration avec les colles
> Le coffre d'exemples de ce guide contient trois notes liées :
>
> - [[2026-01-07]] — la note quotidienne du jour de colle, qui contient les planches de colle et des liens vers l'élève et la matière ;
> - [[Ahmed El Moujahid]] — la fiche de l'élève ;
> - [[Suites numériques]] — la fiche de la matière.
>
> Ouvrez [[Ahmed El Moujahid]] : la section Backlinks affiche la note du 7 janvier — c'est elle qui le mentionne. Ouvrez [[Suites numériques]] : les backlinks listent toutes les notes de colle qui y font référence. Vous voyez d'un coup d'œil **qui parle de quoi**, sans avoir à chercher.

## Pourquoi c'est puissant

Les backlinks transforment votre coffre en réseau **bidirectionnel** :

- vous n'avez pas besoin de penser à « ranger » : il suffit d'écrire `[[lien]]` et la relation est créée dans les deux sens ;
- une fiche d'élève devient automatiquement son **historique** : chaque colle qui le mentionne apparaît dans ses backlinks ;
- une fiche de matière devient sa **liste de séances** : toutes les notes de cours qui la citent.

C'est exactement le mécanisme qu'exploite le cas d'usage [[colles]].

## Cas d'usage concrets

- **Suivi d'élève** : la fiche de l'élève accumule ses colles, ses exercices, ses remarques — sans aucun classement manuel.
- **Note pivot** : une note « Objectifs de l'année » reçoit les backlinks de toutes les notes qui la citent.
- **Brouillon vivant** : reliez chaque note de cours à sa note de révision ; les backlinks de la révision listeront tout ce qu'elle doit couvrir.

> [!note] Quand le badge est vide
> Une note sans backlinks n'a pas encore de relations entrantes. C'est souvent le signe qu'elle mérite d'être reliée — ou qu'elle est orpheline et peut être archivée.

## Voir aussi

- Créer des liens : [[wikilinks]]
- Étiqueter ses notes : [[tags]]
- Le cas d'usage qui combine tout : [[colles]]

#guide #backlinks
