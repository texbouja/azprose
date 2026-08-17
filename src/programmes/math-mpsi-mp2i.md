---
id: mathematiques-mpsi-mp2i
filiere: [MPSI, MP2I]
matiere: mathematiques
niveau: 1
source: "Annexe 1 — Programme de mathématiques, classes préparatoires MPSI et MP2I, MESRI 2021"
---

# Programme de mathématiques — MPSI, MP2I

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
| Citation `>` en tête de **partie** (A, B, C…) | hypothèse de travail, cadre de la partie | toute la partie |
| Citation `>` en tête de **sous-section** | hypothèse de travail | toute la sous-section |

À savoir, faute de quoi la lecture est faussée :

- **L'absence d'intitulé sous un item n'est pas un oubli** : elle signifie
  qu'aucun commentaire ne l'accompagne dans le source, donc qu'il est exigible
  sans restriction.
- Un même item peut porter **plusieurs intitulés** de natures différentes.
- `**Hors programme.**` est la seule mention **prohibitive** ; `**Limite.**` et
  `**Non exigible.**` restreignent sans exclure.
- Une citation en tête de section peut elle aussi porter un intitulé : il vaut
  alors pour **toute** la section.
- Le document source est découpé en deux semestres, puis en sections ; les
  sections à parties sont signalées par une lettre (A, B, C…) énumérant les
  parties, et les sous-sections par une lettre minuscule (a), b), c)…).
- Cette transcription est **dérivée** ; les formules y sont rendues en
  $\LaTeX$. En cas de doute, le document cité en `source` fait foi.

---

# Premier semestre

## Raisonnement et vocabulaire ensembliste

> Cette section regroupe les différents points de vocabulaire, notations,
> outils et raisonnements nécessaires aux étudiants pour la conception et la
> rédaction efficace d'une démonstration mathématique. Ces notions doivent être
> introduites de manière progressive. Leur acquisition est un objectif pour la
> fin du premier semestre.
>
> **Limite.** Le programme se limite strictement aux notions de base figurant
> ci-dessous.
>
> **Hors programme.** Toute étude systématique de la logique ou de la théorie
> des ensembles.

### a) Rudiments de logique

- Quantificateurs.

  **Hors programme.** L'emploi de quantificateurs en guise d'abréviation.
- Implication, contraposition, équivalence.

  **Commentaire.** Les étudiants doivent savoir formuler la négation d'une
  proposition.
- Modes de raisonnement : par disjonction des cas, par contraposition, par
  l'absurde, par analyse-synthèse.

  **Commentaire.** Le raisonnement par analyse-synthèse est l'occasion de
  préciser les notions de condition nécessaire et condition suffisante.
- Raisonnement par récurrence (simple, double, forte).

  **Commentaire.** On pourra relier le raisonnement par récurrence au fait que
  toute partie non vide de $\mathbb{N}$ possède un plus petit élément.

  **Hors programme.** Toute construction et toute axiomatique de
  $\mathbb{N}$.

### b) Ensembles

- Ensemble, appartenance. Ensemble vide.
- Inclusion. Partie (ou sous-ensemble).
- Opérations sur les parties d'un ensemble : réunion, intersection,
  différence, complémentaire.

  **Commentaire.** Notation $A \setminus B$ pour la différence et
  $E \setminus A$, $\overline{A}$ et $A^c$ pour le complémentaire.
- Produit cartésien d'un nombre fini d'ensembles.
- Ensemble des parties d'un ensemble.

  **Commentaire.** Notation $\mathcal{P}(E)$.
- Recouvrement disjoint, partition.

### c) Applications et relations

- Application d'un ensemble dans un ensemble.

  **Commentaire.** Le point de vue est intuitif : une application de $E$ dans
  $F$ associe à tout élément de $E$ un unique élément de $F$.
- Graphe d'une application.

  **Commentaire.** Le programme ne distingue pas les notions de fonction et
  d'application. Notations $\mathcal{F}(E, F)$ et $\mathcal{F}^E$.
- Famille d'éléments d'un ensemble.
- Fonction indicatrice d'une partie d'un ensemble.

  **Commentaire.** Notation $\mathbf{1}_A$.
- Restriction et prolongement.

  **Commentaire.** Notation $f_{|A}$.
- Image directe.

  **Commentaire.** Notation $f(A)$.
- Image réciproque.

  **Commentaire.** Notation $f^{-1}(B)$. Cette notation pouvant prêter à
  confusion, on peut provisoirement en utiliser une autre.
- Composition.
- Injection, surjection. Composée de deux injections, de deux surjections.
- Bijection, réciproque. Composée de deux bijections, réciproque de la
  composée.

  **Commentaire.** Notation $f^{-1}$. Compatibilité de cette notation avec
  celle de l'image réciproque.
- Relation binaire sur un ensemble.
- Relation d'équivalence, classes d'équivalence.

  **Hors programme.** La notion d'ensemble quotient.

  **Commentaire.** Les classes d'équivalence forment une partition de
  l'ensemble sous-jacent.

  **Commentaire.** Congruences dans $\mathbb{R}$, dans $\mathbb{Z}$. Notation
  $a \equiv b \ [c]$.
- Relation d'ordre. Ordre partiel, total.

---

## Compléments de calcul algébrique et de trigonométrie

> Cette section « boîte à outils » complète l'enseignement du lycée sur un
> certain nombre de points importants pour la suite :
>
> - calculs de sommes et de produits, dont la formule du binôme ;
> - résolution de petits systèmes linéaires par l'algorithme du pivot ;
> - manipulation d'inégalités et résolution d'inéquations ;
> - utilisation du cercle trigonométrique, manipulation des lignes et fonctions
>   trigonométriques.

### a) Sommes et produits

- Somme et produit d'une famille finie de nombres réels.

  **Commentaire.** Notations $\sum_{i \in I} a_i$, $\sum_{i=1}^{n} a_i$,
  $\prod_{i \in I} a_i$, $\prod_{i=1}^{n} a_i$. Cas où $I$ est vide.
- Sommes et produits télescopiques, exemples de changements d'indices et de
  regroupements de termes.

  **Commentaire.** Dans la pratique, on est libre de présenter les calculs avec
  des points de suspension.
- Expressions simplifiées de $\sum_{k=1}^{n} k$, $\sum_{k=1}^{n} k^2$,
  $\sum_{k=0}^{n} x^k$.
- Factorisation de $a^n - b^n$ par $a - b$.
- Sommes doubles. Produit de deux sommes finies.

  **Commentaire.** Exemples de sommes triangulaires.
- Rappels sur la factorielle, les coefficients binomiaux.

  **Commentaire.** Convention $\binom{n}{k} = 0$ pour $k < 0$ et $k > n$.
- Formule du binôme dans $\mathbb{R}$.

### b) Résolution de petits systèmes linéaires par la méthode du pivot

- Système linéaire à coefficients réels de deux ou trois équations à deux ou
  trois inconnues.

  **Commentaire.** Interprétation géométrique : intersection de droites dans
  $\mathbb{R}^2$, de plans dans $\mathbb{R}^3$.
- Algorithme du pivot et mise en évidence des opérations élémentaires.

  **Commentaire.** Notations $L_i \leftrightarrow L_j$, $L_i \leftarrow
  \lambda L_i$ ($\lambda \neq 0$), $L_i \leftarrow L_i + \lambda L_j$.

### c) Inégalités

- Relation d'ordre sur $\mathbb{R}$. Compatibilité avec les opérations.
  Intervalles de $\mathbb{R}$.

  **Commentaire.** Exemples de majoration et de minoration de sommes, de
  produits et de quotients. Utilisation de factorisations et de tableaux de
  signes. Résolution d'inéquations.
- Valeur absolue. Inégalité triangulaire.

  **Commentaire.** Interprétation sur la droite réelle d'inégalités du type
  $|x - a| \leqslant b$.
- Dans $\mathbb{R}$, parties majorées, minorées, bornées.
- Majorant, minorant ; maximum, minimum.
- Partie entière d'un nombre réel.

  **Commentaire.** Notation $\lfloor x \rfloor$.

### d) Trigonométrie

- Cercle trigonométrique. Paramétrisation par cosinus et sinus.
- Relation de congruence modulo $2\pi$ sur $\mathbb{R}$.

  **Commentaire.** Notation $a \equiv b \ [2\pi]$.
- Cosinus et sinus de $\pi \pm x$, de $\frac{\pi}{2} \pm x$.

  **Commentaire.** Les étudiants doivent savoir retrouver ces résultats et
  résoudre des équations et inéquations trigonométriques simples en s'aidant du
  cercle trigonométrique.
- Cosinus et sinus des angles usuels.
- Formules d'addition $\cos(a \pm b)$, $\sin(a \pm b)$. Cas particulier des
  formules de duplication : $\cos(2a)$, $\sin(2a)$.

  **Commentaire.** On présente une justification géométrique de l'une de ces
  formules. Les étudiants doivent savoir retrouver rapidement les formules
  donnant $\cos(a)\cos(b)$, $\cos(a)\sin(b)$, $\sin(a)\sin(b)$.
- Fonctions circulaires cosinus et sinus.

  **Commentaire.** On justifie les formules donnant les fonctions dérivées de
  sinus et cosinus vues en classe de terminale.
- Pour $x \in \mathbb{R}$, inégalité $|\sin(x)| \leqslant |x|$.
- Fonction tangente.

  **Commentaire.** Notation $\tan$. Dérivée, variations, représentation
  graphique.
- Tangente de $\pi \pm x$. Tangente des angles usuels.

  **Commentaire.** Interprétation sur le cercle trigonométrique.
- Formule d'addition $\tan(a \pm b)$.

  **Commentaire.** Les étudiants doivent savoir retrouver l'expression de
  $\cos(t)$ et $\sin(t)$ en fonction de $\tan(t/2)$.

## Nombres complexes

> L'objectif de cette section, que l'on illustrera par de nombreuses figures,
> est de donner une solide pratique des nombres complexes, à travers les
> aspects suivants :
>
> - l'étude algébrique du corps $\mathbb{C}$ et la notion d'équation
>   algébrique ;
> - l'interprétation géométrique des nombres complexes et l'utilisation des
>   nombres complexes en géométrie plane ;
> - l'exponentielle complexe et ses applications à la trigonométrie.

### a) Nombres complexes

- Parties réelle et imaginaire.

  **Hors programme.** La construction de $\mathbb{C}$.
- Opérations sur les nombres complexes.
- Brève extension du calcul de $\sum_{k=0}^{n} x^k$, de la factorisation de
  $a^n - b^n$, de la formule du binôme.
- Point du plan associé à un nombre complexe, affixe d'un point, affixe d'un
  vecteur.

  **Commentaire.** On identifie $\mathbb{C}$ au plan usuel muni d'un repère
  orthonormé direct (« plan complexe »).

### b) Conjugaison et module

- Conjugaison, compatibilité avec les opérations.

  **Commentaire.** Image du conjugué dans le plan complexe.
- Module.

  **Commentaire.** Interprétation géométrique de $|z - z'|$, cercles et
  disques.
- Relation $|z|^2 = z\overline{z}$, module d'un produit, d'un quotient.
- Inégalité triangulaire, cas d'égalité.

### c) Nombres complexes de module 1 et trigonométrie

- Identification du cercle trigonométrique et de l'ensemble des nombres
  complexes de module 1. Définition de $e^{it}$ pour $t \in \mathbb{R}$.

  **Commentaire.** Notation $\mathbb{U}$.
- Exponentielle d'une somme.
- Formules d'Euler. Technique de l'angle moitié : factorisation de
  $1 \pm e^{it}$, de $e^{ip} \pm e^{iq}$.

  **Commentaire.** Les étudiants doivent savoir retrouver les formules donnant
  $\cos(p) \pm \cos(q)$, $\sin(p) \pm \sin(q)$. Linéarisation, calcul de
  $\sum_{k=0}^{n} \cos(kt)$ et de $\sum_{k=0}^{n} \sin(kt)$.
- Formule de Moivre.

  **Commentaire.** Les étudiants doivent savoir retrouver les expressions de
  $\cos(nt)$ et $\sin(nt)$ en fonction de $\cos t$ et $\sin t$.

### d) Forme trigonométrique

- Forme trigonométrique $r e^{i\theta}$ ($r > 0$) d'un nombre complexe non
  nul. Arguments. Arguments d'un produit, d'un quotient.
- Transformation de $a \cos t + b \sin t$ en $A \cos(t - \varphi)$.

### e) Équations algébriques

- Pour $P$ fonction polynomiale à coefficients complexes admettant $a$ pour
  racine, factorisation de $P(z)$ par $z - a$.
- Résolution des équations du second degré dans $\mathbb{C}$.

  **Commentaire.** Calcul des racines carrées d'un nombre complexe donné sous
  forme algébrique.
- Somme et produit des racines.

### f) Racines n-ièmes

- Description des racines n-ièmes de l'unité, d'un nombre complexe non nul
  donné sous forme trigonométrique.

  **Commentaire.** Notation $\mathbb{U}_n$. Représentation géométrique.

### g) Exponentielle complexe

- Définition de $e^z$ pour $z$ complexe :
  $e^z = e^{\operatorname{Re}(z)} e^{i\operatorname{Im}(z)}$.

  **Commentaire.** Notations $\exp(z)$, $e^z$. Module et arguments de $e^z$.
