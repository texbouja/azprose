# 1. Prise en main

Ce chapitre vous fait faire le tour d'AZprose en cinq minutes. À la fin, vous saurez ouvrir un projet, créer une note, l'enregistrer et passer de l'écriture à l'aperçu.

## Ouvrir un projet

Un projet AZprose est un simple **dossier** sur votre ordinateur, appelé *vault* (coffre). Au premier lancement, l'application vous demande de choisir ce dossier.

- Pour ouvrir un dossier plus tard : raccourci `⌘⇧O` (ou `Ctrl+⇧O` sur Windows/Linux), ou commande **Ouvrir un projet** dans la palette de commandes (`⌘⇧P` / `Ctrl+⇧P`).

> [!tip] Un dossier, pas une application
> Tous vos fichiers restent de simples fichiers Markdown dans ce dossier. Vous pouvez les lire, les copier, les sauvegarder avec n'importe quel outil — AZprose ne les enferme pas dans un format propriétaire.

## Créer une note

1. Appuyez sur `⌘N` (ou `Ctrl+N`) pour créer un nouveau fichier, ou créez-le dans l'explorateur (la barre latérale gauche).
2. Donnez-lui un nom parlant : c'est ce nom qui servira à le relier aux autres notes (voir le chapitre 3, [[03-wikilinks|Les liens entre notes]]).
3. Écrivez ! Le texte suit la syntaxe Markdown : `# Titre`, `## Sous-titre`, `**gras**`, `*italique*`, listes, etc.

## Trois façons de travailler

L'éditeur propose trois modes, que vous changez avec les raccourcis `⌘1`, `⌘2` et `⌘3` (ou `Ctrl+1`, `Ctrl+2`, `Ctrl+3`) :

| Raccourci | Mode | Usage |
|-----------|------|-------|
| `⌘1` | Source | Vous voyez le texte Markdown brut. |
| `⌘2` | Écriture | La mise en forme s'applique pendant que vous écrivez. |
| `⌘3` | Aperçu | Vous voyez le résultat final, comme sur une page web. |

Le panneau d'aperçu du côté droit (`⌘\` ou `Ctrl+\`) affiche le rendu en continu pendant que vous écrivez — très pratique pour vérifier son travail sans changer de mode.

## Enregistrer

- `⌘S` (ou `Ctrl+S`) enregistre la note courante. Une icône dans la barre d'onglets indique que le fichier a été modifié.

> [!tip] L'aperçu suit votre curseur
> Depuis la toute dernière version, quand vous enregistrez, l'aperçu de droite **se déplace automatiquement vers la ligne où se trouve votre curseur** dans l'éditeur. Un geste très utile pour relire exactement ce que vous venez d'écrire : modifiez, `⌘S`, et relisez.
>
> L'inverse fonctionne aussi : un double-clic sur un paragraphe de l'aperçu ramène l'éditeur à cette ligne.

## Les notes de bas de page

Vous pouvez ajouter des *footnotes* (notes de bas de page) : un petit renvoi dans le texte, la définition en bas de page. Écrivez `[^1]` dans le texte, et la définition n'importe où dans la note :

```markdown
La suite de Fibonacci[^1] apparaît partout en mathématiques.

[^1]: 1, 1, 2, 3, 5, 8… chaque terme est la somme des deux précédents.
```

Une note très courte peut aussi se définir directement sur place, entre crochets : `^[note directement dans le texte]`.^[C'est ce que nous venons de faire — la voilà, affichée en bas de page !]

> [!note] Markdown simplifié
> Ce chapitre couvre l'essentiel de la syntaxe : titres, gras, italique, listes, notes de bas de page. Le guide détaille ensuite ce qui fait la force d'AZprose : les liens (chapitre 3, [[03-wikilinks|Les liens entre notes]]), les encadrés (chapitre 5, [[05-callouts|Les encadrés]]) et les étiquettes (chapitre 6, [[06-vue-liens|La vue Liens]]).

## La barre latérale gauche

La barre latérale gauche contient trois vues, accessibles par les trois icônes en haut :

1. **Explorateur** (icône dossier) — l'arborescence de vos fichiers.
2. **Journal** (icône calendrier) — vos notes quotidiennes, classées par mois (voir le chapitre 8, [[08-journal|Les notes quotidiennes]]).
3. **Liens** (icône lien) — le sommaire de la note, ses liens entrants (*backlinks*) et les tags du coffre (voir le chapitre 6, [[06-vue-liens|La vue Liens]]).

## La palette de commandes

Appuyez sur `⌘⇧P` (ou `Ctrl+⇧P`) : une fenêtre s'ouvre avec toutes les actions possibles. Tapez quelques lettres pour filtrer — par exemple « col » pour trouver les commandes de colles, « pdf » pour l'export. C'est le moyen le plus rapide de découvrir ce que l'application sait faire.

## Continuer

- Lire le chapitre suivant : [[03-wikilinks|Les liens entre notes]] — relier vos notes entre elles.
- Consulter l'aide-mémoire : chapitre 2, [[02-raccourcis|Les raccourcis]].

#guide #premiers-pas
