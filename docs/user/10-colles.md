# 10. Les colles — cas d'usage complet

Ce cas d'usage met en scène **M. Boujaida**, professeur de mathématiques en Terminale, qui utilise AZprose pour préparer et suivre ses colles. Il illustre en situation tout ce que le wiki permet : notes quotidiennes, liens, tags, métadonnées, backlinks.

## Le besoin

Chaque semaine, M. Boujaida interroge ses élèves à l'oral (une *colle*). Il lui faut :

- préparer une **fiche par élève** : exercices, note, remarques ;
- conserver un **historique** par élève d'une semaine sur l'autre ;
- savoir d'un coup d'œil **quels élèves** sont passés et quels thèmes ont été couverts.

## La méthode

### 1. La note du jour

Chaque jour de colle commence par une note quotidienne (voir le chapitre 8, [[08-journal|Les notes quotidiennes]]), par exemple [[2026-01-07]]. Elle contient **une fiche par élève** : un bloc de métadonnées suivi de l'énoncé de la colle.

Chaque fiche est un bloc de données YAML — la matière, le colleur, l'élève, la date, le créneau, la salle, la classe, le groupe, l'email, le programme. La note porte aussi `type: colle` dans ses métadonnées : c'est ce marqueur qui active la **vue planches** (l'étoile dans la barre d'outils) — peu importe l'emplacement du fichier ou le nombre de fiches :

````markdown
---
date: 2026-01-07
type: colle
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

---
````

> [!note] Ce que l'application fait de ces blocs
> Le mode **colle** — l'étoile affichée dans la barre d'outils de l'aperçu d'une note dont les métadonnées portent `type: colle` — transforme la note en **feuille de colles** : une carte par élève, avec navigation entre les planches, saisie de l'évaluation (notes par rubrique, observations) et enregistrement direct dans le bloc de données. Voir la note d'exemple [[2026-01-07]].

> [!tip] Donnez vie aux données dans le texte
> Les valeurs du front matter de la note du jour sont injectables dans votre compte rendu : avec `date: 2026-01-07` en tête de note, écrivez « Bilan de la journée du {{date}} » et le rendu affiche la date. Ajoutez vos propres champs (`matiere`, `theme`…) et utilisez-les dans le texte — la résolution se fait à chaque rendu, la source ne bouge pas. Voir le chapitre 7, [[07-front-matter|Les métadonnées]].

### 2. Relier élèves et matières

Chaque fiche d'élève est une note dédiée. M. Boujaida relie la colle à la fiche de l'élève et à la fiche de la matière — rien de plus que des [[03-wikilinks|wikilinks]] :

```markdown
Colle du 7 janvier — [[Ahmed El Moujahid]] — thème : [[Suites numériques]].
```

### 3. Laisser les backlinks travailler

La magie opère dans la **vue Liens** (voir le chapitre 6, [[06-vue-liens|La vue Liens]]) :

- ouvrez [[Ahmed El Moujahid]] : la section **Backlinks** liste toutes les colles où il est interrogé — **son historique se construit tout seul** ;
- ouvrez [[Suites numériques]] : les backlinks listent toutes les séances qui ont couvert ce thème ;
- ajoutez des tags à chaque fiche d'élève (`#suivi`) et à chaque jour de colle (`#colles`) : le panneau **Tags** répond à « qui suit-on ? » et « combien de colles cette semaine ? ».

> [!tip] Le triptyque gagnant
> **Note quotidienne** (le déroulé) + **wikilinks** (les relations) + **backlinks** (les historiques automatiques). Trois gestes simples, une organisation qui se maintient toute seule.

## Aller plus loin

Le module colles de l'application propose en plus :

- **l'import du colloscope** — les listes d'élèves par classe et les créneaux, transformés en tableaux de travail ;
- **l'export en PDF** — les planches de colles imprimables, voir le chapitre 9, [[09-impression#Les planches de colles|la section planches]] ;
- **l'envoi par email** — le rapport de colle de chaque élève (note, rubriques, observations) envoyé directement à sa famille, avec copie archivée dans le coffre. Le visuel du rapport se règle dans les réglages d'impression (chapitre 9, [[09-impression#Gabarit du rapport de colle|gabarit du rapport de colle]]).

## Voir aussi

- Le principe des notes quotidiennes : chapitre 8, [[08-journal|Les notes quotidiennes]]
- Les liens entrants qui font les historiques : chapitre 6, [[06-vue-liens|La vue Liens]]
- Les données en tête de note : chapitre 7, [[07-front-matter|Les métadonnées]]
- L'impression des planches : chapitre 9, [[09-impression#Les planches de colles|Imprimer en PDF]]

#guide #colles