- Exponentielle d'une somme.
- Pour tous $z$ et $z'$ dans $\mathbb{C}$, $\exp(z) = \exp(z')$ si et
  seulement si $z - z' \in 2i\pi\mathbb{Z}$.
- Résolution de l'équation $\exp(z) = a$.

### h) Interprétation géométrique des nombres complexes

- Interprétation géométrique des module et arguments de $\frac{c - a}{b - a}$.

  **Commentaire.** Traduction de l'alignement, de l'orthogonalité.
- Interprétation géométrique des applications $z \mapsto az + b$ pour
  $(a, b) \in \mathbb{C}^* \times \mathbb{C}$.

  **Commentaire.** Similitudes directes. Cas particuliers : translations,
  homothéties, rotations.
- Interprétation géométrique de la conjugaison.

  **Hors programme.** L'étude générale des similitudes.

---

## Techniques fondamentales de calcul différentiel et intégral

> Le point de vue adopté dans cette section est pratique : il s'agit, en
> prenant appui sur les acquis du lycée, de mettre en œuvre les techniques de
> base de l'analyse. La mise en place rigoureuse des notions abordées fait
> l'objet de sections ultérieures.
>
> Les objectifs de formation sont les suivants :
>
> - l'introduction de fonctions pour établir des inégalités et résoudre des
>   problèmes d'optimisation ;
> - la manipulation des fonctions classiques dont le corpus est étendu ;
> - le calcul de dérivées et de primitives ;
> - la mise en pratique, sur des exemples simples, de l'intégration par parties
>   et du changement de variable ;
> - l'application des deux points précédents aux équations différentielles.
>
> Le cours sur les équations différentielles est illustré par des exemples
> issus des autres disciplines scientifiques.

### A - Fonctions d'une variable réelle à valeurs réelles ou complexes

### a) Généralités sur les fonctions

- Ensemble de définition.
- Représentation graphique d'une fonction $f$ à valeurs réelles.

  **Commentaire.** Les étudiants doivent savoir déduire de la représentation
  graphique de $f$ celles de fonctions obtenues par des transformations
  simples, comme $x \mapsto f(x + a)$ ou $x \mapsto f(ax)$.
- Parité, imparité, périodicité.

  **Commentaire.** Interprétation géométrique de ces propriétés. Utilisation
  pour la réduction du domaine d'étude.
- Somme, produit, composée.
- Monotonie (large et stricte).
- Fonctions majorées, minorées, bornées.

  **Commentaire.** Traduction géométrique de ces propriétés. La fonction $f$
  est bornée si et seulement si $|f|$ est majorée.

### b) Dérivation

- Dérivée d'une fonction.

  **Commentaire.** Notations $f'(x)$, $\frac{d}{dx} f(x)$.
- Dérivée d'une combinaison linéaire, d'un produit, d'un quotient, d'une
  composée.

  **Commentaire.** Ces résultats sont rappelés, avec la définition de la
  dérivée et l'équation de la tangente ; ils ne sont pas démontrés à ce stade.
  Exemples simples de calculs de dérivées partielles.
- Caractérisation des fonctions constantes, (dé)croissantes, strictement
  (dé)croissantes, parmi les fonctions dérivables sur un intervalle.

  **Commentaire.** Résultats admis à ce stade.
- Tableau de variations. Étude pratique d'une fonction. Tracé du graphe.

  **Commentaire.** Application : recherche d'extremums, démonstration
  d'inégalités.
- Représentation graphique et dérivée d'une fonction réciproque.

  **Commentaire.** La formule donnant la dérivée est admise, mais on en donne
  l'interprétation géométrique.
- Fonction de classe $C^1$.
- Dérivées d'ordre supérieur.

### c) Fonctions usuelles

- Fonctions exponentielle, logarithme népérien, puissances.

  **Commentaire.** Dérivée, variations, représentation graphique. Les fonctions
  puissances sont définies sur $\mathbb{R}_+^*$ et prolongées en $0$ le cas
  échéant. Seules les fonctions puissances entières sont en outre définies sur
  $\mathbb{R}_-^*$. Logarithme décimal, logarithme en base 2.
- Relations $(xy)^\alpha = x^\alpha y^\alpha$, $x^{\alpha + \beta} = x^\alpha
  x^\beta$, $(x^\alpha)^\beta = x^{\alpha\beta}$.
- Croissances comparées des fonctions logarithme, puissances et exponentielle.
- Inégalités $\exp(x) \geqslant 1 + x$, $\ln(1 + x) \leqslant x$.
- Fonctions circulaires réciproques Arcsin, Arccos, Arctan.

  **Commentaire.** Dérivée, variations, représentation graphique.
- Fonctions hyperboliques $\operatorname{sh}$, $\operatorname{ch}$,
  $\operatorname{th}$.

  **Commentaire.** Dérivée, variations, représentation graphique.

  **Hors programme.** Les fonctions hyperboliques réciproques.

  **Commentaire.** La seule formule exigible est
  $\operatorname{ch}^2(x) - \operatorname{sh}^2(x) = 1$.

### d) Dérivation d'une fonction complexe d'une variable réelle

- Dérivée d'une fonction à valeurs complexes.

  **Commentaire.** La dérivée est définie par les parties réelle et imaginaire.
- Dérivée d'une combinaison linéaire, d'un produit, d'un quotient.

  **Commentaire.** Brève extension des résultats sur les fonctions à valeurs
  réelles.
- Dérivée de $\exp(\varphi)$ où $\varphi$ est une fonction dérivable à valeurs
  complexes.

### B - Primitives et équations différentielles linéaires

### a) Calcul de primitives

- Primitives d'une fonction définie sur un intervalle à valeurs complexes.
  Lien entre intégrales et primitives.

  **Commentaire.** Description de l'ensemble des primitives d'une fonction sur
  un intervalle connaissant l'une d'entre elles. On rappelle sans démonstration
  que, pour une fonction continue $f$, $x \mapsto \int_{x_0}^{x} f(t)\,dt$ a
  pour dérivée $f$. On pourra noter $\int^{x} f(t)\,dt$ une primitive générique
  de $f$.
- Calcul des primitives, application au calcul d'intégrales.

  **Commentaire.** Primitives de $x \mapsto e^{\lambda x}$ pour $\lambda \in
  \mathbb{C}$, application aux primitives de $x \mapsto e^{ax}\cos(bx)$ et
  $x \mapsto e^{ax}\sin(bx)$.
- Primitives des fonctions exponentielle, logarithme, puissances,
  trigonométriques et hyperboliques, et des fonctions
  $x \mapsto \frac{1}{1 + x^2}$, $x \mapsto \frac{1}{\sqrt{1 - x^2}}$.

  **Commentaire.** Les étudiants doivent savoir calculer les primitives de
  fonctions du type $x \mapsto \frac{1}{ax^2 + bx + c}$ et reconnaître les
  dérivées de fonctions composées.
- Intégration par parties, changement de variable.

  **Commentaire.** Pour les applications pratiques, on ne demande pas de
  rappeler les hypothèses de régularité.

### b) Équations différentielles linéaires du premier ordre

- Équation différentielle linéaire du premier ordre

  $$y' + a(x)y = b(x)$$

  où $a$ et $b$ sont des fonctions réelles ou complexes définies et continues
  sur un intervalle $I$ de $\mathbb{R}$.

  **Commentaire.** Équation homogène associée. Cas particulier où la fonction
  $a$ est constante.
- Ensemble des solutions de l'équation homogène.
- Principe de superposition.
- Description de l'ensemble des solutions de l'équation à partir d'une
  solution particulière et des solutions de l'équation homogène associée.
- Méthode de la variation de la constante.
- Existence et unicité de la solution d'un problème de Cauchy.

### c) Équations différentielles linéaires du second ordre à coefficients constants

- Équation différentielle linéaire du second ordre à coefficients constants

  $$y'' + a y' + b y = f(x)$$

  où $a$ et $b$ sont des scalaires et $f$ est une fonction réelle ou complexe,
  définie et continue sur un intervalle.

  **Commentaire.** Équation homogène associée.
- Ensemble des solutions de l'équation homogène.

  **Commentaire.** Si $a$ et $b$ sont réels, description des solutions réelles.
- Principe de superposition.
- Description de l'ensemble des solutions de l'équation à partir d'une
  solution particulière et des solutions de l'équation homogène associée.

  **Commentaire.** Les étudiants doivent savoir déterminer une solution
  particulière dans le cas d'un second membre polynôme, de la forme
  $x \mapsto Ae^{\lambda x}$ avec $(A, \lambda) \in \mathbb{C}^2$,
  $x \mapsto B\cos(\omega x)$ et $x \mapsto B\sin(\omega x)$ avec
  $(B, \omega) \in \mathbb{R}^2$.
- Existence et unicité de la solution d'un problème de Cauchy.

  **Hors programme.** La démonstration de ce résultat.

---

## Nombres réels et suites numériques

> L'objectif de cette section est de donner une base solide à l'étude des
> suites réelles. On insiste sur le caractère fondamental de la propriété de la
> borne supérieure.
>
> Dans l'étude des suites, on distingue nettement les aspects qualitatifs
> (monotonie, convergence, divergence) des aspects quantitatifs (majoration,
> encadrement, vitesse de convergence ou de divergence).

### a) Ensembles de nombres usuels

- Entiers naturels, relatifs, nombres décimaux, rationnels, réels,
  irrationnels.

  **Hors programme.** Les constructions des ensembles de nombres usuels (et en
  particulier celle de $\mathbb{R}$).
- Approximations décimales d'un réel.

  **Commentaire.** Valeurs décimales approchées à la précision $10^{-n}$ par
  défaut et par excès.
- Tout intervalle ouvert non vide rencontre $\mathbb{Q}$ et
  $\mathbb{R} \setminus \mathbb{Q}$.
- Droite achevée $\overline{\mathbb{R}}$.

### b) Propriété de la borne supérieure

- Borne supérieure (resp. inférieure) d'une partie de $\mathbb{R}$.

  **Commentaire.** Notations $\sup X$, $\inf X$.
- Toute partie non vide et majorée (resp. minorée) de $\mathbb{R}$ admet une
  borne supérieure (resp. inférieure).
- Une partie $X$ de $\mathbb{R}$ est un intervalle si et seulement si pour tous
  $a, b \in X$ tels que $a \leqslant b$, $[a, b] \subset X$.

### c) Généralités sur les suites réelles

- Suite majorée, minorée, bornée. Suite stationnaire, monotone, strictement
  monotone.

  **Commentaire.** Une suite $(u_n)_{n \in \mathbb{N}}$ est bornée si et
  seulement si $(|u_n|)_{n \in \mathbb{N}}$ est majorée.
- Mode de définition d'une suite réelle : explicite, implicite, par récurrence.

### d) Limite d'une suite réelle

- Limite finie ou infinie d'une suite.

  **Commentaire.** Les définitions sont énoncées avec des inégalités larges.
- Unicité de la limite.

  **Commentaire.** Notations $u_n \to \ell$, $\lim u_n$.
- Suite convergente, divergente.
- Toute suite convergente est bornée.
- Opérations sur les limites : combinaison linéaire, produit, quotient.

  **Commentaire.** Produit d'une suite bornée et d'une suite de limite nulle.
- Passage à la limite d'une inégalité large.
- Si $(u_n)_{n \in \mathbb{N}}$ converge vers $\ell > 0$, alors $u_n > 0$ à
  partir d'un certain rang.
- Existence d'une limite par encadrement (limite finie), par minoration (limite
  $+\infty$), par majoration (limite $-\infty$).

  **Commentaire.** Utilisation d'une majoration de la forme $|u_n - \ell|
  \leqslant v_n$, où $(v_n)$ converge vers $0$.

### e) Suites monotones

- Théorème de la limite monotone.
- Théorème des suites adjacentes.

### f) Suites extraites

- Suite extraite. Si une suite possède une limite, toutes ses suites extraites
  possèdent la même limite.

  **Commentaire.** Utilisation pour montrer la divergence d'une suite. Si
  $(u_{2n})$ et $(u_{2n+1})$ tendent vers $\ell$, alors $(u_n)$ tend vers
  $\ell$.
- Théorème de Bolzano-Weierstrass.

  **Commentaire.** Principe de démonstration par dichotomie.

### g) Traduction séquentielle de certaines propriétés

- Partie dense de $\mathbb{R}$.

  **Commentaire.** Une partie de $\mathbb{R}$ est dense dans $\mathbb{R}$ si
  elle rencontre tout intervalle ouvert non vide.
- Caractérisation séquentielle de la densité.

  **Commentaire.** Densité de l'ensemble des décimaux, des rationnels, des
  irrationnels.
- Si $X$ est une partie non vide majorée (resp. non majorée) de $\mathbb{R}$, il
  existe une suite d'éléments de $X$ de limite $\sup X$ (resp. $+\infty$).

  **Commentaire.** Résultats analogues pour $X$ non vide minorée (resp. non
  minorée).

### h) Suites complexes

- Brève extension des définitions et résultats précédents.

  **Commentaire.** Caractérisation de la limite en termes de parties réelle et
  imaginaire.
- Théorème de Bolzano-Weierstrass.

### i) Suites particulières

