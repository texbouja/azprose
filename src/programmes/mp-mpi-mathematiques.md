---
id: mp-mpi-mathematiques
filiere: [MP, MPI]
matiere: mathematiques
niveau: 2
source: "Annexe 1 — Programme de mathématiques, MESRI 2021"
statut: specimen
couverture:
  - Structures algébriques usuelles
  - Réduction des endomorphismes et des matrices carrées
  - Endomorphismes d'un espace euclidien
---

# Programme de mathématiques — MP, MPI

<!-- SPÉCIMEN DE RÉFÉRENCE — trois rôles :
     1. GABARIT des futures transcriptions (le format normatif, c'est CE
        fichier, pas une description ailleurs) ;
     2. exemplaire d'ILLUSTRATION à la préparation (buildtime) ;
     3. FIXTURE des tests du noyau programme (runtime).
     Trois sections transcrites sur douze — choisies parce qu'elles couvrent
     TOUS les cas de figure du format, y compris une exclusion portée par un
     bandeau de section. -->

> ⚠️ **Document PARTIEL.** `statut: specimen` et le champ `couverture` du
> front matter énumèrent les seules sections transcrites. Toute notion
> relevant d'une autre section du programme officiel est **hors du périmètre
> de ce fichier** : le verdict attendu est alors `indetermine` (« section non
> transcrite »), **jamais** `hors`.

## Comment lire ce document

Transcription structurée d'un programme officiel. Le texte des items et des
commentaires est **celui du document source** ; seuls les **intitulés en gras**
sont ajoutés — ils rendent explicite ce que la mise en page d'origine exprimait
par la position en colonne (contenus à gauche, commentaires à droite).

| Élément | Ce qu'il signifie | Portée |
|---|---|---|
| Puce **sans intitulé** | **exigible**, sans restriction | l'item |
| `**Commentaire.**` | précision, notation, capacité attendue — **ne restreint rien** | l'item qui précède |
| `**Limite.**` | restriction de portée ou d'ambition | l'item qui précède |
| `**Non exigible.**` | au programme, mais non exigible (démonstration, activité) | l'item qui précède |
| `**Hors programme.**` | **exclu** — ne doit pas être traité, ne peut faire l'objet d'aucune évaluation | l'item qui précède |
| Citation `>` en tête de **section** | cadre, objectifs, portée | toute la section |
| Citation `>` en tête de **sous-section** | hypothèse de travail | toute la sous-section |

À savoir, faute de quoi la lecture est faussée :

- **L'absence d'intitulé sous un item n'est pas un oubli** : elle signifie
  qu'aucun commentaire ne l'accompagne dans le source, donc qu'il est exigible
  sans restriction.
- Un même item peut porter **plusieurs intitulés** de natures différentes — voir
  « Irréductibles de $\mathbb{C}[X]$ et $\mathbb{R}[X]$ », à la fois au
  programme, avec une démonstration hors programme et une limite d'extension.
- `**Hors programme.**` est la seule mention **prohibitive** ; `**Limite.**` et
  `**Non exigible.**` restreignent sans exclure.
- Une citation en tête de section peut elle aussi porter un intitulé : il vaut
  alors pour **toute** la section — voir « Endomorphismes d'un espace
  euclidien », où le produit scalaire hermitien est exclu d'emblée.
- Cette transcription est **dérivée**. En cas de doute, le document cité en
  `source` fait foi.

---

## Structures algébriques usuelles

> L'étude des structures algébriques offre l'occasion d'approfondir plusieurs
> points abordés en première année : arithmétique de $\mathbb{Z}$ et de
> $\mathbb{K}[X]$, congruences, algèbre linéaire, groupe symétrique, groupes
> issus de l'algèbre linéaire, ou, ultérieurement, de la géométrie des espaces
> euclidiens.
>
> Le paragraphe relatif aux polynômes permet de revenir sur l'étude menée en
> première année, dans un cadre étendu et dans un esprit plus algébrique
> mettant l'accent sur la notion d'idéal.

### a) Compléments sur les groupes

