# Embarquer une note — transclusions

Une *transclusion* permet d'**intégrer le contenu d'une note dans une autre**, au fil du texte — au lieu d'un simple lien qu'il faut aller ouvrir. C'est l'équivalent d'un extrait incrusté, qui se met à jour tout seul.

## Le principe

Un *wikilink* s'écrit avec `[[doubles crochets]]`. Pour **transclure**, ajoutez un point d'exclamation devant :

```markdown
![[nom-de-la-note]]
```

Le contenu complet de la note cible s'affiche alors à cet endroit.

## Transclure une section

Le plus souvent, on ne veut qu'une partie de la note. Utilisez `#` et le titre de la section :

```markdown
![[wikilinks#Un lien simple]]
```

Voici le résultat, rendu en direct par l'application — c'est bien le contenu de la page [[wikilinks]] qui s'affiche ici :

![[wikilinks#Un lien simple]]

> [!note] Comment ça marche
> La transclusion copie le contenu de la section à l'endroit où vous l'insérez. Si vous modifiez la note source, l'affichage se met à jour automatiquement partout où elle est transclue. C'est une inclusion **vivante**, pas un copier-coller figé.

## Transclure un paragraphe précis — les blocs

Vous pouvez aussi cibler un **paragraphe précis** (un *bloc*), sans titre : ajoutez une ancre `^identifiant` à la fin de ce paragraphe dans la note source, puis référencez-la avec `![[note#^identifiant]]` :

Dans la note source :

```markdown
Les transclusions respectent toujours la profondeur maximale. ^limite
```

Dans votre note :

```markdown
![[transclusions#^limite]]
```

## Transclure une zone de PDF

Comme les *wikilinks*, les transclusions fonctionnent avec les PDF — la zone rectangulaire s'affiche alors comme une image intégrée :

```markdown
![[polynomes.pdf#page=12&rect=100,200,400,350]]
```

## Quelques règles à connaître

- **Une note peut transclure une autre note** ; l'application empêche les boucles (une note qui transclurait son contenu, directement ou indirectement).
- La profondeur d'imbrication est limitée : si une note transclue une note qui transclue une note…, la chaîne s'arrête automatiquement après quelques niveaux, pour éviter les pages infinies.

> [!warning] À utiliser avec mesure
> La transclusion est un outil puissant mais il peut rendre une note difficile à lire, car une partie du contenu affiché ne vient pas de la note elle-même. Réservez-la aux éléments vraiment partagés : un encadré récurrent, un planning commun, une définition de référence. Pour une simple mention, préférez le *wikilink* [[wikilinks|simple]].

## Cas d'usage concrets

- Dans un cours, intégrez la **définition de référence** d'une fiche compagnon, plutôt que de la recopier.
- Dans une note de réunion, intégrez le **compte rendu de la semaine** depuis votre note quotidienne (voir [[journal]]).
- Dans le cas des colles, intégrez le **programme officiel** d'une matière dans chaque fiche de colle — voir [[colles]].

## Voir aussi

- Les liens simples : [[wikilinks]]
- Les encadrés qui enrichissent vos notes : [[callouts]]

#guide #transclusion