- Suites arithmétiques, géométriques, arithmético-géométriques.

  **Commentaire.** Pour une relation de récurrence $u_{n+1} = a u_n + b$ où
  $a \in \mathbb{C} \setminus \{1\}$ et $b \in \mathbb{C}$, recherche d'une
  solution constante, détermination des solutions.
- Suites récurrentes linéaires homogènes d'ordre 2 à coefficients constants.
- Présentation de l'étude des suites définies par une relation de récurrence
  $u_{n+1} = f(u_n)$ sur quelques exemples simples. Représentation géométrique.
  Si $(u_n)$ converge vers un élément $\ell$ en lequel $f$ est continue, alors
  $f(\ell) = \ell$.

  **Commentaire.** Cette étude est l'occasion d'introduire la notion
  d'intervalle stable par une fonction. Pour l'étude de la monotonie de
  $(u_n)$, on souligne l'intérêt, d'une part, de l'étude du signe de
  $f(x) - x$, et, d'autre part, de l'utilisation de la croissance éventuelle
  de $f$.

### A - Limites et continuité

> Le paragraphe a) consiste largement en des adaptations au cas continu de
> notions déjà étudiées pour les suites. Afin d'éviter des répétitions, le
> professeur a la liberté d'admettre certains résultats.
>
> **Limite.** Pour la pratique du calcul de limites, on se borne à ce stade à
> des calculs très simples, en attendant de disposer d'outils efficaces
> (développements limités).

### a) Limite d'une fonction en un point

- Étant donné un point $a$ de $\mathbb{R}$ appartenant à $I$ ou extrémité de
  $I$, limite finie ou infinie d'une fonction en $a$.

  **Commentaire.** Les définitions sont énoncées avec des inégalités larges.
- Unicité de la limite.

  **Commentaire.** Notations $f(x) \to \ell$, $\lim_{x \to a} f(x)$.
- Si $f$ est définie en $a$ et possède une limite en $a$, alors $\lim_{x \to
  a} f(x) = f(a)$.
- Si $f$ possède une limite finie en $a$, alors $f$ est bornée au voisinage de
  $a$.
- Limite à droite, limite à gauche.

  **Commentaire.** Notations $\lim_{\substack{x \to a \\ x > a}} f(x)$ ou
  $\lim_{x \to a^+} f(x)$.
- Caractérisation séquentielle de la limite (finie ou infinie).
- Opérations sur les limites : combinaison linéaire, produit, quotient,
  composition.
- Passage à la limite d'une inégalité large.
- Existence d'une limite par encadrement (limite finie), par minoration (limite
  $+\infty$), par majoration (limite $-\infty$).
- Théorème de la limite monotone.

### b) Continuité en un point

- Continuité, prolongement par continuité en un point.

  **Commentaire.** La continuité de $f$ au point $a$ de $I$ est définie par la
  relation $f(x) \to f(a)$.
- Continuité à gauche, à droite.
- Caractérisation séquentielle de la continuité en un point.
- Opérations sur les fonctions continues en un point : combinaison linéaire,
  produit, quotient, composition.

### c) Continuité sur un intervalle

- Continuité sur un intervalle.
- Théorème des valeurs intermédiaires.

  **Commentaire.** Principe de démonstration par dichotomie.
- Image d'un intervalle par une fonction continue.
- Corollaire : cas d'une fonction continue strictement monotone.
- Théorème des bornes atteintes : toute fonction continue sur un segment est
  bornée et atteint ses bornes.
- Image d'un segment par une fonction continue.
- Une fonction continue sur un intervalle, à valeurs réelles et injective, est
  strictement monotone.

  **Non exigible.** La démonstration.
- Toute fonction réelle strictement monotone, définie et continue sur un
  intervalle, admet une fonction réciproque de même monotonie, définie et
  continue sur un intervalle.

  **Non exigible.** La démonstration.

### d) Fonctions complexes

- Brève extension des définitions et résultats généraux sur les limites et la
  continuité.

  **Commentaire.** Caractérisation de la limite et de la continuité à l'aide
  des parties réelle et imaginaire.

### B - Dérivabilité

### a) Nombre dérivé, fonction dérivée

- Dérivabilité en un point, nombre dérivé.

  **Commentaire.** Définition par le taux d'accroissement.
- La dérivabilité entraîne la continuité.

  **Commentaire.** Caractérisation : une fonction $f$ est dérivable en $a$ si
  et seulement si elle admet un développement limité à l'ordre 1 en $a$. Dans
  ce cas

  $$f(a + h) = f(a) + f'(a)h + h\varepsilon(h), \quad \text{où }
  \varepsilon(h) \to 0.$$

  Interprétation géométrique : tangente. Interprétation cinématique : vitesse
  instantanée.
- Dérivabilité à gauche, à droite.
- Dérivabilité et dérivée sur un intervalle.
- Opérations sur les fonctions dérivables : combinaison linéaire, produit,
  quotient, composition, réciproque.

  **Commentaire.** Tangente au graphe d'une fonction réciproque.

### b) Extremum local et point critique

- Condition nécessaire d'extremum local en un point intérieur.

  **Commentaire.** Un point critique est un zéro de la dérivée.

### c) Théorèmes de Rolle et des accroissements finis

- Théorème de Rolle.
- Égalité des accroissements finis.

  **Commentaire.** Interprétations géométrique et cinématique.
- Inégalité des accroissements finis : si $f$ est dérivable et si $|f'|$ est
  majorée par $K$, alors $f$ est $K$-lipschitzienne.

  **Commentaire.** La notion de fonction lipschitzienne est introduite à cette
  occasion. Application à l'étude de suites définies par une relation de
  récurrence $u_{n+1} = f(u_n)$.
- Caractérisation des fonctions dérivables constantes, monotones,
  strictement monotones sur un intervalle.
- Théorème de la limite de la dérivée : si $f$ est continue sur $I$, dérivable
  sur $I \setminus \{a\}$ et si $\lim_{\substack{x \to a \\ x \neq a}} f'(x) =
  \ell \in \mathbb{R}$, alors $f$ est dérivable en $a$ et $f'(a) = \ell$.

  **Commentaire.** La fonction $f'$ est alors continue en $a$. Extension au cas
  où $\ell = \pm\infty$.

### d) Fonctions de classe $C^k$

- Pour $k \in \mathbb{N} \cup \{\infty\}$, fonction de classe $C^k$.
- Opérations sur les fonctions de classe $C^k$ : combinaison linéaire, produit
  (formule de Leibniz), quotient, composition, réciproque.

  **Non exigible.** Les démonstrations relatives à la composition et à la
  réciproque.

### e) Fonctions complexes

- Brève extension des définitions et résultats précédents.

  **Commentaire.** Caractérisation de la dérivabilité en termes de parties
  réelle et imaginaire.
- Inégalité des accroissements finis pour une fonction complexe de classe
  $C^1$.

  **Commentaire.** On mentionne que l'inégalité résulte d'une simple majoration
  d'intégrale, justifiée ultérieurement dans la section « Intégration ».

### C - Convexité

### a) Généralités

- La fonction $f$ est convexe sur $I$ si, pour tous $(x, y) \in I^2$ et
  $\lambda \in [0, 1]$,
  $f((1 - \lambda)x + \lambda y) \leqslant (1 - \lambda)f(x) + \lambda f(y)$.

  **Commentaire.** Interprétation géométrique.
- Inégalité de Jensen : si $f$ est une fonction convexe sur un intervalle $I$,
  on a l'inégalité

  $$f\left(\sum_{i=1}^{n} \lambda_i x_i\right) \leqslant \sum_{i=1}^{n}
  \lambda_i f(x_i)$$

  quels que soient les réels positifs $\lambda_1, \ldots, \lambda_n$ de somme 1
  et quels que soient les éléments $x_1, \ldots, x_n$ de $I$.

  **Hors programme.** Tout développement général sur les barycentres.
- Caractérisation de la convexité par la croissance des pentes.
- Position du graphe d'une fonction convexe par rapport à ses sécantes.

### b) Fonctions convexes dérivables, deux fois dérivables

- Caractérisation des fonctions convexes dérivables.
- Position du graphe d'une fonction convexe dérivable par rapport à ses
  tangentes.
- Caractérisation des fonctions convexes deux fois dérivables.

---

## Arithmétique dans l'ensemble des entiers relatifs

> L'objectif de cette section est d'étudier les propriétés de la divisibilité
> des entiers et des congruences. L'approche préconisée reste élémentaire en ce
> qu'elle ne fait pas appel au langage des structures algébriques.

### a) Divisibilité et division euclidienne

- Divisibilité dans $\mathbb{Z}$, diviseurs, multiples.

  **Commentaire.** Caractérisation des couples d'entiers associés.
- Théorème de la division euclidienne.

### b) PGCD et algorithme d'Euclide

- PGCD de deux entiers naturels dont l'un au moins est non nul.

  **Commentaire.** Notation $a \wedge b$. Le PGCD de $a$ et $b$ est défini
  comme étant le plus grand élément (pour l'ordre naturel dans
  $\mathbb{N}$) de l'ensemble des diviseurs communs à $a$ et $b$.
- Algorithme d'Euclide.

  **Commentaire.** L'ensemble des diviseurs communs à $a$ et $b$ est égal à
  l'ensemble des diviseurs de $a \wedge b$. $a \wedge b$ est le plus grand
  élément (au sens de la divisibilité) de l'ensemble des diviseurs communs à
  $a$ et $b$. Pour $k \in \mathbb{N}^*$, PGCD de $ka$ et $kb$.
- Extension au cas de deux entiers relatifs.
- Relation de Bézout.

  **Commentaire.** Détermination d'un couple de Bézout par l'algorithme
  d'Euclide étendu.
- PPCM.

  **Commentaire.** Notation $a \vee b$.

### c) Entiers premiers entre eux

- Couple d'entiers premiers entre eux.
- Théorème de Bézout.

  **Commentaire.** Forme irréductible d'un rationnel.
- Lemme de Gauss.
- Si $a$ et $b$ sont premiers entre eux et divisent $n$, alors $ab$ divise $n$.
- Si $a$ et $b$ sont premiers à $n$, alors $ab$ est premier à $n$.
- PGCD d'un nombre fini d'entiers, relation de Bézout. Entiers premiers entre
  eux dans leur ensemble, premiers entre eux deux à deux.

### d) Nombres premiers

- Nombre premier.

  **Commentaire.** Crible d'Ératosthène.
- L'ensemble des nombres premiers est infini.
- Existence et unicité de la décomposition d'un entier naturel non nul en
  produit de nombres premiers.
- Pour $p$ premier, valuation $p$-adique.

  **Commentaire.** Notation $v_p(n)$.
- Valuation $p$-adique d'un produit.

  **Commentaire.** Caractérisation de la divisibilité en termes de valuations
  $p$-adiques. Expressions du PGCD et du PPCM à l'aide des valuations
  $p$-adiques.

### e) Congruences

- Relation de congruence modulo un entier sur $\mathbb{Z}$.

  **Commentaire.** Notation $a \equiv b \ [n]$.
- Opérations sur les congruences : somme, produit.

  **Hors programme.** Les anneaux $\mathbb{Z}/n\mathbb{Z}$.
- Utilisation d'un inverse modulo $n$ pour résoudre une congruence modulo $n$.
- Petit théorème de Fermat.

---

## Structures algébriques usuelles

> Cette section a pour but l'introduction des notions les plus élémentaires
> relatives aux groupes, anneaux, corps, afin de traiter de manière unifiée un
> certain nombre de situations.

### a) Loi de composition interne

- Loi de composition interne.

  **Commentaire.** On évite l'étude de lois artificielles.
- Associativité, commutativité, élément neutre, inversibilité, distributivité.

  **Commentaire.** Inversibilité et inverse du produit de deux éléments
  inversibles.
- Partie stable.

### b) Structure de groupe

- Groupe.

  **Commentaire.** Notation $x^n$ dans un groupe multiplicatif, $nx$ dans un
  groupe additif. Exemples usuels : groupes additifs $\mathbb{Z}$,
  $\mathbb{Q}$, $\mathbb{R}$, $\mathbb{C}$, groupes multiplicatifs
  $\mathbb{Q}^*$, $\mathbb{Q}_+^*$, $\mathbb{R}^*$, $\mathbb{R}_+^*$,
  $\mathbb{C}^*$, $\mathbb{U}$, $\mathbb{U}_n$.
- Groupe des permutations d'un ensemble.

  **Commentaire.** Notation $S_X$.
- Groupe produit.
- Sous-groupe : définition, caractérisation.
- Morphisme de groupes. Image et image réciproque d'un sous-groupe par un
  morphisme.
- Image et noyau d'un morphisme. Condition d'injectivité.

  **Commentaire.** Notations $\operatorname{Im} f$, $\operatorname{Ker} f$.
- Isomorphisme.

### c) Structures d'anneau et de corps

- Anneau.

  **Commentaire.** Tout anneau est unitaire. Exemples usuels : $\mathbb{Z}$,
  $\mathbb{Q}$, $\mathbb{R}$, $\mathbb{C}$.
- Calcul dans un anneau.

  **Commentaire.** Relation $a^n - b^n$ et formule du binôme si $a$ et $b$
  commutent.
- Groupe des inversibles d'un anneau.
- Anneau intègre. Corps.

  **Commentaire.** Les corps sont commutatifs.