- Intersection de sous-groupes.
- Sous-groupe engendré par une partie. Partie génératrice d'un groupe.
- Sous-groupes du groupe $(\mathbb{Z}, +)$.
- Groupe $(\mathbb{Z}/n\mathbb{Z}, +)$. Générateurs de $\mathbb{Z}/n\mathbb{Z}$.
- Groupe monogène, groupe cyclique.

  **Commentaire.** Groupe des racines $n$-ièmes de l'unité.
- Tout groupe monogène infini est isomorphe à $(\mathbb{Z}, +)$. Tout groupe
  monogène fini de cardinal $n$ est isomorphe à $(\mathbb{Z}/n\mathbb{Z}, +)$.
- Ordre d'un élément d'un groupe.

  **Commentaire.** L'ordre de $x$ est le cardinal du sous-groupe de $G$
  engendré par $x$.
- Si $x$ est d'ordre fini $d$ et si $e$ désigne le neutre de $G$, alors, pour
  tout $n \in \mathbb{Z}$, $x^n = e \iff d \mid n$.
- L'ordre d'un élément d'un groupe fini divise le cardinal du groupe.

  **Non exigible.** La démonstration n'est exigible que pour $G$ commutatif.

### b) Compléments sur les anneaux

- Produit fini d'anneaux.
- Idéal d'un anneau commutatif.

  **Commentaire.** Noyau d'un morphisme d'anneaux commutatifs.
- Idéal engendré par un élément.

  **Commentaire.** Notation $xA$.
- Divisibilité dans un anneau commutatif intègre.

  **Commentaire.** Interprétation en termes d'idéaux.

### c) Idéaux de $\mathbb{Z}$

- Idéaux de $\mathbb{Z}$.
- Définition du PGCD de $n \geqslant 2$ entiers relatifs en termes d'idéaux,
  relation de Bézout.

  **Commentaire.** Lien avec le programme de première année.

### d) Anneaux $\mathbb{Z}/n\mathbb{Z}$

- Anneau $\mathbb{Z}/n\mathbb{Z}$.
- Inversibles de $\mathbb{Z}/n\mathbb{Z}$. Condition nécessaire et suffisante
  pour que $\mathbb{Z}/n\mathbb{Z}$ soit un corps.

  **Commentaire.** Notation $\mathbb{F}_p$ lorsque $p$ est premier.
- Théorème chinois : isomorphisme naturel de $\mathbb{Z}/mn\mathbb{Z}$ sur
  $\mathbb{Z}/m\mathbb{Z} \times \mathbb{Z}/n\mathbb{Z}$ si $m \wedge n = 1$ ;
  extension à plus de deux facteurs.

  **Commentaire.** Application aux systèmes de congruences et à la résolution
  de systèmes d'équations dans $\mathbb{Z}/n\mathbb{Z}$.
- Indicatrice d'Euler $\varphi$. Calcul à l'aide de la décomposition en
  produits de facteurs premiers.

  **Commentaire.** Relation $\varphi(mn) = \varphi(m)\varphi(n)$ si $m$ et $n$
  sont premiers entre eux ; expression de $\varphi(p^k)$ pour $p$ premier.
- Théorème d'Euler.

  **Commentaire.** Lien avec le petit théorème de Fermat.

### e) Anneaux $\mathbb{K}[X]$

> Dans ce paragraphe, $\mathbb{K}$ est un sous-corps de $\mathbb{C}$.

- Idéaux de $\mathbb{K}[X]$.
- Définition du PGCD de $n \geqslant 2$ polynômes en termes d'idéaux, relation
  de Bézout.

  **Commentaire.** Par convention, le PGCD est unitaire.
- Irréductibles de $\mathbb{K}[X]$. Existence et unicité de la décomposition en
  facteurs irréductibles unitaires.
- Irréductibles de $\mathbb{C}[X]$ et $\mathbb{R}[X]$.

  **Hors programme.** La démonstration du théorème de d'Alembert-Gauss.

  **Limite.** L'étude des irréductibles de $\mathbb{K}[X]$ pour un corps autre
  que $\mathbb{R}$ ou $\mathbb{C}$ n'est pas un objectif du programme.

### f) Algèbres

