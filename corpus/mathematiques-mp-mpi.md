---
id: mathematiques-mp-mpi
filiere: [MP, MPI]
matiere: mathematiques
niveau: 2
source: "Annexe 1 — Programme de mathématiques, MESRI 2021"
---

# Programme de mathématiques — MP, MPI

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

## Topologie des espaces vectoriels normés

> Les objectifs de cette section sont les suivants :
>
> - introduire, dans le cadre des espaces vectoriels normés, le vocabulaire de
>   la topologie ;
> - donner, à travers l'étude des espaces vectoriels normés de dimension finie,
>   un cadre commode pour traiter diverses applications à l'analyse (fonctions
>   vectorielles, équations différentielles linéaires) ;
> - introduire la notion de partie compacte dans un espace vectoriel normé, en
>   soulignant le rôle qu'elle joue dans les résultats d'existence, notamment
>   en matière d'optimisation ;
> - introduire la notion de composante connexe par arcs d'un espace vectoriel
>   normé, qui permet de généraliser le théorème des valeurs intermédiaires et
>   intervient en calcul différentiel ;
> - dégager l'idée fondamentale d'inégalité linéaire, qui apparaît lors de
>   l'étude de la comparaison des normes et de la continuité des applications
>   linéaires, et qui est quantifiée par la notion de norme d'opérateur.
>
> Les notions seront illustrées par des exemples variés. On pourra ainsi
> travailler dans les espaces $\mathbb{K}^n$, les espaces de polynômes,
> d'applications linéaires ou de matrices, ainsi que dans divers espaces
> fonctionnels.
>
> Il convient de souligner le contenu géométrique des notions abordées,
> notamment à l'aide de nombreuses figures. Lors de l'étude de la connexité par
> arcs, un dessin pertinent peut valoir preuve.
>
> **Hors programme.** Les notions d'espace métrique et, a fortiori, d'espace
> topologique. Il en est de même des notions de suite de Cauchy et d'espace de
> Banach.
>
> Dans toute cette section, $\mathbb{K}$ désigne $\mathbb{R}$ ou
> $\mathbb{C}$.

### a) Normes et espaces vectoriels normés

- Norme sur un $\mathbb{K}$-espace vectoriel. Structure d'espace vectoriel
  normé.

  **Commentaire.** Vecteurs unitaires.
- Distance associée à une norme.

  **Commentaire.** Inégalité triangulaire.
- Boules fermées, boules ouvertes, sphères. Convexité des boules.

  **Commentaire.** On introduit à cette occasion la notion de partie convexe
  d'un espace vectoriel réel.
- Parties, suites, fonctions bornées.
- Norme associée à un produit scalaire sur un espace préhilbertien réel.
- Normes $||\cdot||_1$, $||\cdot||_2$, $||\cdot||_\infty$ sur
  $\mathbb{K}^n$.
- Norme de la convergence uniforme sur l'espace des fonctions bornées à
  valeurs dans $\mathbb{K}$.

  **Commentaire.** Notation $||\cdot||_\infty$. Pour les applications
  pratiques, on peut utiliser sans justification l'égalité
  $\sup(kA) = k \sup(A)$ pour $A$ partie non vide de $\mathbb{R}$ et
  $k \in \mathbb{R}^{+}$.
- Normes de la convergence en moyenne et de la convergence en moyenne
  quadratique sur l'espace des fonctions continues sur un segment à valeurs
  réelles ou complexes.

  **Commentaire.** Notations $||\cdot||_1$ et $||\cdot||_2$.
- Produit fini d'espaces vectoriels normés.

### b) Suites d'éléments d'un espace vectoriel normé

- Suite convergente, divergente. Unicité de la limite. Caractère borné d'une
  suite convergente. Opérations algébriques sur les suites convergentes.
  Convergence d'une suite à valeurs dans un produit fini d'espaces vectoriels
  normés.
- Suites extraites, valeurs d'adhérence.

  **Commentaire.** Une suite ayant au moins deux valeurs d'adhérence diverge.

### c) Comparaison des normes

- Normes équivalentes. Invariance du caractère borné, de la convergence d'une
  suite.

  **Commentaire.** Utilisation de suites pour établir que deux normes ne sont
  pas équivalentes.

### d) Topologie d'un espace normé

- Ouvert d'un espace normé. Stabilité de l'ensemble des ouverts par réunion
  quelconque, par intersection finie. Voisinage d'un point.

  **Commentaire.** Une boule ouverte est un ouvert. Un produit (fini) d'ouverts
  est un ouvert.
- Fermé d'un espace normé. Stabilité de l'ensemble des fermés par intersection
  quelconque, par réunion finie.

  **Commentaire.** Une boule fermée, une sphère, sont fermées. Un produit
  (fini) de fermés est fermé.
- Point intérieur, point adhérent.
- Intérieur, adhérence, frontière d'une partie.
- Caractérisation séquentielle des points adhérents, des fermés. Partie dense.
- Invariance des notions topologiques par passage à une norme équivalente.
- Si $A$ est une partie d'un espace normé, ouvert et fermé relatifs de $A$.
  Voisinage relatif.

  **Commentaire.** Par définition, une partie $U$ de $A$ est un ouvert relatif
  si $U$ est voisinage relatif de chacun de ses points. Caractérisation comme
  intersection avec $A$ d'un ouvert de $E$. Les fermés relatifs sont par
  définition les complémentaires dans $A$ des ouverts relatifs.
  Caractérisation séquentielle. Caractérisation comme intersection avec $A$
  d'un fermé de $E$.

### e) Étude locale d'une application, continuité

- Limite en un point adhérent à une partie $A$. Caractérisation séquentielle.

  **Commentaire.** Extensions : limite de $f(x)$ lorsque $||x||$ tend vers
  $+\infty$, limite de $f(x)$ quand $x$ tend vers $+\infty$ ou $-\infty$
  lorsque $A$ est une partie de $\mathbb{R}$, limite infinie en $a$ adhérent à
  $A$ pour une fonction réelle.
- Cas d'une application à valeurs dans un produit fini d'espaces vectoriels
  normés.
- Opérations algébriques sur les limites. Limite d'une composée.
- Continuité en un point. Caractérisation séquentielle.
- Opérations algébriques sur les applications continues. Composition de deux
  applications continues.

  **Commentaire.** Deux applications continues qui coïncident sur une partie
  dense sont égales.
- Image réciproque d'un ouvert, d'un fermé par une application continue.
- Applications uniformément continues, applications lipschitziennes.

  **Commentaire.** Caractère $1$-lipschitzien de l'application
  $x \mapsto d(x, A)$ où $A$ est une partie non vide de $E$.

### f) Applications linéaires et multilinéaires continues

- Critère de continuité d'une application linéaire entre deux espaces normés :
  $u \in \mathcal{L}(E, F)$ est continue si et seulement s'il existe
  $C \in \mathbb{R}^{+}$ tel que

  $$\forall x \in E, \quad ||u(x)|| \leqslant C\,||x||.$$

  **Commentaire.** Notation $\mathcal{L}_c(E, F)$.