- Sous-anneau.
- Morphisme d'anneaux. Isomorphisme.

## Calcul matriciel et systèmes linéaires

> Le but de cette section est de présenter une initiation au calcul matriciel.
> Ainsi, on prépare l'étude géométrique de l'algèbre linéaire menée au second
> semestre, on revient sur l'étude des systèmes linéaires et on obtient des
> exemples fondamentaux d'anneaux.

### a) Opérations sur les matrices

- Ensemble $\mathcal{M}_{n,p}(\mathbb{K})$ des matrices à $n$ lignes et $p$
  colonnes à coefficients dans le corps $\mathbb{K}$. Addition, multiplication
  par un scalaire, combinaisons linéaires.
- Matrices élémentaires.

  **Commentaire.** Toute matrice de $\mathcal{M}_{n,p}(\mathbb{K})$ est
  combinaison linéaire de matrices élémentaires.
- Produit matriciel ; bilinéarité, associativité.

  **Commentaire.** Si $X$ est une matrice colonne, $AX$ est une combinaison
  linéaire des colonnes de $A$.
- Produit d'une matrice élémentaire de $\mathcal{M}_{n,p}(\mathbb{K})$ par une
  matrice élémentaire de $\mathcal{M}_{p,q}(\mathbb{K})$.

  **Commentaire.** Symbole de Kronecker $\delta_{i,j}$.
- Transposée d'une matrice.

  **Commentaire.** Notation $A^{\mathsf{T}}$.
- Opérations sur les transposées : combinaison linéaire, produit.

### b) Opérations élémentaires

- Interprétation des opérations élémentaires sur les lignes et sur les colonnes
  en termes de produit matriciel.

### c) Systèmes linéaires

- Écriture matricielle $AX = B$ d'un système linéaire. Système homogène
  associé.
- Système compatible.

  **Commentaire.** Le système $AX = B$ est compatible si $B$ est combinaison
  linéaire des colonnes de $A$.
- Les solutions du système compatible $AX = B$ sont les $X_0 + Y$, où $X_0$ est
  une solution particulière et où $Y$ parcourt l'ensemble des solutions du
  système homogène associé.

  **Commentaire.** On reprend brièvement l'algorithme du pivot, en termes
  d'opérations élémentaires sur les lignes, dans ce contexte général.

  **Limite.** Toute technicité est exclue.

### e) Anneau des matrices carrées

- Anneau $\mathcal{M}_n(\mathbb{K})$.

  **Commentaire.** Non commutativité si $n \geqslant 2$. Exemples de diviseurs
  de zéro, d'éléments nilpotents.
- Matrice identité, matrice scalaire.

  **Commentaire.** Notation $I_n$.
- Matrices symétriques, antisymétriques.

  **Commentaire.** Notations $\mathcal{S}_n(\mathbb{K})$,
  $\mathcal{A}_n(\mathbb{K})$.
- Formule du binôme.

  **Commentaire.** Application au calcul de puissances.
- Produit de matrices diagonales, de matrices triangulaires supérieures,
  inférieures.
- Matrice inversible, inverse. Groupe linéaire.

  **Commentaire.** Notation $\mathrm{GL}_n(\mathbb{K})$.
- Inverse d'une transposée.
- Les opérations élémentaires préservent l'inversibilité.
- Calcul de l'inverse d'une matrice, par opérations élémentaires ou par
  résolution du système $AX = Y$.

  **Limite.** Toute technicité est exclue.
- Condition nécessaire et suffisante d'inversibilité d'une matrice
  triangulaire ; l'inverse d'une matrice triangulaire inversible est
  triangulaire.

  **Commentaire.** Cas particulier des matrices diagonales.

---

## Polynômes et fractions rationnelles

> L'objectif de cette section est d'étudier les propriétés de base des
> polynômes et fractions rationnelles. Il s'agit d'objets particulièrement
> riches, dont l'étude interagit avec beaucoup de thèmes abordés pendant le
> semestre. Par exemple :
>
> - l'étude des équations algébriques enrichit le calcul algébrique et suggère
>   des problèmes de localisation des racines, mettant en jeu des techniques
>   analytiques dans le cas réel, plus géométriques dans le cas complexe ;
> - l'interpolation de Lagrange permet de reconstituer un polynôme en fonction
>   de ses valeurs en suffisamment de points et donne lieu à des problèmes issus
>   de la théorie de l'approximation (majoration de l'erreur d'interpolation).
>
> L'arithmétique de $\mathbb{K}[X]$ est développée selon le plan déjà utilisé
> pour l'arithmétique de $\mathbb{Z}$, ce qui autorise un exposé allégé.
>
> **Limite.** Le programme se limite au cas où le corps de base $\mathbb{K}$
> est égal à $\mathbb{R}$ ou $\mathbb{C}$.

### a) Anneau des polynômes à une indéterminée

- Anneau $\mathbb{K}[X]$.

  **Hors programme.** La construction de $\mathbb{K}[X]$.
- Degré, coefficient dominant, polynôme unitaire.

  **Commentaire.** Ensemble $\mathbb{K}_n[X]$ des polynômes de degré au plus
  $n$.
- Degré d'une somme, d'un produit.

  **Commentaire.** L'anneau $\mathbb{K}[X]$ est intègre.
- Composition.

### b) Divisibilité et division euclidienne

- Divisibilité dans $\mathbb{K}[X]$, diviseurs, multiples. Caractérisation des
  couples de polynômes associés.
- Théorème de la division euclidienne.

  **Commentaire.** Algorithme de la division euclidienne.

### c) Fonctions polynomiales et racines

- Fonction polynomiale associée à un polynôme. Racine (ou zéro) d'un polynôme,
  caractérisation en termes de divisibilité.

  **Commentaire.** Lien avec l'introduction aux équations algébriques de la
  section « Nombres complexes ». Méthode de Horner pour l'évaluation
  polynomiale.
- Le nombre de racines d'un polynôme non nul est majoré par son degré.

  **Commentaire.** Détermination d'un polynôme par la fonction polynomiale
  associée.
- Multiplicité d'une racine.
- Polynôme scindé. Relations entre coefficients et racines (formules de
  Viète).

  **Commentaire.** Les formules concernant la somme et le produit doivent être
  connues des étudiants ; les autres doivent être retrouvées rapidement.

### d) Dérivation

- Dérivée formelle d'un polynôme.

  **Commentaire.** Pour $\mathbb{K} = \mathbb{R}$, lien avec la dérivée de la
  fonction polynomiale associée.
- Opérations sur les polynômes dérivés : combinaison linéaire, produit. Formule
  de Leibniz.
- Formule de Taylor polynomiale.
- Caractérisation de la multiplicité d'une racine par les polynômes dérivés
  successifs.

### e) Arithmétique dans $\mathbb{K}[X]$

- PGCD de deux polynômes dont l'un au moins est non nul.

  **Commentaire.** Tout diviseur commun à $A$ et $B$ de degré maximal est appelé
  un PGCD de $A$ et $B$.
- Algorithme d'Euclide.

  **Commentaire.** L'ensemble des diviseurs communs à $A$ et $B$ est égal à
  l'ensemble des diviseurs d'un de leurs PGCD. Tous les PGCD de $A$ et $B$ sont
  associés. Un seul est unitaire, on le note $A \wedge B$.
- Relation de Bézout.

  **Commentaire.** Détermination d'un couple de Bézout par l'algorithme
  d'Euclide étendu.
- PPCM.

  **Commentaire.** Notation $A \vee B$.
- Couple de polynômes premiers entre eux. Théorème de Bézout. Lemme de Gauss.

  **Commentaire.** Adaptation des résultats présentés lors de l'étude de
  l'arithmétique dans $\mathbb{Z}$.
- PGCD d'un nombre fini de polynômes, relation de Bézout. Polynômes premiers
  entre eux dans leur ensemble, premiers entre eux deux à deux.

### f) Polynômes irréductibles de $\mathbb{C}[X]$ et $\mathbb{R}[X]$

- Théorème de d'Alembert-Gauss.

  **Hors programme.** La démonstration.
- Polynômes irréductibles de $\mathbb{C}[X]$. Théorème de décomposition en
  facteurs irréductibles dans $\mathbb{C}[X]$.

  **Commentaire.** Caractérisation de la divisibilité dans $\mathbb{C}[X]$ à
  l'aide des racines et des multiplicités. Deux polynômes de $\mathbb{C}[X]$
  sont premiers entre eux si et seulement s'ils n'ont pas de racine commune.
  Factorisation de $X^n - 1$ dans $\mathbb{C}[X]$.
- Polynômes irréductibles de $\mathbb{R}[X]$. Théorème de décomposition en
  facteurs irréductibles dans $\mathbb{R}[X]$.

  **Commentaire.** Deux racines complexes conjuguées d'un polynôme de
  $\mathbb{R}[X]$ ont même multiplicité.

### g) Formule d'interpolation de Lagrange

- Si $x_1, \ldots, x_n$ sont des éléments distincts de $\mathbb{K}$ et
  $y_1, \ldots, y_n$ des éléments de $\mathbb{K}$, il existe un unique polynôme
  $P \in \mathbb{K}_{n-1}[X]$ tel que $P(x_i) = y_i$ pour tout $i$.

  **Commentaire.** Expression de $P$. Description des polynômes $Q$ tels que
  $Q(x_i) = y_i$ pour tout $i$.

### h) Fractions rationnelles

- Corps $\mathbb{K}(X)$.

  **Hors programme.** La construction de $\mathbb{K}(X)$.
- Forme irréductible d'une fraction rationnelle. Fonction rationnelle.
- Degré, partie entière, zéros et pôles, multiplicités.

### i) Décomposition en éléments simples sur $\mathbb{C}$ et sur $\mathbb{R}$

- Existence et unicité de la décomposition en éléments simples sur
  $\mathbb{C}$ et sur $\mathbb{R}$.

  **Hors programme.** La démonstration.

  **Limite.** Toute technicité dans les exemples est exclue.

  **Commentaire.** Application au calcul de primitives, de dérivées
  $k$-ièmes.