- Algèbre.

  **Commentaire.** Les algèbres sont unitaires. Exemples : $\mathbb{K}[X]$,
  $\mathcal{L}(E)$, $\mathcal{M}_n(\mathbb{K})$, $\mathcal{F}(X, \mathbb{K})$.
- Sous-algèbre.
- Morphisme d'algèbres.

---

## Réduction des endomorphismes et des matrices carrées

> La réduction des endomorphismes et des matrices carrées prolonge les notions
> d'algèbre linéaire vues en première année. Elle trouve des applications et des
> illustrations dans d'autres domaines du programme (topologie, équations
> différentielles, systèmes dynamiques discrets, chaînes de Markov). Elle permet
> également de tisser des liens entre l'algèbre linéaire et l'algèbre générale,
> notamment polynomiale.
>
> Le but de cette section est de donner une introduction substantielle au
> problème de la réduction. Les approches sont de deux types, qu'il convient
> d'identifier : la première, de nature géométrique, repose sur les notions de
> sous-espace stable et d'éléments propres ; la seconde, plus algébrique, fait
> appel aux polynômes annulateurs.
>
> Sans soulever de difficulté, on signale que les notions d'algèbre linéaire
> étudiées en première année s'étendent au cas d'un corps de base quelconque.
> Pour éviter les difficultés liées aux polynômes en caractéristique non nulle,
> la section est traitée sous l'hypothèse que $\mathbb{K}$ est un sous-corps de
> $\mathbb{C}$.

### a) Compléments d'algèbre linéaire

- Somme, somme directe d'une famille finie de sous-espaces vectoriels.

  **Commentaire.** Projecteurs associés à une décomposition de $E$ en somme
  directe.
- Si $F_1, \dots, F_p$ sont des sous-espaces de dimension finie,

  $$\dim\Big(\sum_{i=1}^{p} F_i\Big) \leqslant \sum_{i=1}^{p} \dim(F_i)$$

  avec égalité si et seulement si la somme est directe.

  **Commentaire.** Base adaptée à la décomposition en somme directe.
- Si $E_1, \dots, E_p$ sont des sous-espaces de $E$ tels que
  $E = \bigoplus E_i$ et si $u_i \in \mathcal{L}(E_i, F)$ pour tout $i$, alors
  il existe une et une seule $u \in \mathcal{L}(E, F)$ telle que
  $u_{|E_i} = u_i$ pour tout $i$.
- Matrices définies par blocs.

  **Commentaire.** Interprétation géométrique des blocs.
- Opérations par blocs de tailles compatibles (combinaison linéaire, produit,
  transposition).

  **Non exigible.** La démonstration concernant le produit par blocs.

  **Commentaire.** Transvections par blocs. Invariance du déterminant.
- Déterminant d'une matrice triangulaire par blocs.

### b) Éléments propres d'un endomorphisme, d'une matrice carrée

- Sous-espace stable par un endomorphisme. Endomorphisme induit.

  **Commentaire.** En dimension finie, traduction matricielle.
- Droite stable par un endomorphisme. Valeur propre, vecteur propre (non nul),
  sous-espace propre.

  **Commentaire.** Équation aux éléments propres $u(x) = \lambda x$.
- Spectre d'un endomorphisme en dimension finie.

  **Hors programme.** La notion de valeur spectrale.
- La somme d'une famille finie de sous-espaces propres d'un endomorphisme est
  directe.

  **Commentaire.** Toute famille de vecteurs propres associés à des valeurs
  propres distinctes est libre.
- Le spectre d'un endomorphisme d'un espace de dimension finie $n$ est fini, et
  de cardinal au plus $n$.
- Si deux endomorphismes $u$ et $v$ commutent, tout sous-espace propre de $u$
  est stable par $v$.

  **Commentaire.** Le noyau et l'image de $u$ sont stables par $v$.
- Valeur propre, vecteur propre, sous-espace propre et spectre d'une matrice
  carrée.

  **Commentaire.** Équation aux éléments propres $MX = \lambda X$. Deux
  matrices semblables ont même spectre. Si $\mathbb{K}$ est un sous-corps de
  $\mathbb{K}'$ et si $M \in \mathcal{M}_n(\mathbb{K})$, le spectre de $M$ dans
  $\mathbb{K}$ est contenu dans le spectre de $M$ dans $\mathbb{K}'$.

