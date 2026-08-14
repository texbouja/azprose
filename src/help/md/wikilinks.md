---
parent: index
---

# Les liens entre notes — wikilinks

Le mot *wikilink* désigne un lien entre deux notes, comme sur un site web. C'est la brique de base de tout votre réseau de notes.

## Un lien simple

Pour relier la note courante à une autre note, entourez simplement le **nom** de la note cible de doubles crochets :

```markdown
J'ai lu un très bon guide sur [[prise-en-main]].
```

Au clic, la note s'ouvre dans le panneau d'aperçu (`⌘\`). L'application complète le nom pendant que vous tapez : commencez à écrire `[[co…` et la liste des notes correspondantes apparaît.

> [!note] Le nom, pas le chemin
> Le lien se fait par le **nom** de la note (sans l'extension `.md`), pas par son chemin complet. Vous pouvez donc déplacer une note dans un autre dossier sans casser les liens qui pointent vers elle — c'est tout l'intérêt du format *wikilink*.

## Afficher un texte différent — les alias

Si le nom de la note est long ou peu élégant, vous pouvez afficher un autre texte dans le lien, avec une barre verticale `|` :

```markdown
Voir [[prise-en-main|le chapitre de prise en main]].
```

Le lien affiche « le chapitre de prise en main », mais mène toujours à la note `prise-en-main`.

## Pointer vers un endroit précis — les ancres

Un *wikilink* peut cibler non seulement une note, mais aussi un **titre** précis à l'intérieur de celle-ci, avec un `#` :

```markdown
La partie la plus utile : [[wikilinks#Afficher un texte différent — les alias]].
```

Combiné avec un alias :

```markdown
La partie la plus utile : [[wikilinks#Afficher un texte différent — les alias|les alias]].
```

> [!tip] Le clic ouvre dans l'aperçu
> Un clic sur un lien ouvre la note cible dans le panneau d'aperçu de droite (`⌘\`) — vous gardez votre note en cours sous les yeux. Pour l'ouvrir dans l'éditeur principal, utilisez la vue Liens ([[vue-liens|La vue Liens]]) ou l'explorateur de fichiers.

## Cas d'usage concrets

- Dans une note de cours, reliez chaque notion à sa fiche dédiée : « la fonction exponentielle, voir [[Suites numériques]] ».
- Dans la fiche d'un élève, reliez chaque colle passée : « colle du 7 janvier — [[2026-01-07]] ».
- Dans une note de synthèse, citez toutes vos sources en une liste de liens.

C'est cette pratique — toujours relier, jamais classer — qui transforme un dossier de fichiers en véritable réseau navigable. Les liens **entrants** que cette pratique crée sont le sujet de [[vue-liens|La vue Liens]].

## Les liens vers les fichiers PDF

Les *wikilinks* fonctionnent aussi vers les fichiers PDF. Vous pouvez pointer vers une page précise, voire vers une **zone rectangulaire** de cette page :

```markdown
[[polynomes.pdf#page=12]]               — la page 12
[[polynomes.pdf#page=12&rect=100,200,400,350]]  — une zone précise de la page 12
```

Cette deuxième forme est très pratique pour citer un exercice ou une figure : la zone se copie automatiquement dans le presse-papiers quand vous la sélectionnez (maintenez `Alt` et tracez un rectangle sur le PDF). Pour l'**intégrer** directement dans votre note, ajoutez un point d'exclamation — voir [[transclusions|Embarquer une note]].

## Voir aussi

- Embarquer le contenu d'une note : [[transclusions|Embarquer une note]]
- Voir qui pointe vers vos notes : [[vue-liens|La vue Liens]]
- Le sommaire automatique de chaque note : la section *Sommaire* de la vue Liens ([[vue-liens|La vue Liens]])

#guide #wikilinks