- Si $\lambda$ est un pôle simple, coefficient de $\frac{1}{X - \lambda}$.
- Décomposition en éléments simples de $\frac{P'}{P}$.

# Deuxième semestre

## Analyse asymptotique

> L'objectif de cette section est d'introduire les techniques asymptotiques
> fondamentales, dans les cadres continu et discret. Les fonctions et les
> suites y sont à valeurs réelles ou complexes, le cas réel jouant un rôle
> prépondérant. On donne la priorité à la pratique d'exercices plutôt qu'à la
> vérification de propriétés élémentaires relatives aux relations de
> comparaison.
>
> Les développements limités sont les principaux outils du calcul asymptotique.
> Afin d'en disposer au plus tôt, on traitera en premier lieu les fonctions.
> Les étudiants doivent connaître les développements limités usuels et savoir
> mener à bien rapidement des calculs asymptotiques simples. En revanche, les
> situations dont la gestion manuelle ne relèverait que de la technicité seront
> traitées à l'aide d'outils logiciels.
>
> Cette section permet de revenir sur la problématique de la vitesse de
> convergence introduite au premier semestre lors de l'étude des fonctions de
> variable réelle.

### a) Relations de comparaison : cas des fonctions

- Relations de domination, de négligeabilité, d'équivalence en un point $a$
  de $\mathbb{R}$.

  **Commentaire.** Notations $f(x) = O(g(x))$, $f(x) = o(g(x))$, $f(x) \sim
  g(x)$.
- Lien entre ces relations.

  **Commentaire.** La relation $f(x) = o(g(x))$ est définie à partir du
  quotient $\frac{f(x)}{g(x)}$ sous l'hypothèse que la fonction $g$ ne
  s'annule pas localement. Pour la relation $f(x) \sim g(x)$, on donne les
  deux formes $\frac{f(x)}{g(x)} \to 1$ et $f(x) = g(x) + o(g(x))$, en
  insistant sur l'intérêt de la seconde dans les calculs. Pour mener une étude
  locale de $f$ au voisinage de $a \neq 0$, on étudie $f(a + h)$ pour
  $h \to 0$.
- Traduction à l'aide du symbole $o$ des croissances comparées de
  $\ln^\beta(x)$, $x^\alpha$, $e^{\gamma x}$ en $+\infty$, de
  $\ln^\beta(x)$, $x^\alpha$ en $0$.
- Règles usuelles de manipulation des équivalents et des symboles $o$ et $O$.
- Obtention d'un équivalent par encadrement : si les fonctions réelles $f$,
  $g$, $h$ vérifient $f \leqslant g \leqslant h$ et si $f(x) \sim h(x)$, alors
  $g(x) \sim f(x)$.
- Propriétés conservées par équivalence : signe, limite.

### b) Développements limités

- Développement limité à l'ordre $n$ d'une fonction en un point. Unicité des
  coefficients, troncature.

  **Commentaire.** Le développement limité à l'ordre $n$ de $f$ en $a$ peut se
  ramener à celui de $h \mapsto f(a + h)$ en $0$. Signe de $f$ au voisinage de
  $a$.
- Développement limité en $0$ d'une fonction paire, impaire.
- Caractérisation de la dérivabilité par l'existence d'un développement limité
  à l'ordre 1.
- Opérations sur les développements limités : combinaison linéaire, produit,
  quotient.

  **Commentaire.** On privilégie la factorisation par le terme prépondérant
  pour prévoir l'ordre d'un développement. Les étudiants doivent savoir
  déterminer sur des exemples simples le développement limité d'une composée,
  mais aucun résultat général n'est exigible.
- Primitivation d'un développement limité.
- Formule de Taylor-Young : pour $f$ de classe $C^n$, développement limité à
  l'ordre $n$ en $0$ de $h \mapsto f(a + h)$.
- Développement limité à tout ordre en $0$ de $\exp$, $\sin$, $\cos$,
  $\operatorname{sh}$, $\operatorname{ch}$, $x \mapsto \ln(1 + x)$,
  $x \mapsto \frac{1}{1 - x}$, $x \mapsto (1 + x)^\alpha$, Arctan.
- Développement limité à l'ordre 3 en $0$ de $\tan$.
- Application des développements limités à l'étude locale d'une fonction.

  **Commentaire.** Calculs d'équivalents et de limites, position relative
  d'une courbe et de sa tangente, détermination d'asymptotes.
- Condition nécessaire, condition suffisante à l'ordre 2 pour un extremum
  local en un point intérieur.

### c) Relations de comparaison : cas des suites

- Adaptation rapide aux suites des définitions et résultats relatifs aux
  fonctions.

  **Commentaire.** Notations $u_n = O(v_n)$, $u_n = o(v_n)$, $u_n \sim v_n$.

### d) Problèmes d'analyse asymptotique

- Exemples de développements asymptotiques, dans les cadres discret et continu
  : fonctions réciproques, équations à paramètre, suites récurrentes, suites
  d'intégrales.

  **Hors programme.** La notion d'échelle de comparaison.
- Formule de Stirling. Traduction comme développement asymptotique de
  $\ln(n!)$.

  **Non exigible.** La démonstration.

---

## Espaces vectoriels et applications linéaires

> Les objectifs de cette section sont les suivants :
>
> - acquérir les notions de base relatives aux espaces vectoriels et à
>   l'indépendance linéaire ;
> - reconnaître les problèmes linéaires et les traduire à l'aide des notions
>   d'espace vectoriel et d'application linéaire ;
> - définir la notion de dimension, qui décrit le nombre de degrés de liberté
>   d'un problème linéaire ; on insistera sur les méthodes de calcul de
>   dimension et on fera apparaître que ces méthodes reposent sur deux types de
>   représentation : paramétrisation linéaire d'un sous-espace, description
>   d'un sous-espace par équations linéaires ;
> - présenter quelques notions de géométrie affine, afin d'interpréter
>   géométriquement certaines situations.
>
> En petite dimension, l'intuition géométrique permet d'interpréter les
> notions de l'algèbre linéaire, ce qui facilite leur extension au cas général
> ; on en tirera parti par de nombreuses figures.
>
> **Limite.** Le corps $\mathbb{K}$ est égal à $\mathbb{R}$ ou $\mathbb{C}$.
> Tout développement théorique sur les espaces de dimension infinie est hors
> programme.

### A - Espaces vectoriels

### a) Espaces vectoriels

- Structure de $\mathbb{K}$-espace vectoriel.

  **Commentaire.** Espaces $\mathbb{K}^n$, $\mathbb{K}[X]$,
  $\mathcal{M}_{n,p}(\mathbb{K})$.
- Produit d'un nombre fini de $\mathbb{K}$-espaces vectoriels.
- Espace vectoriel des fonctions d'un ensemble dans un espace vectoriel.

  **Commentaire.** Espace $\mathbb{K}^X$, cas particulier $\mathbb{K}^{\mathbb{N}}$.
- Famille presque nulle (ou à support fini) de scalaires, combinaison linéaire
  d'une famille de vecteurs.

  **Commentaire.** On commence par la notion de combinaison linéaire d'une
  famille finie de vecteurs.

### b) Sous-espaces vectoriels

- Sous-espace vectoriel : définition, caractérisation.

  **Commentaire.** Sous-espace nul. Droite vectorielle. Plan vectoriel de
  $\mathbb{R}^3$. Sous-espace $\mathbb{K}_n[X]$ de $\mathbb{K}[X]$.
- Intersection d'une famille de sous-espaces vectoriels.

  **Commentaire.** Ensemble des solutions d'un système linéaire homogène.
- Sous-espace vectoriel engendré par une partie $A$.

  **Commentaire.** Notations $\operatorname{Vect}(A)$,
  $\operatorname{Vect}(x_i)_{i \in I}$. Tout sous-espace vectoriel contenant
  $A$ contient $\operatorname{Vect}(A)$.

### c) Familles de vecteurs

- Famille (partie) génératrice.
- Famille (partie) libre, liée.

  **Commentaire.** Ajout d'un vecteur à une famille (partie) libre. Liberté
  d'une famille de polynômes à degrés distincts.
- Base, coordonnées.

  **Commentaire.** Bases canoniques de $\mathbb{K}^n$,
  $\mathcal{M}_{n,p}(\mathbb{K})$, $\mathbb{K}_n[X]$, $\mathbb{K}[X]$. Bases de
  polynômes à degrés échelonnés dans $\mathbb{K}[X]$ et $\mathbb{K}_n[X]$.

### d) Somme de deux sous-espaces

- Somme de deux sous-espaces.
- Somme directe de deux sous-espaces. Caractérisation par l'intersection.

  **Commentaire.** La somme $F + G$ est directe si la décomposition de tout
  vecteur de $F + G$ comme somme d'un élément de $F$ et d'un élément de $G$
  est unique.
- Sous-espaces supplémentaires.

  **Commentaire.** On incite les étudiants à se représenter des espaces
  supplémentaires par une figure en dimension 2 et 3.

### B - Espaces de dimension finie

### a) Existence de bases

- Un espace vectoriel est dit de dimension finie s'il possède une famille
  génératrice finie.
- Si $(x_i)_{1 \leqslant i \leqslant n}$ engendre $E$ et si $(x_i)_{i \in I}$
  est libre pour une certaine partie $I$ de $\{1, \ldots, n\}$, alors il
  existe une partie $J$ de $\{1, \ldots, n\}$ contenant $I$ pour laquelle
  $(x_j)_{j \in J}$ est une base de $E$.

  **Commentaire.** Existence de bases en dimension finie. Théorèmes de la base
  extraite (de toute famille génératrice on peut extraire une base), de la
  base incomplète (toute famille libre peut être complétée en une base).

### b) Dimension d'un espace de dimension finie

- Dans un espace engendré par $n$ vecteurs, toute famille de $n + 1$ vecteurs
  est liée.
- Dimension d'un espace de dimension finie.

  **Commentaire.** Dimension de $\mathbb{K}^n$, de $\mathbb{K}_n[X]$, de
  $\mathcal{M}_{n,p}(\mathbb{K})$. Dimension de l'espace des solutions d'une
  équation différentielle linéaire homogène d'ordre 1, de l'espace des
  solutions d'une équation différentielle linéaire homogène d'ordre 2 à
  coefficients constants, de l'espace des suites vérifiant une relation de
  récurrence linéaire homogène d'ordre 2 à coefficients constants.
- Dans un espace de dimension $n$, caractérisation des bases comme familles
  libres ou génératrices de $n$ vecteurs.
- Dimension d'un produit fini d'espaces vectoriels de dimension finie.
- Rang d'une famille finie de vecteurs.

  **Commentaire.** Notation $\operatorname{rg}(x_1, \ldots, x_n)$.

### c) Sous-espaces et dimension

- Dimension d'un sous-espace d'un espace de dimension finie, cas d'égalité.
- Dimension d'une somme de deux sous-espaces : formule de Grassmann.
- Tout sous-espace d'un espace de dimension finie possède un supplémentaire.
  Caractérisation dimensionnelle des couples de sous-espaces supplémentaires.
- Base adaptée à un sous-espace, à une décomposition en somme directe de deux
  sous-espaces.

### C - Applications linéaires

### a) Généralités

- Application linéaire.
- Opérations sur les applications linéaires : combinaison linéaire,
  composition. Isomorphisme, réciproque.

  **Commentaire.** Espace vectoriel $\mathcal{L}(E, F)$ des applications
  linéaires de $E$ dans $F$. Bilinéarité de la composition.
- Image directe et image réciproque d'un sous-espace par une application
  linéaire.
- Image d'une application linéaire.
- Noyau d'une application linéaire.

  **Commentaire.** Caractérisation de l'injectivité.
- Si $(x_i)_{i \in I}$ est une famille génératrice de $E$ et si
  $u \in \mathcal{L}(E, F)$, alors
  $\operatorname{Im} u = \operatorname{Vect}\big(u(x_i)\big)_{i \in I}$.
- Application linéaire de rang fini.

  **Commentaire.** Notation $\operatorname{rg}(u)$.
- Le rang de $v \circ u$ est majoré par $\min(\operatorname{rg}(u),
  \operatorname{rg}(v))$. Invariance du rang par composition par un
  isomorphisme.

### b) Endomorphismes

- Identité, homothéties.

  **Commentaire.** Notations $\mathrm{id}_E$, $\mathrm{id}$.
- Anneau $(\mathcal{L}(E), +, \circ)$.

  **Commentaire.** Non commutativité si $\dim E \geqslant 2$. Notation $vu$
  pour la composée $v \circ u$. Notation $u^k$ pour $u \in \mathcal{L}(E)$ et
  $k \in \mathbb{N}$.
- Projection ou projecteur, symétrie : définition géométrique,
  caractérisation par $p^2 = p$, par $s^2 = \mathrm{id}$.

  **Commentaire.** On incite les étudiants à se représenter géométriquement
  ces notions par des figures en dimension 2 et 3.
- Automorphismes. Groupe linéaire.

  **Commentaire.** Notation $\mathrm{GL}(E)$. Notation $u^k$ pour
  $u \in \mathrm{GL}(E)$ et $k \in \mathbb{Z}$.

### c) Détermination d'une application linéaire

- Si $(e_i)_{i \in I}$ est une base de $E$ et $(f_i)_{i \in I}$ une famille de
  vecteurs de $F$, alors il existe une unique application
  $u \in \mathcal{L}(E, F)$ telle que, pour tout $i \in I$, $u(e_i) = f_i$.

  **Commentaire.** Caractérisation de l'injectivité, de la surjectivité, de la
  bijectivité de $u$.
- Espaces vectoriels isomorphes, caractérisation par la dimension.
- Pour une application linéaire entre deux espaces de même dimension finie,
  équivalence entre injectivité, surjectivité et bijectivité.
- Un endomorphisme d'un espace de dimension finie inversible à gauche ou à
  droite est inversible.
- Dimension de $\mathcal{L}(E, F)$ si $E$ et $F$ sont de dimension finie.
- Si $E_1$ et $E_2$ sont des sous-espaces de $E$ tels que
  $E = E_1 \oplus E_2$, si $u_1 \in \mathcal{L}(E_1, F)$,
  $u_2 \in \mathcal{L}(E_2, F)$, il existe une unique application
  $u \in \mathcal{L}(E, F)$ coïncidant avec $u_1$ sur $E_1$ et avec $u_2$ sur
  $E_2$.

### d) Théorème du rang

- Forme géométrique du théorème du rang : si $u \in \mathcal{L}(E, F)$ et si
  $S$ est un supplémentaire de $\operatorname{Ker} u$ dans $E$, alors $u$
  induit un isomorphisme de $S$ sur $\operatorname{Im} u$.
- Théorème du rang : si $E$ est de dimension finie $n$ et
  $u \in \mathcal{L}(E, F)$, alors $n = \dim \operatorname{Ker} u +
  \operatorname{rg}(u)$.

### e) Formes linéaires et hyperplans

- Forme linéaire.

  **Commentaire.** Formes coordonnées relativement à une base.
- Hyperplan, défini comme noyau d'une forme linéaire non nulle.

  **Commentaire.** Équations d'un hyperplan dans une base en dimension finie.
- Si $H$ est un hyperplan de $E$ et $D$ une droite non contenue dans $H$,
  alors $E = H \oplus D$. Réciproquement, tout supplémentaire d'une droite est
  un hyperplan.

  **Commentaire.** En dimension $n$, les hyperplans sont exactement les
  sous-espaces de dimension $n - 1$.
- Comparaison de deux équations d'un même hyperplan.
- Si $E$ est un espace de dimension finie $n$, l'intersection de $m$ hyperplans
  est de dimension au moins $n - m$. Réciproquement, tout sous-espace de $E$
  de dimension $n - m$ est l'intersection de $m$ hyperplans.

  **Commentaire.** Système d'équations d'un sous-espace vectoriel ; cas des
  droites vectorielles de $\mathbb{R}^2$, des droites et plans vectoriels de
  $\mathbb{R}^3$.

  **Hors programme.** L'étude de la dualité.

### D - Sous-espaces affines d'un espace vectoriel

> Le but de cette partie, qu'il convient d'illustrer par de nombreuses
> figures, est double :
>
> - montrer comment l'algèbre linéaire permet d'étendre les notions de
>   géométrie affine étudiées au collège et au lycée et d'utiliser l'intuition
>   géométrique dans un cadre élargi ;
> - modéliser un problème affine par une équation $u(x) = a$ où $u$ est une
>   application linéaire, et unifier plusieurs situations de ce type déjà
>   rencontrées.

- Présentation informelle de la structure affine d'un espace vectoriel : points
  et vecteurs. Translation.

  **Commentaire.** L'écriture $B = A + u$ est équivalente à la relation
  $\overrightarrow{AB} = u$.
- Sous-espace affine d'un espace vectoriel, direction. Hyperplan affine.

  **Commentaire.** Sous-espaces affines de $\mathbb{R}^2$ et $\mathbb{R}^3$.
- Intersection de sous-espaces affines.
- Notion d'équation linéaire, i.e. de la forme $u(x) = a$ où
  $u \in \mathcal{L}(E, F)$, $a \in F$. L'ensemble des solutions est soit
  l'ensemble vide, soit un sous-espace affine dirigé par $\operatorname{Ker}
  u$.

  **Commentaire.** Retour sur les systèmes linéaires, les équations
  différentielles linéaires d'ordres 1 et 2, les suites
  arithmético-géométriques, la recherche de polynômes interpolateurs.

## Matrices

> Les objectifs de cette section sont les suivants :
>
> - présenter les liens entre applications linéaires et matrices, de manière à
>   exploiter les changements de registres (géométrique, numérique, formel) ;
> - étudier l'effet d'un changement de bases sur la représentation matricielle
>   d'une application linéaire et la relation d'équivalence qui s'en déduit sur
>   $\mathcal{M}_{n,p}(\mathbb{K})$ ;
> - introduire brièvement la relation de similitude sur $\mathcal{M}_n(\mathbb{K})$.

### A - Matrices et applications linéaires

### a) Matrice d'une application linéaire dans des bases

- Matrice d'un vecteur, d'une famille de vecteurs dans une base, d'une
  application linéaire dans un couple de bases, d'un endomorphisme dans une
  base.

  **Commentaire.** Exemple : matrice, dans la base $(1, i)$ de $\mathbb{C}$ vu
  comme plan vectoriel réel, de la similitude de multiplicateur $a + ib$.
- Isomorphisme d'espaces vectoriels de $\mathcal{L}(E, F)$ sur
  $\mathcal{M}_{n,p}(\mathbb{K})$ induit par le choix d'un couple de bases.
- Isomorphisme d'espaces vectoriels et d'anneaux de $\mathcal{L}(E)$ sur
  $\mathcal{M}_n(\mathbb{K})$ induit par le choix d'une base.
- Coordonnées de l'image d'un vecteur par une application linéaire.
- Matrice d'une composée d'applications linéaires. Lien entre matrices
  inversibles et isomorphismes.

  **Commentaire.** Cas particulier des endomorphismes.

### b) Application linéaire canoniquement associée à une matrice

- Application linéaire canoniquement associée à une matrice.

  **Commentaire.** On identifie ici $\mathcal{M}_{n,1}(\mathbb{K})$ et
  $\mathbb{K}^n$.
- Noyau, image et rang d'une matrice.

  **Commentaire.** Les colonnes engendrent l'image, les lignes donnent un
  système d'équations du noyau.
- Une matrice de $\mathcal{M}_n(\mathbb{K})$ est inversible si et seulement si
  son noyau est réduit au sous-espace nul, ou si et seulement si ses colonnes
  engendrent l'espace $\mathbb{K}^n$ ou si et seulement si son rang est $n$.

  **Commentaire.** Retour sur la condition d'inversibilité d'une matrice
  triangulaire. Lien entre les diverses notions de rang.
- Toute matrice carrée inversible à gauche ou à droite est inversible.

### c) Systèmes linéaires

- Interprétation de l'ensemble des solutions d'un système homogène comme noyau
  d'une matrice. Rang d'un tel système, dimension de l'espace des solutions.
- Le système $AX = B$ est compatible si et seulement si $B$ appartient à
  l'image de $A$.

  **Commentaire.** Structure affine de l'ensemble des solutions.
- Si $A$ est carrée et inversible, le système $AX = B$ possède une unique
  solution.

  **Commentaire.** Dans ce cas, le système est dit de Cramer.

### B - Changements de bases, équivalence et similitude

### a) Changements de bases

- Matrice de passage d'une base à une autre.
- Inversibilité et inverse d'une matrice de passage.
- Effet d'un changement de base sur la matrice d'un vecteur.
- Effet d'un changement du couple de bases sur la matrice d'une application
  linéaire.
- Effet d'un changement de base sur la matrice d'un endomorphisme.

  **Commentaire.** Exemples de recherche d'une base dans laquelle la matrice
  d'un endomorphisme donné est simple.

### b) Matrices équivalentes et rang

- Si $u \in \mathcal{L}(E, F)$ est de rang $r$, il existe un couple de bases
  dans lequel $u$ a pour matrice $J_r$.

  **Commentaire.** La matrice $J_r$ a tous ses coefficients nuls à l'exception
  des $r$ premiers coefficients diagonaux, égaux à $1$.
- Matrices équivalentes.
- Une matrice est de rang $r$ si et seulement si elle est équivalente à $J_r$.

  **Commentaire.** Classification des matrices équivalentes par le rang.
- Invariance du rang par transposition.
- Rang d'une matrice extraite. Caractérisation du rang par les matrices
  carrées extraites.
- Les opérations élémentaires sur les colonnes (resp. lignes) conservent
  l'image (resp. le noyau). Les opérations élémentaires conservent le rang.

  **Commentaire.** Application : calcul du rang.

### c) Matrices semblables et trace

- Matrices semblables.

  **Commentaire.** Interprétation géométrique. Exemples de recherche d'une
  matrice simple semblable à une matrice donnée.
- Trace d'une matrice carrée.

  **Commentaire.** Notation $\operatorname{tr}(A)$.
- Linéarité de la trace, relation $\operatorname{tr}(AB) =
  \operatorname{tr}(BA)$, invariance par similitude.
- Trace d'un endomorphisme d'un espace de dimension finie. Linéarité, relation
  $\operatorname{tr}(uv) = \operatorname{tr}(vu)$.

  **Commentaire.** Notation $\operatorname{tr}(u)$. Trace d'un projecteur.

---

## Groupe symétrique et déterminants

### A - Groupe symétrique

> Le groupe symétrique est introduit en vue de l'étude des déterminants, mais
> aussi pour son intérêt propre et ses interventions possibles dans diverses
> questions d'algèbre et de probabilités.

### a) Généralités

- Groupe des permutations de l'ensemble $\{1, \ldots, n\}$.

  **Commentaire.** Notation $S_n$.
- Cycle, transposition.

  **Commentaire.** Notation $(a_1 a_2 \ldots a_p)$.
- Décomposition d'une permutation en produit de cycles à supports disjoints :
  existence, unicité, commutativité.

  **Non exigible.** La démonstration, mais les étudiants doivent savoir
  décomposer une permutation.

### b) Signature d'une permutation

- Décomposition d'une permutation en produit de transpositions.
- Signature : il existe un unique morphisme de groupes de $S_n$ dans
  $\{-1, 1\}$ envoyant toute transposition sur $-1$.

  **Non exigible.** La démonstration.

### B - Déterminants

> Les objectifs de cette partie sont les suivants :
>
> - introduire la notion de déterminant d'une famille de vecteurs, en motivant
>   sa construction par la géométrie ;
> - établir les principales propriétés des déterminants des matrices carrées et
>   des endomorphismes ;
> - indiquer quelques méthodes simples de calcul de déterminants.

### a) Formes n-linéaires alternées

- Forme n-linéaire alternée sur un $\mathbb{K}$-espace vectoriel de dimension
  $n$.

  **Commentaire.** La définition est motivée par les notions intuitives d'aire
  et de volume algébriques, en s'appuyant sur des figures.
- Antisymétrie, effet d'une permutation.

  **Commentaire.** Si $f$ est une forme n-linéaire alternée et si
  $(x_1, \ldots, x_n)$ est une famille liée, alors
  $f(x_1, \ldots, x_n) = 0$.

### b) Déterminant d'une famille de vecteurs dans une base

- Si $e$ est une base, il existe une unique forme n-linéaire alternée $f$ pour
  laquelle $f(e) = 1$ ; toute forme n-linéaire alternée est un multiple de
  $\det_e$.

  **Commentaire.** Notation $\det_e$. La démonstration de l'existence n'est
  pas exigible.
- Expression du déterminant dans une base en fonction des coordonnées.

  **Commentaire.** Dans $\mathbb{R}^2$ (resp. $\mathbb{R}^3$), interprétation
  du déterminant dans la base canonique comme aire orientée (resp. volume
  orienté) d'un parallélogramme (resp. parallélépipède).
- Comparaison, si $e$ et $e'$ sont deux bases, de $\det_e$ et $\det_{e'}$.
- La famille $(x_1, \ldots, x_n)$ est une base si et seulement si
  $\det_e(x_1, \ldots, x_n) \neq 0$.