### c) Polynôme caractéristique

- Polynôme caractéristique d'une matrice carrée, d'un endomorphisme d'un espace
  vectoriel de dimension finie.

  **Commentaire.** Par convention le polynôme caractéristique est unitaire.
  Notations $\chi_A$, $\chi_u$. Coefficients du polynôme caractéristique de
  degrés $0$ et $n-1$.
- Les valeurs propres d'un endomorphisme d'un espace vectoriel de dimension
  finie sont les racines de son polynôme caractéristique.

  **Commentaire.** Deux matrices semblables ont même polynôme caractéristique.
- Polynôme caractéristique d'une matrice triangulaire.
- Polynôme caractéristique d'un endomorphisme induit. Multiplicité d'une valeur
  propre.
- La dimension du sous-espace propre associé à $\lambda$ est majorée par la
  multiplicité de $\lambda$.

### d) Endomorphismes et matrices carrées diagonalisables

- Un endomorphisme d'un espace vectoriel $E$ de dimension finie est dit
  diagonalisable s'il existe une base de $E$ dans laquelle sa matrice est
  diagonale.

  **Commentaire.** Une telle base est constituée de vecteurs propres. Cas des
  projecteurs, des symétries.
- Pour qu'un endomorphisme soit diagonalisable, il faut et il suffit que la
  somme de ses sous-espaces propres soit égale à $E$.

  **Commentaire.** Caractérisation par la somme des dimensions des sous-espaces
  propres.
- Une matrice carrée est dite diagonalisable si elle est semblable à une matrice
  diagonale.

  **Commentaire.** Interprétation en termes d'endomorphisme.

  **Limite.** Dans les exercices pratiques, on se limite à $n = 2$ ou $n = 3$.
- Cas d'un endomorphisme d'un espace de dimension $n$ admettant $n$ valeurs
  propres distinctes.

  **Commentaire.** Traduction matricielle.
- Pour qu'un endomorphisme $u$ soit diagonalisable, il faut et il suffit que
  $\chi_u$ soit scindé et que, pour toute valeur propre de $u$, la dimension de
  l'espace propre associé soit égale à sa multiplicité.

  **Commentaire.** Traduction matricielle. Cas où $\chi_u$ est scindé à racines
  simples.

### e) Endomorphismes et matrices carrées trigonalisables

- Un endomorphisme d'un espace vectoriel $E$ de dimension finie est dit
  trigonalisable s'il existe une base de $E$ dans laquelle sa matrice est
  triangulaire.

  **Commentaire.** Interprétation géométrique.
- Une matrice carrée est dite trigonalisable si elle est semblable à une matrice
  triangulaire.

  **Commentaire.** Interprétation en termes d'endomorphisme.

  **Limite.** La pratique de la trigonalisation n'est pas un objectif du
  programme.
- Un endomorphisme est trigonalisable si et seulement si son polynôme
  caractéristique est scindé.

  **Commentaire.** Traduction matricielle. Expression à l'aide des valeurs
  propres de la trace et du déterminant d'un endomorphisme trigonalisable, d'une
  matrice trigonalisable.

### f) Endomorphismes nilpotents, matrices nilpotentes

- Endomorphisme nilpotent d'un espace vectoriel $E$ de dimension finie, matrice
  nilpotente.
- Un endomorphisme est nilpotent si et seulement s'il est trigonalisable avec
  pour seule valeur propre $0$.

  **Commentaire.** Caractérisation des endomorphismes nilpotents et des matrices
  nilpotentes par le polynôme caractéristique.
- L'indice de nilpotence est majoré par la dimension de $E$.

### g) Polynômes d'un endomorphisme, d'une matrice carrée

- Pour $u$ dans $\mathcal{L}(E)$, morphisme d'algèbres $P \mapsto P(u)$ de
  $\mathbb{K}[X]$ dans $\mathcal{L}(E)$. Le noyau de ce morphisme est l'idéal
  annulateur de $u$. Son image est la sous-algèbre commutative $\mathbb{K}[u]$
  de $\mathcal{L}(E)$.

  **Commentaire.** Traduction matricielle.
