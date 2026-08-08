# Cas d'usage — les colles

Ce cas d'usage met en scène **M. Boujaida**, professeur de mathématiques en Terminale, qui utilise AZprose pour préparer et suivre ses colles. Il illustre en situation tout ce que le wiki permet : notes quotidiennes, liens, tags, métadonnées, backlinks.

## Le besoin

Chaque semaine, M. Boujaida interroge ses élèves à l'oral (une *colle*). Il lui faut :

- préparer une **fiche par élève** : exercices, note, remarques ;
- conserver un **historique** par élève d'une semaine sur l'autre ;
- savoir d'un coup d'œil **quels élèves** sont passés et quels thèmes ont été couverts.

## La méthode

### 1. La note du jour

Chaque jour de colle commence par une note quotidienne (voir [[journal]]), par exemple [[2026-01-07]]. Elle contient **une fiche par élève** : un bloc de métadonnées suivi de l'énoncé de la colle.

Chaque fiche est un bloc de données YAML — la matière, le colleur, l'élève, la date, le créneau, la salle, la classe, le groupe, l'email, le programme :

````markdown
---
date: 2026-01-07
---

# Colles du 7 janvier

## Séance de 8 h

```colle
matiere: Maths
colleur: M. Boujaida
eleve: Ahmed El Moujahid
date: 2026-01-07
creneau: 08:00
salle: 12
classe: Terminale 6
groupe: G1
email_eleve: ahmed.elmoujahid@exemple.ma
programme: Suites numériques — limites et convergence
```

**Exercice 1.** Soit $u$ la suite définie par $u_0 = 2$ et $u_{n+1} = u_n/2 + 1$. Montrer que $u$ est convergente et déterminer sa limite.

**Exercice 2.** Étudier la convergence de la suite $v_n = (3n^2 + n)/(n^2 - 1)$.

---

## Séance de 9 h

```colle
matiere: Maths
colleur: M. Boujaida
eleve: Youssef El Amrani
date: 2026-01-07
creneau: 09:00
salle: 12
classe: Terminale 6
groupe: G2
email_eleve: youssef.elamrani@exemple.ma
programme: Suites numériques — suites adjacentes
```
````

> [!note] Ce que l'application fait de ces blocs
> Le mode **colle** du journal — l'étoile affichée dans la barre d'outils de l'aperçu d'une note quotidienne — transforme la note en **feuille de colles** : une carte par élève, avec navigation entre les planches, saisie de l'évaluation (notes par rubrique, observations) et enregistrement direct dans le bloc de données. Voir la note d'exemple [[2026-01-07]].

### 2. Relier élèves et matières

Chaque fiche d'élève est une note dédiée. M. Boujaida relie la colle à la fiche de l'élève et à la fiche de la matière — rien de plus que des [[wikilinks]] :

```markdown
Colle du 7 janvier — [[Ahmed El Moujahid]] — thème : [[Suites numériques]].
```

### 3. Laisser les backlinks travailler

La magie opère dans la **vue Liens** (voir [[backlinks]]) :

- ouvrez [[Ahmed El Moujahid]] : la section **Backlinks** liste toutes les colles où il est interrogé — **son historique se construit tout seul** ;
- ouvrez [[Suites numériques]] : les backlinks listent toutes les séances qui ont couvert ce thème ;
- ajoutez des tags à chaque fiche d'élève (`#suivi`) et à chaque jour de colle (`#colles`) : le panneau **Tags** répond à « qui suit-on ? » et « combien de colles cette semaine ? ».

> [!tip] Le triptyque gagnant
> **Note quotidienne** (le déroulé) + **wikilinks** (les relations) + **backlinks** (les historiques automatiques). Trois gestes simples, une organisation qui se maintient toute seule.

## Aller plus loin

Le module colles de l'application propose en plus :

- **l'import du colloscope** — les listes d'élèves par classe et les créneaux, transformés en tableaux de travail ;
- **l'export en PDF** — les planches de colles imprimables, voir [[planches]] ;
- **l'envoi par email** — le rapport de colle de chaque élève (note, rubriques, observations) envoyé directement à sa famille, avec copie archivée dans le coffre.

## Voir aussi

- Le principe des notes quotidiennes : [[journal]]
- Les liens entrants qui font les historiques : [[backlinks]]
- Les étiquettes de suivi : [[tags]]
- Les données en tête de note : [[front-matter]]

#guide #colles