### c) Déterminant d'un endomorphisme

- Déterminant d'un endomorphisme.
- Déterminant d'une composée.

  **Commentaire.** Caractérisation des automorphismes.

### d) Déterminant d'une matrice carrée

- Déterminant d'une matrice carrée.

  **Commentaire.** Caractère n-linéaire alterné du déterminant par rapport aux
  colonnes.
- Déterminant d'un produit.

  **Commentaire.** Relation $\det(\lambda A) = \lambda^n \det(A)$.
- Caractérisation des matrices inversibles.
- L'application $\det$ induit un morphisme de $\mathrm{GL}(E)$ (resp.
  $\mathrm{GL}_n(\mathbb{K})$) sur $\mathbb{K}^*$.
- Déterminant d'une transposée.

  **Commentaire.** Caractère n-linéaire alterné du déterminant par rapport aux
  lignes.

### e) Calcul des déterminants

- Effet des opérations élémentaires.
- Cofacteur. Développement par rapport à une ligne ou une colonne.
- Déterminant d'une matrice triangulaire.
- Déterminant de Vandermonde.

  **Commentaire.** Lien avec les polynômes de Lagrange.

### f) Comatrice

- Comatrice.

  **Commentaire.** Notation $\operatorname{Com}(A)$.
- Relation $A\operatorname{Com}(A)^{\mathsf{T}} =
  \operatorname{Com}(A)^{\mathsf{T}} A = \det(A)I_n$.

  **Commentaire.** Expression de l'inverse d'une matrice inversible.

---

## Intégration

> Cette section a pour principal objectif de définir l'intégrale d'une fonction
> continue par morceaux sur un segment et d'en établir les propriétés
> principales. Elle offre l'occasion de revenir sur les techniques de calcul
> intégral, mais aussi de traiter des exercices d'esprit plus théorique.
>
> Les méthodes de calcul approché d'intégrales donnent l'occasion de revenir
> sur la problématique de l'approximation. On pourra ainsi comparer les
> performances de la méthode des rectangles et de celle des trapèzes.
>
> **Limite.** La notion de continuité uniforme est introduite uniquement en vue
> de la construction de l'intégrale. L'étude systématique des fonctions
> uniformément continues n'est pas un attendu du programme.
>
> **Commentaire.** Le corps $\mathbb{K}$ est pris égal à $\mathbb{R}$ ou
> $\mathbb{C}$. Le professeur peut soit se placer d'emblée dans le cadre des
> fonctions à valeurs complexes, soit traiter en premier lieu le cas réel avant
> de procéder à une brève extension.

### a) Continuité uniforme

- Continuité uniforme.

  **Commentaire.** Exemple des fonctions lipschitziennes.
- Théorème de Heine.

  **Non exigible.** La démonstration.

### b) Fonctions continues par morceaux

- Subdivision d'un segment, pas d'une subdivision.
- Fonction en escalier, fonction continue par morceaux.

  **Commentaire.** Les fonctions sont définies sur un segment et à valeurs
  dans $\mathbb{K}$. Structure de sous-espace vectoriel et de sous-anneau de
  l'ensemble des fonctions continues par morceaux sur un segment à valeurs
  dans $\mathbb{K}$.

### c) Intégrale d'une fonction continue par morceaux sur un segment

- Intégrale d'une fonction continue par morceaux sur un segment à valeurs dans
  $\mathbb{K}$.

  **Commentaire.** Le programme n'impose pas de construction particulière.
  Interprétation géométrique de l'intégrale. Notations $\int_{[a,b]} f$,
  $\int_a^b f$, $\int_a^b f(t)\,dt$.
- Linéarité, positivité et croissance de l'intégrale.
- Inégalité triangulaire intégrale : $\left|\int_{[a,b]} f\right| \leqslant
  \int_{[a,b]} |f|$.
- Relation de Chasles.

  **Commentaire.** Extension de la notation $\int_a^b f(t)\,dt$ au cas où
  $b \leqslant a$. Propriétés correspondantes.
- Si $f$ est continue, à valeurs dans $\mathbb{R}_+$ et si $\int_{[a,b]} f =
  0$, alors $f = 0$.
- Intégrale d'une fonction paire ou impaire sur un segment centré en $0$.
  Intégrale d'une fonction périodique sur un intervalle de période.

  **Commentaire.** Valeur moyenne d'une fonction continue par morceaux sur un
  segment.

### d) Sommes de Riemann

