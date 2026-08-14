---
parent: index
---

# La vue Liens — sommaire, backlinks et tags

Quand vous écrivez `[[une-note]]` dans vos notes, vous créez un lien **sortant**. Mais l'intérêt d'un réseau, c'est aussi de connaître les liens **entrants** : quelles notes pointent vers la note que je suis en train de lire ? Ce sont les *backlinks* (liens retour). La **vue Liens** rassemble, en un seul endroit de la barre latérale gauche, le sommaire de la note, ses backlinks et les tags du coffre.

## La vue Liens

La vue **Liens** est la troisième icône de la barre latérale gauche (le maillon de chaîne). Elle s'ouvre aussi avec la commande **Ouvrir les liens** de la palette de commandes. Elle contient **trois sections**, qui se replient et se déplient comme les sections de l'explorateur :

1. **Sommaire** — le plan de la note ouverte (ses titres), cliquable pour sauter directement au passage voulu.
2. **Backlinks** — les notes qui pointent vers la note ouverte, avec le badge du nombre de liens.
3. **Tags** — tous les tags du coffre, triés par fréquence, avec le badge du nombre de notes par tag.

> [!tip] Le badge, c'est le compteur
> Le petit nombre affiché à droite du titre d'une section est un compteur : nombre de sections dans le sommaire, de liens entrants pour la note, de notes pour chaque tag.

## Le sommaire

La section **Sommaire** affiche le plan de la note ouverte — ses titres, du premier au dernier niveau. Un clic sur un titre fait défiler la note jusqu'au passage voulu. Pour ce guide, le sommaire affiche le **plan complet du manuel** : la liste des chapitres, chacun dépliable jusqu'à ses sections — c'est la table des matières du guide, toujours visible pendant la lecture.

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

C'est exactement le mécanisme qu'exploite le cas d'usage des colles ([[colles|Les colles]]).

## Les étiquettes — tags

Un *tag* (étiquette) est un mot-clé que vous accrochez à une note pour la retrouver plus tard. Il s'écrit avec un `#` suivi du mot :

```markdown
#maths
```

Un tag peut être composé de plusieurs mots reliés par des tirets :

```markdown
#revision-bac
```

Les tags servent à **retrouver** et à **agréger** :

- retrouver toutes les notes d'un même sujet d'un coup d'œil ;
- construire des listes de travail (« tout ce qui est #a-faire ») ;
- marquer la nature d'une note : #idee, #question, #source, #revision.

> [!tip] Peu de tags, mais bien choisis
> La tentation est grande de multiplier les tags. Résistez : un tag n'est utile que s'il regroupe plusieurs notes. Si un tag ne sert qu'une fois, c'est sans doute un sujet qui mérite plutôt une note (et un [[wikilinks|lien]]).

### Le panneau des tags

Les tags de tout votre coffre sont réunis dans la **section Tags** de la vue Liens. Vous y voyez :

- chaque tag, avec le **nombre de notes** qui le contiennent (le badge à droite) ;
- au clic, la liste des notes qui portent ce tag ;
- un bouton de rafraîchissement en haut de la section.

> [!note] Quels tags sont listés ?
> Le panneau collecte les tags écrits avec le `#` dans le corps des notes (la forme `#tag`). Les tags placés dans les métadonnées en tête de note suivent d'autres règles — voir [[front-matter|Les métadonnées]].

## Combiner tags et liens

Les tags et les [[wikilinks|liens]] sont complémentaires :

- le **lien** crée une relation précise et bidirectionnelle (« cette colle concerne cet élève ») ;
- le **tag** regroupe sans relation explicite (« tout ce qui concerne les maths »).

Exemple pour une colle : la note du jour porte le tag `#colles` (retrouvable dans le panneau Tags) et contient des liens vers l'élève et la matière (retrouvables dans les backlinks de ces notes). Voir le cas d'usage complet : [[colles|Les colles]].

## Cas d'usage concrets

- **Suivi d'élève** : la fiche de l'élève accumule ses colles, ses exercices, ses remarques — sans aucun classement manuel.
- **Note pivot** : une note « Objectifs de l'année » reçoit les backlinks de toutes les notes qui la citent.
- **Brouillon vivant** : reliez chaque note de cours à sa note de révision ; les backlinks de la révision listeront tout ce qu'elle doit couvrir.
- `#a-revoir` — les notions à retravailler ; on le retire quand c'est acquis.
- `#exam` — tout ce qui prépare un examen.
- `#perso` / `#travail` — séparer les domaines de vie.

> [!note] Quand le badge est vide
> Une note sans backlinks n'a pas encore de relations entrantes. C'est souvent le signe qu'elle mérite d'être reliée — ou qu'elle est orpheline et peut être archivée.

> [!example] Le fil rouge des colles
> Dans le cas d'usage des colles ([[colles|Les colles]]), chaque note de colle est taguée `#colles`, chaque fiche d'élève `#suivi`. Le panneau Tags permet alors de répondre en une seconde à « quels élèves sont suivis en ce moment ? » et « combien de colles cette semaine ? ».

## Voir aussi

- Créer des liens : [[wikilinks|Les liens entre notes]]
- Les métadonnées en tête de note : [[front-matter|Les métadonnées]]
- Les notes quotidiennes où l'on tague beaucoup : [[journal|Les notes quotidiennes]]
- Le cas d'usage qui combine tout : [[colles|Les colles]]

#guide #backlinks #tags
