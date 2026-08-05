# Les étiquettes — tags

Un *tag* (étiquette) est un mot-clé que vous accrochez à une note pour la retrouver plus tard. Il s'écrit avec un `#` suivi du mot :

```markdown
#maths
```

Un tag peut être composé de plusieurs mots reliés par des tirets :

```markdown
#revision-bac
```

## Pourquoi taguez ?

Les tags servent à **retrouver** et à **agréger** :

- retrouver toutes les notes d'un même sujet d'un coup d'œil ;
- construire des listes de travail (« tout ce qui est #a-faire ») ;
- marquer la nature d'une note : #idee, #question, #source, #revision.

> [!tip] Peu de tags, mais bien choisis
> La tentation est grande de multiplier les tags. Résistez : un tag n'est utile que s'il regroupe plusieurs notes. Si un tag ne sert qu'une fois, c'est sans doute un sujet qui mérite plutôt une note (et un [[wikilinks|lien]]).

## Le panneau des tags

Les tags de tout votre coffre sont réunis dans la **section Tags** de la vue Liens — la troisième icône de la barre latérale gauche (voir [[backlinks]]). Vous y voyez :

- chaque tag, avec le **nombre de notes** qui le contiennent (le badge à droite) ;
- au clic, la liste des notes qui portent ce tag ;
- un bouton de rafraîchissement en haut de la section.

> [!note] Quels tags sont listés ?
> Le panneau collecte les tags écrits avec le `#` dans le corps des notes (la forme `#tag`). Les tags placés dans les métadonnées en tête de note suivent d'autres règles — voir [[front-matter]].

## Combiner tags et liens

Les tags et les [[wikilinks|liens]] sont complémentaires :

- le **lien** crée une relation précise et bidirectionnelle (« cette colle concerne cet élève ») ;
- le **tag** regroupe sans relation explicite (« tout ce qui concerne les maths »).

Exemple pour une colle : la note du jour porte le tag `#colles` (retrouvable dans le panneau Tags) et contient des liens vers l'élève et la matière (retrouvables dans les [[backlinks|backlinks]] de ces notes). Voir le cas d'usage complet : [[colles]].

## Cas d'usage concrets

- `#a-revoir` — les notions à retravailler ; on le retire quand c'est acquis.
- `#exam` — tout ce qui prépare un examen.
- `#perso` / `#travail` — séparer les domaines de vie.
- `#idee` — les idées en vrac, avant de devenir de vraies notes.
- `#source` — les notes qui citent une source extérieure.

> [!example] Le fil rouge des colles
> Dans le cas d'usage [[colles]], chaque note de colle est taguée `#colles`, chaque fiche d'élève `#suivi`. Le panneau Tags permet alors de répondre en une seconde à « quels élèves sont suivis en ce moment ? » et « combien de colles cette semaine ? ».

## Voir aussi

- Les métadonnées en tête de note : [[front-matter]]
- Le panneau des tags et des liens entrants : [[backlinks]]
- Les notes quotidiennes où l'on tague beaucoup : [[journal]]

#guide #tags