- Polynôme minimal d'un endomorphisme d'un espace de dimension finie, d'une
  matrice carrée.

  **Commentaire.** Le polynôme minimal est unitaire. Notations $\pi_u$,
  $\mu_u$, $\pi_M$, $\mu_M$.
- Si $d$ est le degré du polynôme minimal de $u$, alors la famille
  $(u^k)_{0 \leqslant k \leqslant d-1}$ est une base de $\mathbb{K}[u]$.
- Si $P$ annule $u$, toute valeur propre de $u$ est racine de $P$.

  **Commentaire.** Si $u(x) = \lambda x$, alors $P(u)(x) = P(\lambda)x$.
- Les racines de $\pi_u$ dans $\mathbb{K}$ sont les valeurs propres de $u$.

### h) Lemme de décomposition des noyaux

- Si $P_1, \dots, P_r$ sont des éléments de $\mathbb{K}[X]$ deux à deux premiers
  entre eux de produit égal à $P$, alors :

  $$\operatorname{Ker}\big(P(u)\big) = \bigoplus_{i=1}^{r} \operatorname{Ker}\big(P_i(u)\big).$$

### i) Polynômes annulateurs et réduction

- Un endomorphisme est diagonalisable si et seulement s'il annule un polynôme
  simplement scindé, ou encore si et seulement si son polynôme minimal est
  simplement scindé.

  **Commentaire.** Traduction matricielle.
- Polynôme minimal d'un endomorphisme induit. Diagonalisabilité d'un
  endomorphisme induit par un endomorphisme diagonalisable.
- Un endomorphisme est trigonalisable si et seulement s'il annule un polynôme
  scindé, ou encore si et seulement si son polynôme minimal est scindé.

  **Commentaire.** Traduction matricielle.

### j) Théorème de Cayley-Hamilton et sous-espaces caractéristiques

- Théorème de Cayley-Hamilton.

  **Non exigible.** La démonstration.
- Sous-espaces caractéristiques d'un endomorphisme à polynôme caractéristique
  scindé ; $E$ est somme directe des sous-espaces caractéristiques de $u$.

  **Commentaire.** Dimension d'un sous-espace caractéristique.
- Traduction matricielle de cette décomposition : similitude à une matrice
  diagonale par blocs, chaque bloc diagonal étant triangulaire et à termes
  diagonaux égaux.

---

## Endomorphismes d'un espace euclidien

> L'objectif de cette section est double :
>
> - approfondir dans le cadre euclidien la thématique de la réduction des
>   endomorphismes, à travers l'étude des endomorphismes autoadjoints et des
>   isométries ;
> - introduire la notion d'endomorphisme symétrique positif, notamment en vue du
>   calcul différentiel d'ordre 2.
>
> **Hors programme.** La notion de produit scalaire hermitien.

### a) Adjoint d'un endomorphisme

- Représentation des formes linéaires sur un espace euclidien.
- Adjoint d'un endomorphisme d'un espace euclidien.

  **Commentaire.** Notation $u^*$.
- Linéarité de $u \mapsto u^*$, adjoint d'une composée, involutivité du passage
  à l'adjoint.
- Matrice de l'adjoint en base orthonormée.
- Si le sous-espace $F$ est stable par $u$, alors $F^\perp$ est stable par $u^*$.

### b) Matrices orthogonales

- Matrice orthogonale : définition par $A^{\mathsf{T}} A = I_n$,
  caractérisation par le caractère orthonormal de la famille des colonnes, des
  lignes.

  **Commentaire.** Interprétation comme matrice de changement de base
  orthonormée. Matrices orthogonalement semblables.
- Groupe orthogonal.

  **Commentaire.** Notations $\mathrm{O}_n(\mathbb{R})$, $\mathrm{O}(n)$.
- Matrice orthogonale positive ou directe, négative ou indirecte.

  **Commentaire.** Notations $\mathrm{SO}_n(\mathbb{R})$, $\mathrm{SO}(n)$.
