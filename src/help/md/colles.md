---
parent: index
---

# Les colles — cas d'usage complet

Ce cas d'usage met en scène **M. Boujaida**, professeur de mathématiques en Terminale, qui utilise AZprose pour préparer et suivre ses colles. Il illustre en situation tout ce que le wiki permet : notes quotidiennes, liens, tags, métadonnées, backlinks.

## Le besoin

Chaque semaine, M. Boujaida interroge ses élèves à l'oral (une *colle*). Il lui faut :

- préparer une **fiche par élève** : exercices, note, remarques ;
- conserver un **historique** par élève d'une semaine sur l'autre ;
- savoir d'un coup d'œil **quels élèves** sont passés et quels thèmes ont été couverts.

## La méthode

### 1. La note du jour

Chaque jour de colle commence par une note quotidienne (voir [[journal|Les notes quotidiennes]]), par exemple [[2026-01-07]]. Elle contient **une fiche par élève** : un bloc de métadonnées suivi de l'énoncé de la colle.

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
> Les valeurs du front matter de la note du jour sont injectables dans votre compte rendu : avec `date: 2026-01-07` en tête de note, écrivez « Bilan de la journée du {{date}} » et le rendu affiche la date. Ajoutez vos propres champs (`matiere`, `theme`…) et utilisez-les dans le texte — la résolution se fait à chaque rendu, la source ne bouge pas. Voir [[front-matter|Les métadonnées]].

### 2. Relier élèves et matières

Chaque fiche d'élève est une note dédiée. M. Boujaida relie la colle à la fiche de l'élève et à la fiche de la matière — rien de plus que des [[wikilinks|wikilinks]] :

```markdown
Colle du 7 janvier — [[Ahmed El Moujahid]] — thème : [[Suites numériques]].
```

### 3. Laisser les backlinks travailler

La magie opère dans la **vue Liens** (voir [[vue-liens|La vue Liens]]) :

- ouvrez [[Ahmed El Moujahid]] : la section **Backlinks** liste toutes les colles où il est interrogé — **son historique se construit tout seul** ;
- ouvrez [[Suites numériques]] : les backlinks listent toutes les séances qui ont couvert ce thème ;
- ajoutez des tags à chaque fiche d'élève (`#suivi`) et à chaque jour de colle (`#colles`) : le panneau **Tags** répond à « qui suit-on ? » et « combien de colles cette semaine ? ».

> [!tip] Le triptyque gagnant
> **Note quotidienne** (le déroulé) + **wikilinks** (les relations) + **backlinks** (les historiques automatiques). Trois gestes simples, une organisation qui se maintient toute seule.

## Vos colles dans le calendrier

Une fois le colloscope importé, **vos séances apparaissent d'elles-mêmes dans
le calendrier**, dans une catégorie *Colles* qui a sa propre couleur et se
masque d'un clic comme les autres.

> [!important] Renseignez votre nom de colleur
> Seules **vos** colles s'affichent, reconnues par *Réglages* (`⌘,`) → *Profil*
> → **Nom de colleur**. Tant que ce champ est vide, le calendrier n'en montre
> aucune — un colloscope en compte plusieurs centaines, réparties entre tous
> les colleurs de l'établissement. Écrivez-le comme il vous chante : la casse,
> les accents et la civilité n'ont pas d'importance, `Boujaida` reconnaît
> `M. BOUJAIDA`.

Chaque séance porte **les élèves concernés**, pas seulement le nom du groupe :
c'est ce qui permet de traiter les absences.

### Décaler, ajourner

Glissez une colle dans la journée pour la **décaler**, ou vers un autre jour
pour l'**ajourner** — les reports ne sont pas rares. Dans les deux cas, c'est
le **colloscope lui-même** qui est corrigé : le tableau et la grille suivent
aussitôt, et vous retrouverez le changement en imprimant vos planches.

> [!note] Le calendrier ne stocke rien
> Vos colles ne sont pas recopiées dans le calendrier : elles y sont
> *affichées* depuis le colloscope. C'est ce qui garantit qu'une même séance
> ne peut jamais apparaître en double, et qu'un ré-import ne laisse pas
> derrière lui les colles de l'import précédent.

### Programmer un rattrapage

Un élève manque à l'appel ? Créez un événement dans le calendrier *Colles*,
indiquez les élèves concernés dans **Assigné à** — la liste se complète toute
seule avec les élèves du colloscope — et le rattrapage **s'ajoute au
colloscope** de leur classe.

C'est aussi ainsi qu'on restreint une séance existante à une partie du groupe :
modifiez ses élèves, et la séance ne vaudra plus que pour eux.

> [!warning] Une colle ne se supprime pas depuis le calendrier
> L'application refuse, et c'est volontaire : une colle se retire du
> colloscope, pas de la vue qui l'affiche.

### Ce qu'un ré-import écrase, et ce qu'il garde

Réimporter un colloscope **régénère** les séances : vos décalages et vos
ajournements sont donc remplacés par ce que dit le nouveau fichier. C'est le
comportement voulu — le fichier fait foi.

Vos **rattrapages, eux, sont conservés** et reportés dans les nouveaux
tableaux. L'application vous dit combien, à la fin de l'import.

## Aller plus loin

Le module colles de l'application propose en plus :

- **l'import du colloscope** — les listes d'élèves par classe et les créneaux, transformés en tableaux de travail ;
- **l'export en PDF** — les planches de colles imprimables, voir [[impression#Les planches de colles|la section planches]] ;
- **l'envoi par email** — le rapport de colle de chaque élève (note, rubriques, observations) envoyé directement à sa famille, avec copie archivée dans le coffre. Le visuel du rapport se règle dans les réglages d'impression ([[impression#Gabarit du rapport de colle|gabarit du rapport de colle]]).

## Voir aussi

- Le principe des notes quotidiennes : [[journal|Les notes quotidiennes]]
- Les liens entrants qui font les historiques : [[vue-liens|La vue Liens]]
- Les données en tête de note : [[front-matter|Les métadonnées]]
- L'impression des planches : [[impression#Les planches de colles|Imprimer en PDF]]

#guide #colles