- Norme subordonnée (ou norme d'opérateur) d'une application linéaire
  continue.

  **Commentaire.** Notations $||u||$, $||u||_{\mathrm{op}}$. La norme
  d'opérateur est une norme sur $\mathcal{L}_c(E, F)$. Sous-multiplicativité
  de la norme d'opérateur. Adaptation aux matrices.
- Critère de continuité des applications multilinéaires.

  **Non exigible.** La démonstration.

### g) Parties compactes d'un espace normé

- Définition d'une partie compacte par la propriété de Bolzano-Weierstrass.

  **Hors programme.** La propriété de Borel-Lebesgue.
- Une partie compacte est fermée et bornée.
- Un fermé relatif d'une partie compacte est compact.
- Une suite d'éléments d'une partie compacte converge si et seulement si elle
  admet une unique valeur d'adhérence.
- Produit d'une famille finie de compacts.

### h) Applications continues sur une partie compacte

- Image continue d'une partie compacte.
- Théorème de Heine.
- Théorème des bornes atteintes pour une application numérique définie et
  continue sur un compact non vide.

  **Commentaire.** On souligne l'importance de la compacité dans les problèmes
  d'optimisation, notamment en mettant en évidence des situations où l'on
  prouve l'existence d'un extremum à l'aide d'une restriction à un compact.

### i) Connexité par arcs

- Dans un espace vectoriel normé, chemin (ou arc) joignant deux points ;
  partie connexe par arcs.

  **Commentaire.** Relation d'équivalence associée sur une partie $A$ de $E$.
  Les classes sont les composantes connexes par arcs.
- Cas des parties convexes, des parties étoilées.
- Les parties connexes par arcs de $\mathbb{R}$ sont les intervalles.
- Image continue d'une partie connexe par arcs.

  **Commentaire.** Cas particulier des applications à valeurs réelles :
  théorème des valeurs intermédiaires.

### j) Espaces vectoriels normés de dimension finie

- Équivalence des normes en dimension finie.

  **Non exigible.** La démonstration.
- Invariance des différentes notions topologiques par rapport au choix d'une
  norme en dimension finie. Topologie naturelle d'un espace normé de dimension
  finie.

  **Commentaire.** La convergence d'une suite (ou l'existence de la limite
  d'une fonction) à valeurs dans un espace vectoriel normé de dimension finie
  équivaut à celle de chacune de ses coordonnées dans une base.
- Une partie d'un espace normé de dimension finie est compacte si et seulement
  si elle est fermée et bornée.
- Une suite bornée d'un espace normé de dimension finie converge si et
  seulement si elle a une unique valeur d'adhérence.
- Un sous-espace de dimension finie d'un espace normé est fermé.
- Si $E$ est de dimension finie, $\mathcal{L}(E, F) = \mathcal{L}_c(E, F)$.
- Continuité des applications polynomiales définies sur un espace normé de
  dimension finie, des applications multilinéaires définies sur un produit
  d'espaces vectoriels normés de dimensions finies.

  **Commentaire.** Exemples : déterminant, produit matriciel, composition
  d'applications linéaires.

## Séries numériques et vectorielles

> L'objectif de cette section est double :
>
> - consolider les acquis de première année relatifs aux séries numériques, en
>   particulier à travers l'étude de questions de calcul asymptotique ;
> - étendre la notion de série convergente au cadre des espaces vectoriels
>   normés de dimension finie.
>
> Les séries sont avant tout un outil.
>
> **Limite.** L'étude des séries semi-convergentes n'est pas un objectif du
> programme.

### a) Séries à valeurs dans un espace normé de dimension finie

- Sommes partielles. Convergence, divergence.

  **Commentaire.** La série de terme général $u_n$ est notée $\sum u_n$.
- Somme et restes d'une série convergente.

  **Commentaire.** En cas de convergence, notation $\sum_{n=0}^{+\infty} u_n$.
- Linéarité de la somme.
- Le terme général d'une série convergente tend vers $0$.

  **Commentaire.** Divergence grossière.
- Lien suite-série, séries télescopiques.
- Série absolument convergente.
- Une série absolument convergente d'éléments d'un espace vectoriel normé de
  dimension finie est convergente.

  **Hors programme.** Le critère de Cauchy.

### b) Compléments sur les séries numériques

- Technique de comparaison série-intégrale.

  **Commentaire.** Les étudiants doivent savoir utiliser la comparaison
  série-intégrale pour établir des convergences et des divergences de séries,
  estimer des sommes partielles de séries divergentes ou des restes de séries
  convergentes, notamment dans le cas d'une fonction monotone.
- Règle de d'Alembert.
- Sommation des relations de comparaison : domination, négligeabilité,
  équivalence, dans les cas convergent et divergent.

  **Commentaire.** La suite de référence est de signe constant à partir d'un
  certain rang. Cas particulier : théorème de Cesàro (pour une limite finie ou
  infinie).

## Suites et séries de fonctions, séries entières

### A — Suites et séries de fonctions

> Les objectifs de cette section sont les suivants :
>
> - définir différents modes usuels de convergence des suites et séries de
>   fonctions ;
> - étudier la stabilité des propriétés des fonctions par passage à la limite ;
> - introduire la thématique de l'approximation, reliée à la notion
>   topologique de densité, à travers deux théorèmes d'approximation uniforme
>   susceptibles de nombreuses applications.
>
> La technique n'est pas un but en soi. On privilégie les exemples
> significatifs : construction de fonctions solutions de problèmes (équations
> fonctionnelles ou différentielles, par exemple), mise en évidence de
> fonctions aux propriétés remarquables.
>
> En vue des applications aux équations différentielles linéaires, les
> fonctions considérées sont à valeurs dans un espace normé de dimension
> finie. Dans la pratique, on se limite pour l'essentiel au cas de fonctions à
> valeurs dans $\mathbb{R}$ ou $\mathbb{C}$.
>
> Les fonctions sont définies sur une partie $A$ d'un espace vectoriel $E$ de
> dimension finie et à valeurs dans un espace vectoriel normé $F$ de dimension
> finie.

### a) Convergence simple, convergence uniforme

- Convergence simple d'une suite de fonctions. Convergence uniforme. La
  convergence uniforme entraîne la convergence simple.

  **Commentaire.** Pour des fonctions bornées, interprétation en termes de
  norme.

### b) Continuité, double limite

- Si les $u_n$ sont continues en $a$ et si $(u_n)$ converge uniformément vers
  $u$ sur $A$, alors $u$ est continue en $a$. En particulier, toute limite
  uniforme de fonctions continues sur $A$ est continue sur $A$.

  **Commentaire.** Le théorème s'applique dans le cas où l'hypothèse de
  convergence uniforme est satisfaite de façon locale, en particulier sur tout
  segment. En pratique, on vérifie la convergence uniforme sur des intervalles
  adaptés à la situation.
- Théorème de la double limite : soit $(u_n)$ une suite de fonctions de $A$
  dans $F$ convergeant uniformément vers $u$ sur $A$, et soit $a$ un point
  adhérent à $A$ ; si, pour tout $n$, $u_n$ admet une limite $\ell_n$ en $a$,
  alors $(\ell_n)$ admet une limite $\ell$ et $u(x) \xrightarrow[x \to a]{}
  \ell$.

  **Hors programme.** La démonstration.

  **Commentaire.** Adaptation, si $A \subset \mathbb{R}$, aux cas où
  $a = +\infty$ et $a = -\infty$.

### c) Intégration d'une limite uniforme sur un segment

- Soit $(u_n)$ une suite de fonctions continues définies sur un intervalle $I$
  de $\mathbb{R}$ et à valeurs dans $F$, $a$ un point de $I$. On suppose que
  $(u_n)$ converge uniformément sur tout segment de $I$ vers une fonction $u$.
  Pour $n \in \mathbb{N}$ et $x \in I$ soit

  $$U_n(x) = \int_{a}^{x} u_n, \qquad U(x) = \int_{a}^{x} u.$$

  Alors $(U_n)$ converge uniformément vers $U$ sur tout segment de $I$.

  **Commentaire.** En particulier, si $(u_n)$ converge uniformément vers $u$
  sur le segment $[a, b]$, alors $\int_{a}^{b} u_n \to \int_{a}^{b} u$.

### d) Dérivation d'une suite de fonctions

- Soit $(u_n)$ une suite de fonctions de classe $C^1$ sur un intervalle $I$ de
  $\mathbb{R}$, à valeurs dans $F$. Si $(u_n)$ converge simplement sur $I$
  vers une fonction $u$, et si $(u_n')$ converge uniformément sur tout segment
  de $I$ vers une fonction $v$, alors $(u_n)$ converge uniformément vers $u$
  sur tout segment de $I$, $u$ est de classe $C^1$ sur $I$ et $u' = v$.

  **Commentaire.** En pratique, on vérifie la convergence uniforme de
  $(u_n')$ sur des intervalles adaptés à la situation.
- Extension aux suites de fonctions de classe $C^k$, sous l'hypothèse de
  convergence simple de $(u_n^{(j)})$ pour $0 \leqslant j \leqslant k-1$ et de
  convergence uniforme sur tout segment de $(u_n^{(k)})$.

  **Commentaire.** En pratique, on vérifie la convergence uniforme de
  $(u_n^{(k)})$ sur des intervalles adaptés à la situation.

### e) Séries de fonctions

- Convergence simple, convergence uniforme.
- Une série de fonctions converge uniformément si et seulement si elle
  converge simplement et si la suite de ses restes converge uniformément vers
  $0$.
- Adaptation des résultats des paragraphes précédents au cas des séries de
  fonctions.
- Convergence normale d'une série de fonctions. La convergence normale
  implique la convergence uniforme.

  **Commentaire.** La convergence normale implique la convergence absolue en
  tout point. Exemples d'études de fonctions définies comme sommes de séries :
  régularité, étude asymptotique, utilisation de la comparaison
  série-intégrale.

### f) Approximation uniforme

- Approximation uniforme d'une fonction continue par morceaux sur un segment
  par des fonctions en escalier.
- Théorème de Weierstrass : toute fonction continue sur un segment $S$ et à
  valeurs dans $\mathbb{K}$ est limite uniforme sur $S$ de fonctions
  polynomiales à coefficients dans $\mathbb{K}$.

  **Non exigible.** La démonstration.

### B — Séries entières

> Les objectifs de cette section sont les suivants :
>
> - étudier la convergence d'une série entière et les propriétés de sa somme ;
> - introduire la notion de fonction développable en série entière ;
> - établir les développements en série entière des fonctions usuelles.
>
> Les séries entières donnent un outil puissant pour aborder certains calculs :
> résolution d'équations différentielles linéaires, fonctions génératrices en
> probabilités. Elles permettent également de revenir sur la thématique de la
> régularité des fonctions, introduite en première année, et donnent
> l'occasion d'introduire la « variable complexe ».
>
> Les coefficients des séries entières considérées sont réels ou complexes.

### a) Généralités

- Série entière de la variable réelle, de la variable complexe.
- Lemme d'Abel : si la suite $a_n z_0^n$ est bornée alors, pour tout nombre
  complexe $z$ tel que $|z| < |z_0|$, la série $\sum a_n z^n$ est absolument
  convergente.
- Rayon de convergence d'une série entière, défini comme borne supérieure dans
  $[0, +\infty]$, de l'ensemble des réels positifs $r$ tels que la suite
  $(a_n r^n)$ est bornée.
- Disque ouvert de convergence. Intervalle ouvert de convergence.

  **Commentaire.** La série $\sum a_n z^n$ converge absolument si $|z| < R$,
  et elle diverge grossièrement si $|z| > R$.
- Si $a_n = O(b_n)$ et donc en particulier si $a_n = o(b_n)$, alors
  $R_a \leqslant R_b$. Si $a_n \sim b_n$, alors $R_a = R_b$.

  **Commentaire.** Rayon de convergence de $\sum nx^n$.
- Application de la règle de d'Alembert pour les séries numériques au calcul
  du rayon.

  **Commentaire.** La limite du rapport $\dfrac{|a_{n+1}|}{|a_n|}$ peut être
  utilisée directement.
- Somme et produit de Cauchy de deux séries entières.

### b) Continuité de la somme d'une série entière de la variable complexe

- Convergence normale d'une série entière sur tout disque fermé de centre $0$
  contenu dans le disque ouvert de convergence.
- Continuité de la somme d'une série entière sur le disque ouvert de
  convergence.

### c) Régularité de la somme d'une série entière de la variable réelle

- Théorème d'Abel radial : si $\sum a_n x^n$ a pour rayon de convergence
  $R \in \mathbb{R}_+^*$ et si $\sum a_n R^n$ converge, alors
  $\sum_{n=0}^{+\infty} a_n x^n \xrightarrow[x \to R]{} \sum_{n=0}^{+\infty}
  a_n R^n$.

  **Hors programme.** La démonstration.
- La somme d'une série entière est de classe $C^1$ sur l'intervalle ouvert de
  convergence et ses dérivées s'obtiennent par dérivation terme à terme.

  **Commentaire.** Relation
  $\Re\left(\sum a_n x^n\right) = \Re\left(\sum n a_n x^n\right)$.
- Expression des coefficients d'une série entière de rayon de convergence
  strictement positif à l'aide des dérivées en $0$ de sa somme.

  **Commentaire.** Si les fonctions $x \mapsto \sum_{n=0}^{+\infty} a_n x^n$
  et $x \mapsto \sum_{n=0}^{+\infty} b_n x^n$ coïncident sur un intervalle
  $]0, \alpha]$ avec $\alpha > 0$, alors, pour tout $n \in \mathbb{N}$,
  $a_n = b_n$.

### d) Fonctions développables en série entière, développements usuels

- Fonction développable en série entière sur le disque ouvert de centre $0$ et
  de rayon $R$, sur l'intervalle $]-R, R[$.

  **Commentaire.** Dans le cas réel, lien avec la série de Taylor.
- Développement de $\exp(z)$ sur $\mathbb{C}$.
- Développement de $\dfrac{1}{1-z}$ sur $\{z \in \mathbb{C}, \, |z| < 1\}$.
- Développements usuels dans le domaine réel.

  **Commentaire.** Les étudiants doivent connaître les développements en série
  entière des fonctions exponentielle, hyperboliques, circulaires, Arctan,
  $x \mapsto \ln(1 + x)$ et $x \mapsto (1 + x)^\alpha$. Les étudiants doivent
  savoir développer une fonction en série entière à l'aide d'une équation
  différentielle linéaire.

## Fonctions vectorielles

> Cette section a deux objectifs :
>
> - étendre rapidement le programme d'analyse réelle de première année au
>   cadre des fonctions vectorielles ;
> - fournir des outils pour l'étude des équations différentielles linéaires et
>   du calcul différentiel.
>
> Les fonctions sont définies sur un intervalle $I$ de $\mathbb{R}$, à valeurs
> dans un espace normé de dimension finie $E$.

### a) Dérivabilité en un point

- Dérivabilité en un point.

  **Commentaire.** Définition par le taux d'accroissement, caractérisation par
  le développement limité à l'ordre 1. Interprétation cinématique. Traduction
  en termes de coordonnées dans une base.
- Dérivabilité à droite et à gauche.

### b) Opérations sur les fonctions dérivables

- Combinaison linéaire de fonctions dérivables.
- Dérivabilité et dérivée de $L(f)$, où $L$ est linéaire.
- Dérivabilité et dérivée de $B(f, g)$, où $B$ est bilinéaire, de
  $M(f_1, \dots, f_p)$, où $M$ est multilinéaire.

  **Commentaire.** Cas du produit scalaire, du déterminant.
- Dérivabilité et dérivée de $f \circ \varphi$ où $\varphi$ est une fonction
  réelle de variable réelle et $f$ une fonction vectorielle.
- Applications de classe $C^k$. Opérations sur les applications de classe
  $C^k$.

### c) Intégration sur un segment

- Intégrale d'une fonction vectorielle continue par morceaux sur un segment de
  $\mathbb{R}$.

  **Commentaire.** Notations $\int_{[a,b]} f$, $\int_{a}^{b} f$,
  $\int_{a}^{b} f(t)\,dt$.
- Linéarité de l'intégrale. Relation de Chasles.
- Pour $L$ linéaire, intégrale de $L(f)$.
- Inégalité triangulaire

  $$\left|\left| \int_{a}^{b} f \right|\right| \leqslant \int_{a}^{b} ||f||.$$
- Sommes de Riemann associées à une subdivision régulière.

### d) Intégrale fonction de sa borne supérieure

- Dérivation de $x \mapsto \int_{a}^{x} f(t)\,dt$ pour $f$ continue.
- Inégalité des accroissements finis pour une fonction de classe $C^1$.

### e) Formules de Taylor

- Formule de Taylor avec reste intégral.
- Inégalité de Taylor-Lagrange à l'ordre $n$ pour une fonction de classe
  $C^n$.
- Formule de Taylor-Young à l'ordre $n$ pour une fonction de classe $C^n$.

## Intégration sur un intervalle quelconque

> L'objectif de cette section est triple :
>
> - définir, dans le cadre restreint des fonctions continues par morceaux, les
>   notions d'intégrale convergente et d'intégrabilité sur un intervalle non
>   compact ;
> - donner des outils efficaces de passage à la limite sous l'intégrale, en
>   particulier le théorème de convergence dominée ;
> - compléter l'étude des séries de fonctions par celle des intégrales à
>   paramètre.
>
> La technique n'est pas un but en soi. On privilégie donc les exemples
> significatifs : transformées intégrales (Fourier, Laplace), intégrales
> eulériennes.
>
> On évite tout excès de rigueur dans la rédaction. Ainsi, dans les calculs
> concrets mettant en jeu l'intégration par parties ou le changement de
> variable, on n'impose pas de rappeler les hypothèses de régularité des
> énoncés. De même, dans l'application des théorèmes de passage à la limite
> sous l'intégrale ou de régularité des intégrales à paramètre, on se limite à
> la vérification des hypothèses cruciales, sans insister sur la continuité
> par morceaux en la variable d'intégration.
>
> Les fonctions sont à valeurs dans $\mathbb{K}$, corps des nombres réels ou
> des nombres complexes.

### a) Intégrales généralisées sur un intervalle de la forme $[a, +\infty[$

- Pour $f$ continue par morceaux de $[a, +\infty[$ dans $\mathbb{K}$,
  l'intégrale $\int_{a}^{+\infty} f$ est dite convergente si la fonction
  $x \mapsto \int_{a}^{x} f$ a une limite finie en $+\infty$.

  **Commentaire.** Notations $\int_{a}^{+\infty} f$, $\int_{a}^{+\infty}
  f(t)\,dt$. Intégrale convergente en $+\infty$. Dérivation de
  $x \mapsto \int_{x}^{+\infty} f$ si $f$ est continue.
- Si $f$ est continue par morceaux sur $[a, +\infty[$ et à valeurs positives,
  l'intégrale $\int_{a}^{+\infty} f$ converge si et seulement si
  $x \mapsto \int_{a}^{x} f$ est majorée.

  **Commentaire.** Écriture $\int_{a}^{+\infty} f = +\infty$ en cas de
  divergence.
- Si $f$ et $g$ sont deux fonctions continues par morceaux sur
  $[a, +\infty[$ telles que $0 \leqslant f \leqslant g$, la convergence de
  $\int_{a}^{+\infty} g$ implique celle de $\int_{a}^{+\infty} f$.
- Pour $\alpha \in \mathbb{R}$, nature de l'intégrale de Riemann
  $\int_{1}^{+\infty} \dfrac{dt}{t^\alpha}$.
- Pour $a \in \mathbb{R}$, nature de l'intégrale $\int_{0}^{+\infty}
  e^{-at}\,dt$.

### b) Intégrabilité sur un intervalle de la forme $[a, +\infty[$

- Une fonction $f$ est dite intégrable sur $[a, +\infty[$ si elle est continue
  par morceaux sur $[a, +\infty[$ et si $\int_{a}^{+\infty} |f|$ converge.

  **Commentaire.** On utilise indifféremment les expressions « $f$ est
  intégrable sur $[a, +\infty[$ » et « l'intégrale $\int_{a}^{+\infty} f$
  converge absolument ». Pour $f$ de signe constant, $\int_{a}^{+\infty} f$
  converge si et seulement si $f$ est intégrable sur $[a, +\infty[$. Un calcul
  montrant que $\int_I |f| < +\infty$ vaut preuve d'intégrabilité.
- Si $f$ est intégrable sur $[a, +\infty[$, alors $\int_{a}^{+\infty} f$
  converge.

  **Commentaire.** Fonction intégrable en $+\infty$.

  **Limite.** L'étude des intégrales semi-convergentes n'est pas un objectif
  du programme.
- Théorème de comparaison : pour $f$ et $g$ deux fonctions continues par
  morceaux sur $[a, +\infty[$, à valeurs dans $\mathbb{K}$ :
  - si $f(x) = O(g(x))$ quand $x \to +\infty$, alors l'intégrabilité de $g$
    sur $[a, +\infty[$ implique celle de $f$ ;
  - si $f(x) \sim g(x)$ quand $x \to +\infty$, alors l'intégrabilité de $g$
    sur $[a, +\infty[$ équivaut à celle de $f$.

  **Commentaire.** Le résultat s'applique en particulier si
  $f(x) = o(g(x))$ quand $x \to +\infty$.

### c) Intégrales généralisées sur un intervalle quelconque

- Intégrale généralisée d'une fonction continue par morceaux sur un intervalle
  semi-ouvert ou ouvert de $\mathbb{R}$.

  **Commentaire.** Notations $\int_{a}^{b} f$, $\int_{a}^{b} f(t)\,dt$.
  Intégrale convergente en $b$, en $a$. Écriture $\int_{a}^{b} f = +\infty$
  si $f$ est à valeurs dans $\mathbb{R}^+$ et d'intégrale divergente. Pour une
  fonction à valeurs dans $\mathbb{R}^+$, un calcul aboutissant à un résultat
  fini vaut preuve de convergence.
- Propriétés des intégrales généralisées : linéarité, positivité, croissance,
  relation de Chasles.
- Intégration par parties sur un intervalle quelconque :

  $$\int_{a}^{b} f(t)g'(t)\,dt = \left[ fg \right]_a^b - \int_{a}^{b}
  f'(t)g(t)\,dt.$$

  **Commentaire.** L'existence des limites du produit $fg$ aux bornes de
  l'intervalle assure que les intégrales de $fg'$ et de $f'g$ sont de même
  nature. Pour les applications pratiques, on ne demande pas de rappeler les
  hypothèses de régularité.
- Changement de variable : étant données une fonction $f$ continue sur
  $]a, b[$ et une fonction $\varphi : ]\alpha, \beta[ \to ]a, b[$ bijective,
  strictement croissante et de classe $C^1$, les intégrales $\int_{a}^{b}
  f(t)\,dt$ et $\int_{\alpha}^{\beta} f(\varphi(u))\,\varphi'(u)\,du$ sont de
  même nature et égales en cas de convergence.

  **Commentaire.** Adaptation au cas où $\varphi$ est strictement
  décroissante. On applique ce résultat sans justification dans des cas de
  changements de variable usuels.

### d) Intégrales absolument convergentes et fonctions intégrables

- Intégrale absolument convergente.
- La convergence absolue implique la convergence.
- Une fonction est dite intégrable sur l'intervalle $I$ si elle y est continue
  par morceaux et si son intégrale sur $I$ est absolument convergente.

  **Commentaire.** On utilise indifféremment les expressions « $f$ est
  intégrable sur $[a, b[$ » et « l'intégrale $\int_{a}^{b} f$ converge
  absolument ». Fonction intégrable en $b$, en $a$.
- Espace $\mathcal{L}^1(I, \mathbb{K})$ des fonctions intégrables de $I$ dans
  $\mathbb{K}$.

  **Commentaire.** Pour $f$ intégrable de $I$ dans $\mathbb{K}$, notation
  $\int_I f$.
- Inégalité triangulaire.
- Si $f$ est continue et intégrable sur $I$, à valeurs dans $\mathbb{R}^+$ et
  si $\int_I f = 0$, alors $f$ est identiquement nulle.
- Adaptation du théorème de comparaison en une borne quelconque.
- Si $\alpha \in \mathbb{R}$, nature de l'intégrale de Riemann
  $\int_{a}^{b} \dfrac{dx}{|x - a|^\alpha}$.

  **Commentaire.** La fonction $f$ est intégrable en $a$ (resp. $b$) si et
  seulement si $t \mapsto f(a + t)$ (resp. $t \mapsto f(b - t)$) est
  intégrable en $0$.

### e) Intégration des relations de comparaison

- Intégration des relations de comparaison, pour les intégrales partielles ou
  les restes : domination, négligeabilité, équivalence.

  **Commentaire.** La fonction de référence est réelle de signe constant.

### f) Convergence dominée

> Pour l'application pratique des énoncés de ce paragraphe, on vérifie les
> hypothèses de convergence simple et de domination, sans expliciter celles
> relatives à la continuité par morceaux par rapport à $t$.

- Théorème de convergence dominée : soit $(f_n)$ une suite de fonctions
  continues par morceaux de $I$ dans $\mathbb{K}$ convergeant simplement sur
  $I$ vers une fonction $f$ continue par morceaux et telle qu'il existe une
  fonction $\varphi$ positive intégrable sur $I$ vérifiant $|f_n| \leqslant
  \varphi$ pour tout $n$. Alors :

  $$\int_I f_n \xrightarrow[n \to +\infty]{} \int_I f.$$

  **Hors programme.** La démonstration.
- Extension au cas d'une famille à paramètre réel $(f_\lambda)_{\lambda \in
  J}$ où $J$ est un intervalle de $\mathbb{R}$.

### g) Intégration terme à terme

> Pour l'application pratique des énoncés de ce paragraphe, on vérifie les
> hypothèses de convergence simple et de positivité ou de sommabilité, sans
> expliciter celles relatives à la continuité par morceaux par rapport à $t$.

- Si $(f_n)$ est une suite de fonctions continues par morceaux et intégrables
  sur $I$, à valeurs dans $\mathbb{R}^+$, telle que la série $\sum f_n$
  converge simplement et que sa somme soit continue par morceaux sur $I$,
  alors, dans $[0, +\infty]$,

  $$\int_I \left( \sum_{n=0}^{+\infty} f_n(t) \right) dt =
  \sum_{n=0}^{+\infty} \int_I f_n(t)\,dt.$$

  **Commentaire.** En particulier, l'intégrabilité de $\sum f_n$ sur $I$
  équivaut à $\sum_{n=0}^{+\infty} \int_I f_n(t)\,dt < +\infty$.
- Si $(f_n)$ est une suite de fonctions continues par morceaux et intégrables
  sur $I$, à valeurs dans $\mathbb{K}$, telle que la série $\sum f_n$
  converge simplement et que sa somme soit continue par morceaux sur $I$ et
  telle que

  $$\sum_{n=0}^{+\infty} \int_I |f_n(t)|\,dt < +\infty,$$

  alors $\sum_{n=0}^{+\infty} f_n$ est intégrable sur $I$ et

  $$\int_I \left( \sum_{n=0}^{+\infty} f_n(t) \right) dt =
  \sum_{n=0}^{+\infty} \int_I f_n(t)\,dt.$$

  **Hors programme.** La démonstration.

  **Commentaire.** On met en évidence le parallélisme de cet énoncé et du
  précédent avec ceux issus de la théorie des familles sommables. On présente
  des exemples sur lesquels cet énoncé ne s'applique pas, mais dans lesquels
  l'intégration terme à terme peut être justifiée par le théorème de
  convergence dominée pour les sommes partielles.

### h) Régularité d'une fonction définie par une intégrale à paramètre

> Pour l'application pratique des énoncés de ce paragraphe, on vérifie les
> hypothèses de régularité par rapport à $x$ et de domination, sans expliciter
> celles relatives à la continuité par morceaux par rapport à $t$.

- Soit $A$ une partie d'un espace normé de dimension finie, $I$ un intervalle
  de $\mathbb{R}$, $f$ une fonction définie sur $A \times I$ à valeurs dans
  $\mathbb{K}$ telle que :
  - pour tout $t \in I$, $f(\cdot, t)$ est continue ;
  - pour tout $x \in A$, $f(x, \cdot)$ est continue par morceaux ;
  - il existe une fonction $\varphi$ intégrable sur $I$ telle que, pour tout
    $x$ de $A$, $|f(x, \cdot)| \leqslant \varphi$.

  Alors $x \mapsto \int_I f(x, t)\,dt$ est définie et continue sur $A$.

  **Commentaire.** En pratique, on vérifie l'hypothèse de domination sur tout
  segment de $A$, ou sur d'autres intervalles adaptés à la situation.
- Soit $I$ et $A$ deux intervalles de $\mathbb{R}$, $f$ une fonction définie
  sur $A \times I$ à valeurs dans $\mathbb{K}$ telle que :
  - pour tout $t \in I$, $f(\cdot, t)$ est de classe $C^1$ sur $A$ ;
  - pour tout $x \in A$, $f(x, \cdot)$ est intégrable sur $I$ ;
  - pour tout $x \in A$, $\dfrac{\partial f}{\partial x}(x, \cdot)$ est
    continue par morceaux sur $I$ ;
  - il existe une fonction $\varphi$ positive intégrable sur $I$ telle que,
    pour tout $x$ de $A$,
    $\left| \dfrac{\partial f}{\partial x}(x, \cdot) \right| \leqslant
    \varphi$.

  Alors $g : x \mapsto \int_I f(x, t)\,dt$ est de classe $C^1$ sur $A$ et
  vérifie :

  $$\forall x \in A, \quad g'(x) = \int_I \frac{\partial f}{\partial x}(x,
  t)\,dt.$$

  **Commentaire.** En pratique, on vérifie l'hypothèse de domination sur tout
  segment de $A$, ou sur d'autres intervalles adaptés à la situation.
- Extension à la classe $C^k$ d'une intégrale à paramètre, sous hypothèse de
  domination de $\dfrac{\partial^k f}{\partial x^k}(x, t)$ et d'intégrabilité
  des $\dfrac{\partial^j f}{\partial x^j}(x, \cdot)$ pour $0 \leqslant j
  \leqslant k - 1$.

  **Commentaire.** Exemples d'études de fonctions définies comme intégrales à
  paramètre : régularité, étude asymptotique.

## Variables aléatoires discrètes

> Cette section généralise aux variables aléatoires discrètes l'étude menée en
> première année des variables aléatoires à valeurs dans un ensemble fini.
> Cette généralisation nécessite d'introduire des notions générales de théorie
> des probabilités, lesquelles font l'objet d'un exposé a minima. En
> particulier :
>
> - la notion de tribu, introduite pour donner un cadre rigoureux, n'appelle
>   aucun développement théorique ;
>
>   **Limite.** La construction d'espaces probabilisés n'est pas un objectif
>   du programme.
>
> - les diverses notions de convergence (presque sûre, en probabilité, en loi)
>   sont hors programme.
>
>   **Hors programme.** Les diverses notions de convergence (presque sûre, en
>   probabilité, en loi).
>
> La théorie des familles sommables permet une extension très naturelle des
> notions et résultats vus en première année. Cette extension est effectuée
> rapidement, de manière à libérer du temps pour les exemples et exercices.
> L'objectif de l'enseignement est en effet de renforcer la compréhension de
> l'aléatoire, en lien avec d'autres parties du programme. On pourra ainsi
> faire travailler les étudiants sur divers objets aléatoires (permutations,
> graphes, matrices...) les inégalités de concentration et des exemples de
> processus à temps discret (marches aléatoires, chaînes de Markov...).
>
> **Hors programme.** La notion de variable à densité.
>
> **Hors programme.** La notion d'espérance conditionnelle.

### a) Ensembles dénombrables

- Un ensemble est dit dénombrable s'il est en bijection avec
  $\mathbb{N}$.

  **Commentaire.** Les parties infinies de $\mathbb{N}$ sont dénombrables.
- Un ensemble est fini ou dénombrable si et seulement s'il est en bijection
  avec une partie de $\mathbb{N}$.

  **Commentaire.** Un tel ensemble est dit au plus dénombrable.
- Un produit cartésien fini d'ensembles dénombrables est dénombrable. Une
  réunion finie ou dénombrable d'ensembles finis ou dénombrables est finie ou
  dénombrable.

  **Non exigible.** Les démonstrations.

  **Commentaire.** Les ensembles $\mathbb{N}^p$ ($p \in \mathbb{N}^*$),
  $\mathbb{Z}$ et $\mathbb{Q}$ sont dénombrables. Le support d'une famille
  sommable de nombres complexes est dénombrable.
- L'ensemble $\mathbb{R}$ n'est pas dénombrable.

  **Non exigible.** La démonstration.

### b) Espaces probabilisés

- Tribu sur un ensemble $\Omega$. Espace probabilisable $(\Omega, \mathcal{A})$.

  **Limite.** La manipulation de tribus n'est pas un objectif du programme.
- Événements.

  **Commentaire.** Généralisation du vocabulaire relatif aux événements
  introduit en première année.
- Probabilité sur un espace probabilisable, $\sigma$-additivité. Espace
  probabilisé $(\Omega, \mathcal{A}, P)$.
- Continuité croissante, continuité décroissante.

  **Commentaire.** Application : pour une suite $(A_n)_{n \in \mathbb{N}}$
  d'événements (non nécessairement monotone), limites quand $n$ tend vers
  l'infini de $P\left( \bigcup_{k=0}^{n} A_k \right)$ et $P\left(
  \bigcap_{k=0}^{n} A_k \right)$.
- Propriété de sous-additivité de $P$ pour une réunion dénombrable
  d'événements.
- Événements négligeables, événements presque sûrs. Une réunion (resp.
  intersection) finie ou dénombrable d'événements négligeables (resp. presque
  sûrs) est un événement négligeable (resp. presque sûr).

  **Commentaire.** Systèmes quasi-complets d'événements.

  **Hors programme.** Tout développement supplémentaire sur ces notions.

### c) Probabilités conditionnelles et indépendance

- Extension des résultats vus en première année : probabilité conditionnelle,
  formule des probabilités composées, formule des probabilités totales,
  formule de Bayes.

  **Commentaire.** Notations $P_B(A)$, $P(A|B)$.
- Par définition, les événements $A$ et $B$ sont indépendants si
  $P(A \cap B) = P(A)P(B)$.

  **Commentaire.** Lorsque $P(B) > 0$, l'indépendance de $A$ et $B$ s'écrit
  $P(A|B) = P(A)$.
- Famille d'événements indépendants.

  **Commentaire.** L'indépendance deux à deux n'implique pas l'indépendance.
- Si $A$ et $B$ sont indépendants, $A$ et $\overline{B}$ le sont aussi.

### d) Espaces probabilisés discrets

- Si $\Omega$ est un ensemble, une distribution de probabilités discrètes sur
  $\Omega$ est une famille d'éléments de $\mathbb{R}^+$ indexée par $\Omega$
  et de somme $1$.

  **Commentaire.** Support d'une distribution de probabilités discrète ; le
  support est au plus dénombrable.
- Probabilité définie sur $\mathcal{A} = \mathcal{P}(\Omega)$ associée à une
  distribution de probabilités discrètes sur $\Omega$.

  **Commentaire.** Si $\Omega$ est au plus dénombrable, on obtient ainsi
  toutes les probabilités sur $\mathcal{P}(\Omega)$.

### e) Variables aléatoires discrètes

- Une variable aléatoire discrète $X$ définie sur l'espace probabilisé
  $(\Omega, \mathcal{A}, P)$ et à valeurs dans $E$ est une application définie
  sur $\Omega$, à valeurs dans l'ensemble $E$, telle que $X(\Omega)$ soit au
  plus dénombrable et que, pour tout $x \in X(\Omega)$, l'ensemble
  $X^{-1}(\{x\})$ appartienne à $\mathcal{A}$.

  **Commentaire.** Notations $(X = x)$, $(X \in A)$, $\{X = x\}$, $\{X \in
  A\}$. Lorsque $E = \mathbb{R}$, la variable aléatoire $X$ est dite réelle.
  Notations $(X \leqslant x)$, $(X \geqslant x)$, $(X < x)$, $(X > x)$ (et
  analogues avec accolades) pour une variable aléatoire réelle $X$.
- Loi $P_X$ d'une variable aléatoire discrète $X$.

  **Commentaire.** La loi de $X$ peut au besoin être définie sur un ensemble
  contenant $X(\Omega)$.

> Dans ce qui suit, toutes les variables aléatoires sont supposées discrètes.

- La probabilité $P_X$ est déterminée par la distribution de probabilités
  discrète $(P(X = x))_{x \in X(\Omega)}$.
- Notation $X \sim Y$.

  **Commentaire.** La notation $X \sim Y$ ne suppose pas que $X$ et $Y$ sont
  définies sur le même espace probabilisé.
- Variable aléatoire $f(X)$. Si $X \sim Y$ alors $f(X) \sim f(Y)$.
- Loi conditionnelle d'une variable aléatoire $X$ sachant un événement $A$.
- Couple de variables aléatoires. Loi conjointe, lois marginales.

  **Commentaire.** Un couple est une variable aléatoire à valeurs dans un
  produit.
- Détermination des lois marginales à partir de la loi conjointe.

  **Commentaire.** Notation $P(X = x, Y = y)$. Extension aux $n$-uplets de
  variables aléatoires.

### f) Variables aléatoires indépendantes

- Couple de variables aléatoires indépendantes, famille finie de variables
  aléatoires indépendantes.

  **Commentaire.** Notation $X \perp\!\!\!\perp Y$. Les variables aléatoires
  $X$ et $Y$ sont indépendantes si et seulement si la distribution de
  probabilités de $(X, Y)$ est le produit des distributions de probabilités de
  $X$ et $Y$. Extension aux $n$-uplets de variables aléatoires.
- Famille quelconque de variables aléatoires indépendantes.
- Fonctions de variables aléatoires indépendantes : si $X \perp\!\!\!\perp Y$,
  alors $f(X) \perp\!\!\!\perp g(Y)$.

  **Commentaire.** Extension au cas de plus de deux variables.
- Lemme des coalitions : si les variables aléatoires $X_1, \dots, X_n$ sont
  indépendantes, les variables aléatoires $f(X_1, \dots, X_m)$ et
  $g(X_{m+1}, \dots, X_n)$ le sont aussi.

  **Commentaire.** Extension au cas de plus de deux coalitions.
- Existence d'espaces probabilisés portant une suite de variables
  indépendantes de lois discrètes données.

  **Non exigible.** La démonstration.

  **Commentaire.** Suites i.i.d. Modélisation du jeu de pile ou face infini :
  suite i.i.d. de variables de Bernoulli.

### g) Lois usuelles

- Pour $p$ dans $]0, 1[$, loi géométrique de paramètre $p$. Variable
  géométrique de paramètre $p$.

  **Commentaire.** Notations $G(p)$, $X \sim G(p)$. Interprétation comme rang
  du premier succès dans le jeu de pile ou face infini.
- Pour $\lambda$ dans $\mathbb{R}_+^*$, loi de Poisson de paramètre $\lambda$.
  Variable de Poisson de paramètre $\lambda$.

  **Commentaire.** Notations $P(\lambda)$, $X \sim P(\lambda)$.
  Interprétation en termes d'événements rares.

### h) Espérance d'une variable aléatoire réelle ou complexe

- Si $X$ est une variable aléatoire à valeurs dans $\mathbb{R}^+ \cup
  \{+\infty\}$, l'espérance de $X$ est la somme, dans $[0, +\infty]$, de la
  famille $(x P(X = x))_{x \in X(\Omega)}$.

  **Commentaire.** Notation $E(X)$.
- Pour une variable aléatoire à valeurs dans $\mathbb{N} \cup \{+\infty\}$,
  égalité

  $$E(X) = \sum_{n=1}^{+\infty} P(X \geqslant n).$$
- Une variable aléatoire complexe $X$ est dite d'espérance finie si la famille
  $(x P(X = x))_{x \in X(\Omega)}$ est sommable ; dans ce cas, la somme de
  cette famille est l'espérance de $X$.

  **Commentaire.** Notation $E(X)$. Variables centrées. La notation $X \in
  \mathcal{L}^1$ signifie que $X$ est d'espérance finie. On ne soulèvera
  aucune difficulté quant à la définition précise de $\mathcal{L}^1$.
- Espérance d'une variable géométrique, d'une variable de Poisson.
- Formule de transfert : soit $X$ une variable aléatoire discrète, $f$ une
  fonction définie sur $X(\Omega)$ à valeurs complexes ; alors $f(X)$ est
  d'espérance finie si et seulement si la famille $(f(x) P(X = x))_{x \in
  X(\Omega)}$ est sommable ; si tel est le cas :

  $$E(f(X)) = \sum_{x \in X(\Omega)} f(x) P(X = x).$$
- Linéarité, positivité, croissance, inégalité triangulaire.

  **Commentaire.** Caractérisation des variables aléatoires à valeurs dans
  $\mathbb{R}^+$ d'espérance nulle.
- Si $|X| \leqslant Y$ et si $Y \in \mathcal{L}^1$, alors $X \in
  \mathcal{L}^1$.
- Si $X$ et $Y$ sont dans $\mathcal{L}^1$ et indépendantes, alors $XY$ est
  dans $\mathcal{L}^1$ et :

  $$E(XY) = E(X)E(Y).$$

  **Commentaire.** Extension au cas de $n$ variables aléatoires.

### i) Variance d'une variable aléatoire réelle, écart type et covariance

- Si $E(X^2) < +\infty$, $X$ est d'espérance finie.

  **Commentaire.** La notation $X \in \mathcal{L}^2$ signifie que $X^2$ est
  d'espérance finie. On ne soulèvera aucune difficulté quant à la définition
  précise de $\mathcal{L}^2$.
- Inégalité de Cauchy-Schwarz : si $X$ et $Y$ sont dans $\mathcal{L}^2$, $XY$
  est dans $\mathcal{L}^1$ et

  $$E(XY)^2 \leqslant E(X^2)\,E(Y^2).$$

  **Commentaire.** Cas d'égalité.
- Pour $X \in \mathcal{L}^2$, variance et écart type de $X$.

  **Commentaire.** Notations $V(X)$, $\sigma(X)$. Variables réduites.
  Caractérisation des variables aléatoires de variance nulle.
- Relation

  $$V(X) = E(X^2) - E(X)^2.$$
- Relation $V(aX + b) = a^2 V(X)$.

  **Commentaire.** Si $\sigma(X) > 0$, la variable aléatoire
  $\dfrac{X - E(X)}{\sigma(X)}$ est centrée réduite.
- Variance d'une variable géométrique, d'une variable de Poisson.
- Covariance de deux variables aléatoires de $\mathcal{L}^2$.

  **Commentaire.** Relation $\operatorname{Cov}(X, Y) = E(XY) - E(X)E(Y)$. Cas
  de variables indépendantes.
- Variance d'une somme de $n$ variables aléatoires, cas de variables
  décorrélées.

### j) Inégalités probabilistes et loi faible des grands nombres

- Inégalité de Markov.
- Inégalité de Bienaymé-Tchebychev.
- Loi faible des grands nombres : si $(X_n)_{n \geqslant 1}$ est une suite
  i.i.d. de variables aléatoires de variance finie, alors, pour tout
  $\varepsilon > 0$,

  $$P\left( \left| \frac{S_n}{n} - m \right| \geqslant \varepsilon \right)
  \xrightarrow[n \to +\infty]{} 0,$$

  où $S_n = \sum_{k=1}^{n} X_k$ et $m = E(X_1)$.

  **Commentaire.** Utilisation des inégalités de Markov et de
  Bienaymé-Tchebychev pour établir des inégalités de concentration.

### k) Fonctions génératrices

- Fonction génératrice de la variable aléatoire $X$ à valeurs dans
  $\mathbb{N}$ :

  $$G_X(t) = E(t^X) = \sum_{k=0}^{+\infty} P(X = k)\,t^k.$$

  **Commentaire.** La série entière définissant $G_X$ est de rayon supérieur
  ou égal à $1$ et converge normalement sur le disque fermé de centre $0$ et
  de rayon $1$. Continuité de $G_X$.
- Détermination de la loi de $X$ par $G_X$.
- La variable aléatoire $X$ est d'espérance finie si et seulement si $G_X$
  est dérivable en $1$ ; dans ce cas $E(X) = G_X'(1)$.

  **Non exigible.** La démonstration de la réciproque.

  **Commentaire.** Utilisation de $G_X$ pour le calcul de $E(X)$ et $V(X)$.
  Les étudiants doivent savoir calculer rapidement la fonction génératrice
  d'une variable aléatoire de Bernoulli, binomiale, géométrique, de Poisson.
- Fonction génératrice d'une somme finie de variables aléatoires indépendantes
  à valeurs dans $\mathbb{N}$.

## Équations différentielles linéaires

> La notion générale d'équation différentielle linéaire est introduite à partir
> des exemples étudiés en première année : équation scalaire d'ordre 1,
> équation scalaire homogène d'ordre 2 à coefficients constants.
>
> **Limite.** La pratique de la résolution explicite des systèmes linéaires à
> coefficients constants n'est pas un objectif du programme.
>
> On limite en conséquence la technicité des exercices sur ce point. On peut en
> revanche présenter aux étudiants divers exemples d'études qualitatives
> d'équations différentielles linéaires scalaires ou de systèmes linéaires.
> Concernant les systèmes à coefficients constants, on pourra souligner le rôle
> du signe des parties réelles des valeurs propres de la matrice ; on pourra
> également, en dimension 2, représenter les courbes intégrales.
>
> Dans cette section, $I$ est un intervalle de $\mathbb{R}$, $E$ un espace
> normé de dimension finie.

### a) Généralités

- Équation différentielle linéaire :

  $$x' = a(t) \cdot x + b(t)$$

  où $a$ est une application continue de $I$ dans $\mathcal{L}(E)$ et $b$ une
  application continue de $I$ dans $E$.

  **Commentaire.** Forme matricielle : système différentiel linéaire
  $X' = A(t)X + B(t)$. Équation différentielle homogène associée à une
  équation différentielle linéaire. Principe de superposition.
- Problème de Cauchy.

  **Commentaire.** Mise sous forme intégrale d'un problème de Cauchy.
- Représentation d'une équation scalaire linéaire d'ordre $n$ par un système
  différentiel linéaire.
- Problème de Cauchy pour une équation linéaire scalaire d'ordre $n$.

### b) Solutions d'une équation différentielle linéaire

- Théorème de Cauchy linéaire : existence et unicité de la solution d'un
  problème de Cauchy.

  **Non exigible.** La démonstration.

  **Commentaire.** Adaptation aux systèmes différentiels linéaires. Cas des
  équations scalaires d'ordre $n$.
- Cas des équations homogènes : l'ensemble des solutions est un sous-espace
  vectoriel de $\mathcal{F}(I, E)$. Pour $t_0$ dans $I$, l'application
  $x \mapsto x(t_0)$ est un isomorphisme de cet espace sur $E$.
- Dimension de l'espace des solutions. Cas des équations scalaires homogènes
  d'ordre $n$.
- Structure de l'ensemble des solutions d'une équation avec second membre.
- Exemples d'équations différentielles linéaires scalaires d'ordre 1 ou 2 non
  normalisées :

  $$a(t)x' + b(t)x = c(t), \qquad a(t)x'' + b(t)x' + c(t)x = d(t).$$

  **Commentaire.** Exemples de recherche de solutions développables en série
  entière.

### c) Exponentielle d'un endomorphisme, d'une matrice

- Exponentielle d'un endomorphisme d'un espace normé de dimension finie, d'une
  matrice réelle ou complexe.

  **Commentaire.** Notations $\exp(a)$, $e^a$, $\exp(A)$, $e^A$.
- Exponentielle d'une matrice diagonale. Exponentielle de matrices
  semblables. Spectre de $\exp(A)$.
- Continuité de l'exponentielle sur $\mathcal{L}(E)$, sur
  $\mathcal{M}_n(\mathbb{K})$.
- Dérivation de $t \mapsto \exp(ta)$, de $t \mapsto \exp(tA)$.
- Exponentielle de la somme de deux endomorphismes, de deux matrices carrées,
  qui commutent.

### d) Systèmes différentiels linéaires homogènes à coefficients constants

- Résolution du problème de Cauchy

  $$x' = a(x), \qquad x(t_0) = x_0$$

  si $a$ est un endomorphisme de $E$ et $x_0$ un élément de $E$.

  **Commentaire.** Traduction matricielle.

  **Limite.** Pour les calculs explicites, on se limite aux deux cas suivants
  : $a$ diagonalisable ou $\dim(E) \leqslant 3$.

### e) Variation des constantes

- Pour une équation différentielle linéaire scalaire homogène d'ordre 2,
  wronskien d'un couple de solutions. Caractérisation des bases de l'espace
  des solutions.
- Méthode de variation des constantes pour les équations différentielles
  linéaires d'ordre 2.

## Calcul différentiel et optimisation

> En première année, l'étudiant a rencontré les dérivées partielles d'une
> fonction numérique définie sur un ouvert de $\mathbb{R}^2$. Les objectifs de
> cette section sont les suivants :
>
> - généraliser et approfondir cette étude, en présentant les notions
>   fondamentales de calcul différentiel dans le cadre des espaces vectoriels
>   normés de dimension finie sur $\mathbb{R}$ ;
> - donner une introduction à la thématique de l'optimisation, en lien avec le
>   théorème des bornes atteintes du cours de topologie.
>
> On souligne le caractère géométrique des notions. En particulier, on
> exploite la possibilité de se ramener, pour un certain nombre de questions,
> à des fonctions d'une variable réelle, à travers l'utilisation de la formule
> donnant la dérivée d'une fonction le long d'un arc et la notion de vecteur
> tangent à une partie en un point.
>
> Les fonctions considérées dans cette section sont définies sur un ouvert
> d'un $\mathbb{R}$-espace vectoriel normé $E$ de dimension finie et à valeurs
> dans un $\mathbb{R}$-espace vectoriel normé $F$ de dimension finie.
>
> Le choix d'une base de l'espace d'arrivée permet de se ramener au cas des
> fonctions à valeurs réelles.

### a) Dérivée selon un vecteur, dérivées partielles

- Dérivée de l'application $f$ au point $a$ selon le vecteur $v$.

  **Commentaire.** Notations $D_v f(a)$, $D_v f$.
- Dérivées partielles dans une base.

  **Commentaire.** Notations $\dfrac{\partial f}{\partial x_i}(a)$,
  $\partial_i f(a)$. Lorsqu'une base de $E$ est fixée, identification entre
  $f(x)$ et $f(x_1, \dots, x_n)$.

### b) Différentielle

- Application différentiable au point $a$.

  **Commentaire.** Notation $o(h)$. Développement limité à l'ordre 1. Lorsque
  $f = (f_1, \dots, f_p)$, $f$ est différentiable en $a$ si et seulement si
  toutes les $f_i$ le sont.
- Si $f$ est différentiable en $a$, alors $f$ est continue en $a$ et dérivable
  en $a$ selon tout vecteur.
- Différentielle de $f$ en $a$, encore appelée application linéaire tangente à
  $f$ en $a$. Unicité de la différentielle et relation
  $df(a) \cdot v = D_v f(a)$.

  **Commentaire.** Notation $df(a)$.
- Application différentiable sur un ouvert $\Omega$. Différentielle sur
  $\Omega$.

  **Commentaire.** Notation $df$.
- Cas particuliers : application constante, application linéaire.
- Lien entre différentielle et dérivées partielles.

  **Commentaire.** Si $\Omega$ est un ouvert de $\mathbb{R}^n$ et si $f$ est à
  valeurs dans $\mathbb{R}^m$, la matrice jacobienne de $f$ en $a$ est la
  matrice de $df(a)$ dans les bases canoniques.
- Cas des fonctions d'une variable : si $\Omega$ est un intervalle ouvert de
  $\mathbb{R}$, la différentiabilité de $f$ en $a$ équivaut à la dérivabilité
  de $f$ en $a$ ; relation $f'(a) = df(a) \cdot 1$.
- Si l'espace $E$ est euclidien, gradient en $a$ d'une application numérique
  différentiable en $a$. Expression du gradient en base orthonormée.

  **Commentaire.** Notation $\nabla f(a)$. Interprétation géométrique : si
  $\nabla f(a) \neq 0$, $\nabla f(a)$ est positivement colinéaire au vecteur
  unitaire selon lequel la dérivée de $f$ en $a$ est maximale.

### c) Opérations sur les applications différentiables

- Différentielle d'une combinaison linéaire d'applications différentiables,
  de $M(f_1, \dots, f_p)$ où $M$ est multilinéaire et où $f_1, \dots, f_p$
  sont des applications différentiables.
- Règle de la chaîne : différentielle d'une composée d'applications
  différentiables.
- Dérivée le long d'un arc : si $\gamma$ est une application définie sur
  l'intervalle $I$ de $\mathbb{R}$, dérivable en $t$, si $f$ est
  différentiable en $\gamma(t)$, alors

  $$(f \circ \gamma)'(t) = df(\gamma(t)) \cdot \gamma'(t).$$

  **Commentaire.** Interprétation géométrique en termes de tangentes. Cas
  particulier fondamental : $\gamma(t) = x + tv$. Dérivation de
  $t \mapsto f(x_1(t), \dots, x_n(t))$.
- Dérivées partielles d'une composée d'applications différentiables.

  **Commentaire.** Dérivées partielles de $(u_1, \dots, u_m) \mapsto
  f(x_1(u_1, \dots, u_m), \dots, x_n(u_1, \dots, u_m))$.

### d) Applications de classe $C^1$

- Une application $f$ est dite de classe $C^1$ sur un ouvert $\Omega$ si elle
  est différentiable sur $\Omega$ et si $df$ est continue sur $\Omega$.
- L'application $f$ est de classe $C^1$ sur $\Omega$ si et seulement si les
  dérivées partielles relativement à une base de $E$ existent en tout point de
  $\Omega$ et sont continues sur $\Omega$.

  **Non exigible.** La démonstration.
- Opérations algébriques sur les applications de classe $C^1$.
- Si $f$ est une application de classe $C^1$ de $\Omega$ dans $F$, si $\gamma$
  est une application de classe $C^1$ de $[0, 1]$ dans $\Omega$, si
  $\gamma(0) = a$ et $\gamma(1) = b$, alors :

  $$f(b) - f(a) = \int_{0}^{1} df(\gamma(t)) \cdot \gamma'(t)\,dt.$$

  **Commentaire.** Cas particulier $\gamma(t) = a + tv$ pour tout
  $t \in [0, 1]$.
- Si $\Omega$ est connexe par arcs, caractérisation des fonctions constantes
  sur $\Omega$.

  **Commentaire.** Démonstration pour $\Omega$ convexe.

### e) Vecteurs tangents à une partie d'un espace normé de dimension finie

- Si $X$ est une partie de $E$ et $x$ un point de $X$, un vecteur $v$ de $E$
  est tangent à $X$ en $x$ s'il existe $\varepsilon > 0$ et un arc $\gamma$
  défini sur $]-\varepsilon, \varepsilon[$, à valeurs dans $X$, dérivable en
  $0$, tel que $\gamma(0) = x$, $\gamma'(0) = v$.

  **Commentaire.** Notation $T_x X$ pour l'ensemble des vecteurs tangents à
  $X$ en $x$. Exemples : sous-espace affine, sphère d'un espace euclidien,
  graphe d'une fonction numérique définie sur un ouvert de $\mathbb{R}^2$.
- Si $g$ est une fonction numérique définie et de classe $C^1$ sur l'ouvert
  $\Omega$ de $E$, si $x \in X$ et $dg(x) \neq 0$, alors $T_x X$ est égal au
  noyau de $dg(x)$.

  **Hors programme.** La démonstration de cet énoncé et le théorème des
  fonctions implicites.

  **Commentaire.** Traduction en termes de gradient si $E$ est euclidien, en
  particulier pour $E = \mathbb{R}^n$ muni de sa structure euclidienne
  canonique. Exemple : plan tangent à une surface de $\mathbb{R}^3$ définie
  par une équation.

### f) Optimisation : étude au premier ordre

- Point critique d'une application différentiable.
- Condition nécessaire d'existence d'un extremum local en un point intérieur.

  **Commentaire.** Exemples de recherches d'extremums globaux.
- Si $f$ est une fonction numérique définie sur l'ouvert $\Omega$, si $X$ est
  une partie de $\Omega$, si la restriction de $f$ à $X$ admet un extremum
  local en $x$ et si $f$ est différentiable en $x$, alors $df(x)$ s'annule en
  tout vecteur tangent à $X$ en $x$.
- Théorème d'optimisation sous une contrainte : si $f$ et $g$ sont des
  fonctions numériques définies et de classe $C^1$ sur l'ouvert $\Omega$ de
  $E$, si $X$ est l'ensemble des zéros de $g$, si $x \in X$ et $dg(x) \neq 0$
  et si la restriction de $f$ à $X$ admet un extremum local en $x$, alors
  $df(x)$ est colinéaire à $dg(x)$.

  **Commentaire.** Si $E$ est euclidien, traduction en termes de gradient.
  Exemples de recherches d'extremums sous contrainte.

### g) Applications de classe $C^k$

- Dérivées partielles d'ordre $k$ d'une fonction définie sur un ouvert de
  $\mathbb{R}^n$.

  **Commentaire.** Notations $\dfrac{\partial^k f}{\partial x_{j_k} \dots
  \partial x_{j_1}}$, $\partial_{j_k} \dots \partial_{j_1} f$,
  $\partial_{j_1, \dots, j_k} f$.
- Une application est dite de classe $C^k$ sur un ouvert $\Omega$ de
  $\mathbb{R}^n$ si ses dérivées partielles d'ordre $k$ existent et sont
  continues sur $\Omega$.

  **Hors programme.** La notion de différentielle seconde.
- Théorème de Schwarz.

  **Non exigible.** La démonstration.
- Opérations algébriques sur les applications de classe $C^k$.

  **Non exigible.** Les démonstrations.
- Composition d'applications de classe $C^k$.

  **Commentaire.** Exemples simples d'équations aux dérivées partielles du
  premier et du second ordre.

### h) Optimisation : étude au second ordre

- Matrice hessienne en un point d'une fonction de classe $C^2$ sur un ouvert
  de $\mathbb{R}^n$, à valeurs réelles.

  **Commentaire.** Notation $H_f(x)$.
- Formule de Taylor-Young à l'ordre 2 :

  $$f(x + h) = f(x) + \langle \nabla f(x), h \rangle +
  \frac{1}{2} \langle H_f(x) \cdot h, h \rangle + o(||h||^2) \quad
  (h \to 0)$$

  ou encore

  $$f(x + h) = f(x) + \nabla f(x)^{\mathsf{T}} h + \frac{1}{2} h^{\mathsf{T}}
  H_f(x) h + o(||h||^2) \quad (h \to 0).$$

  **Non exigible.** La démonstration.
- Si $f$ est une fonction de classe $C^2$ sur un ouvert de $\mathbb{R}^n$ et
  si $f$ admet un minimum local en $x$, alors $x$ est point critique de $f$ et
  $H_f(x) \in \mathcal{S}_n^+(\mathbb{R})$.

  **Commentaire.** Adaptation au cas d'un maximum local.
- Si $f$ est une fonction de classe $C^2$ sur un ouvert de $\mathbb{R}^n$, si
  $x$ est point critique de $f$ et si $H_f(x) \in
  \mathcal{S}_n^{++}(\mathbb{R})$, alors $f$ atteint un minimum local strict
  en $x$.

  **Commentaire.** Adaptation au cas d'un maximum local. Explicitation pour
  $n = 2$ (trace et déterminant).