- Pour $f$ continue par morceaux sur le segment $[a, b]$,

  $$\frac{b - a}{n} \sum_{k=0}^{n-1} f\!\left(a + k\frac{b - a}{n}\right)
  \underset{n \to +\infty}{\longrightarrow} \int_a^b f(t)\,dt.$$

  **Commentaire.** Interprétation géométrique. Démonstration exigible pour $f$
  lipschitzienne.

### e) Lien entre intégrale et primitive

- Dérivation de $x \mapsto \int_a^x f(t)\,dt$ pour $f$ continue.
- Toute fonction continue sur un intervalle possède des primitives.

### f) Formules de Taylor globales

- Formule de Taylor avec reste intégral et inégalité de Taylor-Lagrange.

  **Hors programme.** L'égalité de Taylor-Lagrange.

  **Commentaire.** On souligne la différence de nature entre la formule de
  Taylor-Young (locale) et les formules de Taylor globales.

## Dénombrement

> Cette section est introduite essentiellement en vue de son utilisation en
> probabilités ; rattaché aux mathématiques discrètes, le dénombrement
> interagit également avec l'algèbre et l'informatique.
>
> **Limite.** Toute formalisation excessive est exclue. En particulier : parmi
> les propriétés du paragraphe a), les plus intuitives sont admises sans
> démonstration ; l'utilisation de bijections dans les problèmes de
> dénombrement n'est pas un attendu du programme.

### a) Cardinal d'un ensemble fini

- Cardinal d'un ensemble fini.

  **Commentaire.** Notations $|A|$, $\operatorname{Card}(A)$.

  **Hors programme.** Tout fondement théorique des notions d'entier naturel et
  de cardinal.
- Cardinal d'une partie d'un ensemble fini, cas d'égalité.
- Une application entre deux ensembles finis de même cardinal est bijective si
  et seulement si elle est injective, si et seulement si elle est surjective.
- Opérations sur les cardinaux : union disjointe ou quelconque,
  complémentaire, différence, produit cartésien.

  **Hors programme.** La formule du crible.
- Cardinal de l'ensemble des applications d'un ensemble fini dans un autre.
- Cardinal de l'ensemble des parties d'un ensemble fini.

### b) Listes et combinaisons

- Nombre de $p$-listes (ou $p$-uplets) d'éléments distincts d'un ensemble de
  cardinal $n$, nombre de permutations d'un ensemble de cardinal $n$.

  **Commentaire.** Nombre d'applications injectives d'un ensemble de cardinal
  $p$ dans un ensemble de cardinal $n$.
- Nombre de parties à $p$ éléments (ou $p$-combinaisons) d'un ensemble de
  cardinal $n$.

  **Commentaire.** Démonstration combinatoire des formules de Pascal et du
  binôme.

---

## Probabilités

> Cette section, qui a vocation à interagir avec l'ensemble du programme, a
> pour objectif de donner aux étudiants une bonne pratique des variables
> aléatoires dans le cadre fini.
>
> Pour enrichir la pratique de la modélisation probabiliste développée au
> lycée, on met en évidence qu'une situation probabiliste finie peut être
> décrite par un $n$-uplet de variables aléatoires, l'univers étant vu dans
> cette optique comme une source suffisante d'aléa. L'objectif de cette
> présentation est de pouvoir travailler le plus tôt possible avec des
> événements construits en termes de variables aléatoires.
>
> **Limite.** La construction d'un univers fini susceptible de porter un
> $n$-uplet de variables aléatoires peut être présentée, mais ne constitue pas
> un objectif du programme.
>
> **Commentaire.** Les exemples et activités proposés sont de nature plus
> conceptuelle qu'au lycée. On pourra faire travailler les étudiants sur des
> marches aléatoires ou des chaînes de Markov en temps fini, sur des
> permutations aléatoires (loi uniforme sur $\mathcal{S}_n$), des graphes
> aléatoires, des inégalités de concentration…
>
> Le programme de probabilités de première année s'achève sur une approche non
> asymptotique de la loi faible des grands nombres qui justifie l'approche
> fréquentiste des probabilités.

### A - Probabilités sur un univers fini, variables aléatoires et lois

### a) Univers, événements, variables aléatoires

- Lien entre vocabulaire ensembliste et vocabulaire des probabilités.

  **Limite.** On se limite au cas d'un univers fini.

  **Commentaire.** Événement élémentaire (singleton), système complet
  d'événements, événements disjoints (ou incompatibles).
- Une variable aléatoire $X$ est une application définie sur l'univers
  $\Omega$ à valeurs dans un ensemble $E$.

  **Commentaire.** Notations $\{X \in A\}$ et $(X \in A)$.

### b) Espaces probabilisés finis

- Probabilité sur un univers fini.

  **Commentaire.** Espace probabilisé fini $(\Omega, P)$. Notations $P(X \in
  A)$, $P(X = x)$ et $P(X \leqslant x)$.
- Une distribution de probabilités sur un ensemble $E$ est une famille
  d'éléments de $\mathbb{R}_+$ indexée par $E$ et de somme 1.

  **Commentaire.** Une probabilité $P$ sur $\Omega$ est déterminée par la
  distribution de probabilités $(P(\{\omega\}))_{\omega \in \Omega}$.
- Une distribution de probabilités sur un ensemble fini est une famille de
  réels positifs indexée par cet ensemble et de somme 1.
- Probabilité uniforme.
- Probabilité de la réunion ou de la différence de deux événements, de
  l'événement contraire. Croissance.

  **Hors programme.** La formule du crible.

### c) Probabilités conditionnelles

- Si $P(B) > 0$, la probabilité conditionnelle de $A$ sachant $B$ est définie
  par la relation $P(A|B) = P_B(A) = \frac{P(A \cap B)}{P(B)}$.

  **Commentaire.** L'application $P_B$ est une probabilité.
- Formules des probabilités composées, des probabilités totales, de Bayes.

  **Commentaire.** Par convention, $P(A|B)P(B) = 0$ lorsque $P(B) = 0$.

### d) Loi d'une variable aléatoire

- Loi $P_X$ d'une variable aléatoire $X$ à valeurs dans $E$.

  **Commentaire.** La probabilité $P_X$ est déterminée par la distribution de
  probabilités $(P(X = x))_{x \in E}$. On note $X \sim Y$ la relation
  $P_X = P_Y$.
- Variable aléatoire $f(X)$.

  **Commentaire.** Si $X \sim Y$ alors $f(X) \sim f(Y)$.
- Variable uniforme sur un ensemble fini non vide $E$.

  **Commentaire.** Notation $X \sim \mathcal{U}(E)$.
- Variable de Bernoulli de paramètre $p \in [0, 1]$.

  **Commentaire.** Notation $X \sim \mathcal{B}(p)$. Interprétation comme
  succès d'une expérience.
- Variable binomiale de paramètres $n \in \mathbb{N}^*$ et $p \in [0, 1]$.

  **Commentaire.** Notation $X \sim \mathcal{B}(n, p)$.
- Loi conditionnelle d'une variable aléatoire $X$ sachant un événement $A$.
- Couple de variables aléatoires. Loi conjointe, lois marginales.

  **Commentaire.** Un couple de variables aléatoires est une variable aléatoire
  à valeurs dans un produit. Notation $P(X = x, Y = y)$. Extension aux
  $n$-uplets de variables aléatoires.

### e) Événements indépendants

- Les événements $A$ et $B$ sont indépendants si $P(A \cap B) = P(A)P(B)$.

  **Commentaire.** Si $P(B) > 0$, l'indépendance de $A$ et $B$ s'écrit
  $P(A|B) = P(A)$.
- Famille finie d'événements indépendants.

  **Commentaire.** L'indépendance deux à deux n'implique pas l'indépendance.
- Si $A$ et $B$ sont indépendants, $\overline{A}$ et $\overline{B}$ le sont
  aussi.

  **Commentaire.** Extension au cas de $n$ événements.

### f) Variables aléatoires indépendantes

- Les variables aléatoires $X$ et $Y$ définies sur l'univers $\Omega$ sont
  indépendantes si pour tout $A \in \mathcal{P}(X(\Omega))$ et tout $B \in
  \mathcal{P}(Y(\Omega))$, les événements $(X \in A)$ et $(Y \in B)$ sont
  indépendants.

  **Commentaire.** Notation $X \perp\!\!\!\perp Y$. Cette condition équivaut au
  fait que la distribution de probabilités de $(X, Y)$ est donnée par
  $P\big((X, Y) = (x, y)\big) = P(X = x)P(Y = y)$.
- Extension aux $n$-uplets de variables aléatoires.

  **Commentaire.** Modélisation de $n$ expériences aléatoires indépendantes
  par une suite finie $(X_i)_{1 \leqslant i \leqslant n}$ de variables
  aléatoires indépendantes.
- Si $X_1, \ldots, X_n$ sont indépendantes de loi $\mathcal{B}(p)$, alors
  $X_1 + \cdots + X_n$ suit la loi $\mathcal{B}(n, p)$.

  **Commentaire.** Interprétation : nombre de succès lors de la répétition de
  $n$ expériences indépendantes ayant chacune la probabilité $p$ de succès.
- Si les variables aléatoires $X$ et $Y$ sont indépendantes, alors $f(X)$ et
  $g(Y)$ sont indépendantes.
- Lemme des coalitions : si les variables aléatoires $X_1, \ldots, X_n$ sont
  indépendantes, alors $f(X_1, \ldots, X_m)$ et $g(X_{m+1}, \ldots, X_n)$ le
  sont aussi.

  **Commentaire.** Extension au cas de plus de deux coalitions.

### B - Espérance et variance

### a) Espérance d'une variable aléatoire réelle ou complexe

- Espérance $E(X) = \sum_{x \in X(\Omega)} x\,P(X = x)$ d'une variable
  aléatoire $X$.

  **Commentaire.** L'espérance est un indicateur de position. Formule
  $E(X) = \sum_{\omega \in \Omega} X(\omega)P(\{\omega\})$. Variable aléatoire
  centrée.
- Linéarité, positivité, croissance, inégalité triangulaire.
- Espérance d'une variable constante, de Bernoulli, binomiale.

  **Commentaire.** Exemple : $E(\mathbf{1}_A) = P(A)$.
- Formule de transfert : $E\big(f(X)\big) = \sum_{x \in X(\Omega)}
  f(x)P(X = x)$.

  **Commentaire.** On souligne que la formule de transfert s'applique en
  particulier aux couples et aux $n$-uplets.
- Si $X$ et $Y$ sont indépendantes, alors $E(XY) = E(X)E(Y)$.

  **Commentaire.** Extension au cas de $n$ variables aléatoires indépendantes.

### b) Variance d'une variable aléatoire réelle, écart type et covariance

- Variance et écart type d'une variable aléatoire réelle.

  **Commentaire.** Variance et écart type sont des indicateurs de dispersion.
  Variable aléatoire réduite.
- Relation $V(aX + b) = a^2V(X)$.

  **Commentaire.** Si $\sigma(X) > 0$, la variable
  $\frac{X - E(X)}{\sigma(X)}$ est centrée réduite.
- Relation $V(X) = E(X^2) - E(X)^2$.
- Variance d'une variable de Bernoulli, d'une variable binomiale.
- Covariance de deux variables aléatoires.

  **Commentaire.** Deux variables aléatoires dont la covariance est nulle sont
  dites décorrélées.
- Relation $\operatorname{Cov}(X, Y) = E(XY) - E(X)E(Y)$, cas de deux variables
  indépendantes.
- Variance d'une somme, cas de variables décorrélées.

  **Commentaire.** On retrouve la variance d'une variable binomiale.

### c) Inégalités probabilistes

- Inégalité de Markov.

  **Commentaire.** Application à l'obtention d'inégalités de concentration.
- Inégalité de Bienaymé-Tchebychev.

  **Commentaire.** Application à une moyenne de variables indépendantes de même
  loi, interprétation fréquentiste.

---

## Espaces préhilbertiens réels

> La notion de produit scalaire a été étudiée d'un point de vue élémentaire
> dans l'enseignement secondaire. L'objectif de cette section, qu'il est
> essentiel d'illustrer par de nombreuses figures, est de la généraliser, afin
> d'exploiter l'intuition acquise en dimension 2 ou 3 pour résoudre des
> problèmes posés dans un contexte plus abstrait.
>
> **Commentaire.** Les familles de polynômes orthogonaux donnent des
> illustrations pertinentes des notions abordées dans cette section.

### a) Produit scalaire

- Produit scalaire.

  **Commentaire.** Notations $\langle x, y \rangle$, $(x|y)$, $x \cdot y$.
- Espace préhilbertien, espace euclidien.
- Produit scalaire canonique sur $\mathbb{R}^n$, sur
  $\mathcal{M}_{n,p}(\mathbb{R})$.

  **Commentaire.** Expressions $X^{\mathsf{T}}Y$,
  $\operatorname{tr}(A^{\mathsf{T}}B)$.
- Produit scalaire $\langle f, g \rangle = \int_a^b fg$ sur
  $\mathcal{C}([a, b], \mathbb{R})$.

  **Commentaire.** Exemples de produits scalaires intégraux sur
  $\mathbb{R}[X]$ et $\mathcal{C}([a, b], \mathbb{R})$.

### b) Norme associée à un produit scalaire

- Norme associée à un produit scalaire, distance.
- Inégalité de Cauchy-Schwarz, cas d'égalité.

  **Commentaire.** Exemples : sommes finies, intégrales.