- Orientation d'un espace vectoriel réel de dimension finie.

  **Commentaire.** Pour $E$ euclidien orienté et $e$ et $e'$ bases orthonormées
  directes de $E$, égalité des applications $\det_e$ et $\det_{e'}$.

### c) Isométries vectorielles d'un espace euclidien

- Isométrie vectorielle : définition par la conservation des normes.

  **Commentaire.** Par définition, une isométrie vectorielle est linéaire. On
  mentionne la terminologie « automorphisme orthogonal » tout en lui préférant
  « isométrie vectorielle ».
- Exemples : symétrie orthogonale, réflexion.
- Caractérisations des isométries de $E$ parmi les endomorphismes de $E$ : par
  la conservation du produit scalaire, par l'image d'une base orthonormée, par
  la relation $u^* = u^{-1}$.
- Groupe orthogonal.

  **Commentaire.** Notation $\mathrm{O}(E)$.
- Déterminant d'une isométrie. Isométrie directe, indirecte.
- Groupe spécial orthogonal.

  **Commentaire.** Notation $\mathrm{SO}(E)$.

### d) Isométries vectorielles en dimension 2

- Description des matrices orthogonales directes et indirectes de taille 2.
- Rotation vectorielle d'un plan euclidien orienté.

  **Commentaire.** On introduit à cette occasion, sans soulever de difficulté
  sur la notion d'angle, la notion de mesure d'un angle orienté de vecteurs.
- Morphisme
  $t \mapsto \begin{pmatrix} \cos(t) & -\sin(t) \\ \sin(t) & \cos(t) \end{pmatrix}$
  de $\mathbb{R}$ dans $\mathrm{SO}_2(\mathbb{R})$ ; surjectivité et noyau.

  **Commentaire.** Isomorphisme de $\mathbb{U}$ sur $\mathrm{SO}_2(\mathbb{R})$.
  Le groupe $\mathrm{SO}_2(\mathbb{R})$ est commutatif.
- Classification des isométries d'un plan euclidien.

### e) Réduction des isométries

- Stabilité de l'orthogonal d'un sous-espace stable.
- Réduction d'une isométrie en base orthonormée.

  **Commentaire.** Interprétation matricielle.
- Cas particulier : réduction d'une isométrie vectorielle directe d'un espace
  euclidien de dimension 3.

  **Commentaire.** La forme réduite justifie la terminologie « rotation ».

  **Limite.** La pratique du calcul des éléments géométriques d'un élément de
  $\mathrm{SO}_3(\mathbb{R})$ n'est pas un attendu du programme.

### f) Endomorphismes autoadjoints d'un espace euclidien

- Endomorphisme autoadjoint : définition par $u^* = u$.
- Stabilité de l'orthogonal d'un sous-espace stable.
- Caractérisation du caractère autoadjoint par la matrice en base orthonormée.

  **Commentaire.** On mentionne la terminologie « endomorphisme symétrique »,
  tout en lui préférant « endomorphisme autoadjoint ». Notation
  $\mathcal{S}(E)$.
- Les projecteurs orthogonaux sont les projecteurs autoadjoints.
- Théorème spectral : si $u$ est un endomorphisme d'un espace euclidien $E$,
  alors $u$ est autoadjoint si et seulement si $E$ est somme orthogonale des
  sous-espaces propres de $u$ ou, de manière équivalente, s'il existe une base
  orthonormée diagonalisant $u$.

  **Commentaire.** Interprétation matricielle : une matrice de
  $\mathcal{M}_n(\mathbb{R})$ appartient à $\mathcal{S}_n(\mathbb{R})$ si et
  seulement si elle est orthogonalement diagonalisable.

### g) Endomorphismes autoadjoints positifs, définis positifs

- Endomorphisme autoadjoint positif, défini positif.

  **Commentaire.** Caractérisation spectrale. Notations $\mathcal{S}^+(E)$,
  $\mathcal{S}^{++}(E)$.
- Matrice symétrique positive, définie positive.

  **Commentaire.** Caractérisation spectrale. Notations
  $\mathcal{S}_n^+(\mathbb{R})$, $\mathcal{S}_n^{++}(\mathbb{R})$.