- Inégalité triangulaire, cas d'égalité.
- Identité remarquable $\|x + y\|^2 = \|x\|^2 + \|y\|^2 + 2\langle x, y
  \rangle$.

  **Commentaire.** Formule de polarisation associée.

### c) Orthogonalité

- Vecteurs orthogonaux, orthogonal d'une partie.

  **Commentaire.** Notation $X^{\perp}$. L'orthogonal d'une partie est un
  sous-espace.
- Famille orthogonale, orthonormée (ou orthonormale).
- Toute famille orthogonale de vecteurs non nuls est libre.
- Théorème de Pythagore.
- Algorithme d'orthonormalisation de Gram-Schmidt.

### d) Bases orthonormées

- Existence de bases orthonormées dans un espace euclidien. Théorème de la base
  orthonormée incomplète.
- Expression des coordonnées, du produit scalaire et de la norme dans une base
  orthonormée.

### e) Projection orthogonale sur un sous-espace de dimension finie

- Supplémentaire orthogonal d'un sous-espace $F$ de dimension finie. Projection
  orthogonale sur $F$. Expression du projeté orthogonal d'un vecteur $x$ dans
  une base orthonormée de $F$.

  **Commentaire.** En dimension finie : dimension de $F^{\perp}$, vecteur
  normal à un hyperplan.
- Distance d'un vecteur à $F$.

  **Commentaire.** Notation $d(x, F)$.
- Le projeté orthogonal de $x$ sur $F$ est l'unique élément de $F$ qui réalise
  la distance de $x$ à $F$.

  **Commentaire.** En dimension finie, projeté orthogonal d'un vecteur sur
  l'hyperplan $\operatorname{Vect}(u)^{\perp}$ ; distance de $x$ à
  $\operatorname{Vect}(u)^{\perp}$.

---

## Procédés sommatoires discrets

> L'étude des séries prolonge celle des suites et permet d'appliquer les
> techniques d'analyse asymptotique. Les objectifs majeurs en la matière
> portent sur les séries à termes positifs et la convergence absolue.
>
> **Limite.** L'étude de séries semi-convergentes est limitée aux exemples
> fournis par le théorème des séries alternées.
>
> L'étude des familles sommables est menée dans un deuxième temps. On prolonge
> les calculs de sommes finies effectués en début d'année, en mettant en
> évidence un cadre permettant de sommer « en vrac » une famille infinie et
> procurant ainsi un grand confort de calcul. Dans le cas d'une famille
> positive, le calcul dans $[0, +\infty]$ se suffit à lui-même et contient
> l'étude de la sommabilité. Dans le cas d'une famille quelconque, il est
> préconisé de commencer par un calcul formel à justifier dans un second temps.
>
> On se concentre sur la pratique, qui jouera un rôle important en deuxième
> année.

### a) Convergence et divergence

- Sommes partielles d'une série numérique.

  **Commentaire.** La série est notée $\sum u_n$.
- Convergence, divergence, somme.

  **Commentaire.** En cas de convergence, sa somme est notée
  $\sum_{n=0}^{+\infty} u_n$.
- Linéarité de la somme.
- Le terme général d'une série convergente tend vers $0$.

  **Commentaire.** Divergence grossière.
- Reste d'une série convergente.
- Lien suite-série.

  **Commentaire.** La suite $(u_n)$ et la série télescopique
  $\sum (u_{n+1} - u_n)$ sont de même nature.
- Séries géométriques : condition nécessaire et suffisante de convergence,
  somme.
- Relation $e^z = \sum_{n=0}^{+\infty} \frac{z^n}{n!}$ pour $z \in
  \mathbb{C}$.

### b) Séries à termes positifs ou nuls

- Une série à termes positifs converge si et seulement si la suite de ses
  sommes partielles est majorée.
- Si $0 \leqslant u_n \leqslant v_n$ pour tout $n$, la convergence de
  $\sum v_n$ implique celle de $\sum u_n$.
- Si $(u_n)_{n \in \mathbb{N}}$ et $(v_n)_{n \in \mathbb{N}}$ sont positives
  et si $u_n \sim v_n$, les séries $\sum u_n$ et $\sum v_n$ sont de même
  nature.
- Si $f$ est monotone, encadrement des sommes partielles de $\sum f(n)$ à
  l'aide de la méthode des rectangles.

  **Commentaire.** Application à l'étude de sommes partielles.
- Séries de Riemann.

### c) Séries absolument convergentes à termes réels ou complexes

- Une série numérique absolument convergente est convergente.

  **Hors programme.** Le critère de Cauchy.
- Si $(u_n)$ est une suite complexe, si $(v_n)$ est une suite d'éléments de
  $\mathbb{R}_+$, si $u_n = O(v_n)$ et si $\sum v_n$ converge, alors $\sum
  u_n$ est absolument convergente donc convergente.

### d) Théorème des séries alternées

- Si la suite réelle $(u_n)_{n \in \mathbb{N}}$ converge en décroissant vers
  $0$, $\sum (-1)^n u_n$ converge.

  **Commentaire.** Signe et majoration en valeur absolue de la somme, des
  restes.

### e) Familles sommables de nombres réels positifs

- Convention de calcul et relation d'ordre dans $[0, +\infty]$.
- Borne supérieure dans $[0, +\infty]$.
- Somme d'une famille $(u_i)_{i \in I}$ d'éléments de $[0, +\infty]$, définie
  comme borne supérieure dans $[0, +\infty]$ de l'ensemble des sommes
  $\sum_{i \in F} u_i$ quand $F$ décrit l'ensemble des parties finies de $I$.

  **Commentaire.** La somme est notée $\sum_{i \in I} u_i$. Cas où $I$ est
  fini, où $I = \mathbb{N}$ (lien avec les séries). On note
  $\sum_{n=0}^{\infty} u_n = +\infty$ si la série $\sum u_n$ d'éléments de
  $\mathbb{R}_+$ diverge. Invariance de la somme par permutation.
- La famille $(u_i)_{i \in I}$ d'éléments de $\mathbb{R}_+$ est dite sommable
  si $\sum_{i \in I} u_i < +\infty$.

  **Commentaire.** On souligne que les calculs sont justifiés par la seule
  positivité et qu'ils fournissent un moyen d'étudier la sommabilité.
- Opérations : somme, multiplication par un réel positif.
- Théorème de sommation par paquets : si $I$ est réunion disjointe des $I_j$
  pour $j \in J$ et si $(u_i)_{i \in I}$ est à valeurs dans $\mathbb{R}_+$,
  alors $\sum_{j \in J} \Big(\sum_{i \in I_j} u_i\Big) = \sum_{i \in I} u_i$.

  **Hors programme.** La démonstration.
- Cas où $I$ est un produit : théorème de Fubini positif.

### f) Familles sommables de nombres complexes

- La famille $(u_i)_{i \in I}$ de $\mathbb{C}$ est dite sommable si
  $\sum_{i \in I} |u_i| < +\infty$.

  **Commentaire.** Notation $\ell^1(I)$. Pour $I = \mathbb{N}$, lien avec les
  séries. Sommabilité d'une sous-famille d'une famille sommable.
- Somme d'une famille sommable de nombres complexes.

  **Commentaire.** Si $(a_i)_{i \in I}$ est sommable et si
  $\varepsilon \in \mathbb{R}_+^*$, il existe une partie finie $F$ de $I$
  telle que $\Big|\sum_{i \in I} a_i - \sum_{i \in F} a_i\Big| \leqslant
  \varepsilon$. Invariance de la somme par permutation.
- Soit $(u_i)_{i \in I}$ une famille de nombres complexes et soit $(v_i)$ une
  famille sommable de réels positifs vérifiant, pour tout $i \in I$, $|u_i|
  \leqslant v_i$. Alors $(u_i)_{i \in I}$ est sommable.
- Linéarité de la somme.
- Théorème de sommation par paquets : si $I$ est réunion disjointe des $I_j$
  pour $j \in J$, si $(u_i)_{i \in I}$ est sommable, alors
  $\sum_{j \in J} \Big(\sum_{i \in I_j} u_i\Big) = \sum_{i \in I} u_i$.

  **Hors programme.** La démonstration.
- Cas où $I$ est un produit : théorème de Fubini.
- Si $(a_i)_{i \in I}$ et $(b_{i'})_{i' \in I'}$ sont sommables alors
  $(a_i b_{i'})_{(i, i') \in I \times I'}$ est sommable et
  $\sum_{(i, i') \in I \times I'} a_i b_{i'} = \sum_{i \in I} a_i \times
  \sum_{i' \in I'} b_{i'}$.

  **Commentaire.** Extension, sans rédaction de la démonstration, au produit
  d'un nombre fini de familles sommables.
- Produit de Cauchy de deux séries absolument convergentes.

  **Commentaire.** On retrouve le fait que l'exponentielle complexe est un
  morphisme de $(\mathbb{C}, +)$ dans $(\mathbb{C}^*, \times)$.

---

## Fonctions de deux variables

> Le but de cette section, dont le contenu sera entièrement repris dans un
> cadre plus général en seconde année, est de familiariser les étudiants avec
> les calculs sur les dérivées partielles, notamment avec la « règle de la
> chaîne », et de développer une vision géométrique des fonctions de deux
> variables. Le point de vue est donc essentiellement pratique.
>
> **Hors programme.** Toute extension et tout développement théorique
> supplémentaire.

### a) Ouverts de $\mathbb{R}^2$, fonctions continues

- Boules de $\mathbb{R}^2$ muni de la norme euclidienne canonique.
- Ouverts.
- Continuité d'une fonction définie sur un ouvert de $\mathbb{R}^2$, à valeurs
  dans $\mathbb{R}$.

  **Commentaire.** Représentation graphique d'une fonction de deux variables
  par une surface.

  **Limite.** La notion de continuité est introduite uniquement en vue du
  calcul différentiel. L'étude de la continuité d'une fonction n'est pas un
  objectif du programme.

### b) Dérivées partielles

- Dérivées partielles en un point d'une fonction $f$ définie sur un ouvert de
  $\mathbb{R}^2$, à valeurs dans $\mathbb{R}$.

  **Commentaire.** Notations $\frac{\partial f}{\partial x}(x_0, y_0)$,
  $\frac{\partial f}{\partial y}(x_0, y_0)$. L'existence des dérivées
  partielles n'entraîne pas la continuité.
- Fonction de classe $C^1$ sur un ouvert.

  **Commentaire.** Définition par la continuité des dérivées partielles.

  **Hors programme.** La notion de fonction différentiable.
- Développement limité à l'ordre 1 au point $(x_0, y_0)$ d'une fonction $f$ de
  classe $C^1$ :

  $$f(x_0 + h, y_0 + k) = f(x_0, y_0) + \frac{\partial f}{\partial x}(x_0,
  y_0)h + \frac{\partial f}{\partial y}(x_0, y_0)k + o\big(\|(h, k)\|\big).$$

  **Hors programme.** La démonstration.

  **Commentaire.** On met en évidence l'idée de l'approximation linéaire de
  $f(x_0 + h, y_0 + k) - f(x_0, y_0)$ et l'interprétation de $z - z_0 =
  \frac{\partial f}{\partial x}(x_0, y_0)(x - x_0) + \frac{\partial f}{\partial
  y}(x_0, y_0)(y - y_0)$ comme équation du plan tangent en $(x_0, y_0)$ à la
  surface d'équation $z = f(x, y)$.
- Gradient d'une fonction de classe $C^1$.

  **Commentaire.** Notation $\nabla f(x_0, y_0)$. Expression du développement
  limité à l'aide du gradient. Le gradient de $f$ en $(x_0, y_0)$ définit la
  direction dans laquelle $f$ croît le plus vite.

### c) Dérivées partielles et composées

- Dérivée selon un vecteur.

  **Commentaire.** Expression à l'aide du gradient
  $\langle \nabla f(x_0, y_0), u \rangle$.
- Règle de la chaîne : les fonctions considérées étant de classe $C^1$, la
  fonction $t \mapsto f(x(t), y(t))$ est de classe $C^1$ et

  $$\frac{d}{dt}\big(f(x(t), y(t))\big) = \frac{\partial f}{\partial
  x}(x(t), y(t))x'(t) + \frac{\partial f}{\partial y}(x(t), y(t))y'(t).$$

  **Commentaire.** Interprétation comme dérivée de $f$ le long d'un arc
  $\gamma$ donné par $\gamma(t) = (x(t), y(t))$ et expression à l'aide du
  gradient $(f \circ \gamma)'(t) = \langle \nabla f(\gamma(t)),
  \gamma'(t) \rangle$ où $\gamma'(t)$ est défini par $(x'(t), y'(t))$. Le
  gradient de $f$ est orthogonal aux lignes de niveau de $f$.
- Sous les hypothèses appropriées, dérivées partielles de $(u, v) \mapsto
  f\big(\varphi(u, v), \psi(u, v)\big)$.

### d) Extremums

- Maximum et minimum, local ou global d'une fonction définie sur une partie de
  $\mathbb{R}^2$.
- Point critique. Tout extremum local d'une fonction de classe $C^1$ sur un
  ouvert de $\mathbb{R}^2$ est un point critique.

  **Commentaire.** Exemples d'étude de points critiques.