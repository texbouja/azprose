---
id: inf-1
filiere: [MPSI, PCSI, PTSI]
matiere: informatique
niveau: 1
source: "Programme d'informatique commune (tronc commun), MESRI 2021"
---

# Programme d'informatique commune — première année

## Comment lire ce document

Transcription d'une partie du programme officiel d'informatique commune des
filières scientifiques, **restreinte à la première année** (semestres 1 et 2).
Le texte des notions et des commentaires est **celui du document source** ;
seuls les marques de hiérarchie et les intitulés en gras sont ajoutés, ils
rendent explicites ce que la présentation du document exprimait par la
position en colonne.

Le programme est organisé par semestres ; chaque section est présentée en deux
colonnes. La transcription conserve cette structure par l'indentation :

| Élément | Ce qu'il signifie | Portée |
|---|---|---|
| Puce **non indentée** | thème ou notion de la colonne de gauche | l'item |
| Ligne **indentée** commençant par un intitulé | exemples d'activité ou commentaire de la colonne de droite | l'item |
| `**Non exigible.**` | exemples d'activité proposés au professeur (au choix, non exigibles des étudiants) ou connaissance non exigible | l'item |
| `**Commentaire.**` | précision pédagogique ou de notation — **ne restreint rien** | l'item qui précède |
| `**Limite.**` | restriction de portée ou d'ambition | l'item qui précède |
| `**Hors programme.**` | **exclu** — ne doit pas être traité, ne peut faire l'objet d'aucune évaluation | l'item qui précède |
| Citation `>` | commentaire général du programme officiel | la section |

À savoir, faute de quoi la lecture est faussée :

- **Hors programme.** est la seule mention **prohibitive** ; **Limite.** et
  **Non exigible.** restreignent sans exclure.
- Les **mots clés de code** (mots clés Python, fonctions, noms de modules) sont
  transcrits tels quels, entre backticks — ils désignent des éléments du
  langage, pas du texte courant.
- Les formules restent en LaTeX : `$…$` en ligne.
- Cette transcription est **dérivée**. En cas de doute, le document cité en
  `source` fait foi.

---

## 1. Programme du premier semestre

> Les séances de travaux pratiques du premier semestre poursuivent les
> objectifs suivants :
>
> - consolider l'apprentissage de la programmation en langage Python qui a été
>   entrepris dans les classes du lycée ;
> - mettre en place un environnement de travail ;
> - mettre en place une discipline de programmation : spécification précise
>   des fonctions et programmes, annotations et commentaires, jeux de tests ;
> - introduire les premiers éléments de complexité des algorithmes : on ne
>   présente que l'estimation asymptotique du coût dans le cas le pire ;
> - introduire des outils de validation : variants et invariants.
>
> Le tableau ci-dessous présente les thèmes qui sont abordés lors de ces
> séances, et, en colonne de droite, une liste, sans aucun caractère
> impératif, d'exemples d'activités qui peuvent être proposées aux étudiants.
> L'ordre de ces thèmes n'est pas impératif.
>
> **Non exigible.** Aucune connaissance relative aux modules éventuellement
> rencontrés lors de ces séances n'est exigible des étudiants.

- Recherche séquentielle dans un tableau unidimensionnel. Dictionnaire.
  **Non exigible.** Recherche d'un élément. Recherche du maximum, du second
    maximum. Comptage des éléments d'un tableau à l'aide d'un dictionnaire.
    Manipulations élémentaires d'un tableau unidimensionnel. Utilisation de
    dictionnaires en boîte noire. Notions de coût constant, de coût linéaire.
- Algorithmes opérant sur une structure séquentielle par boucles imbriquées.
  **Non exigible.** Recherche d'un facteur dans un texte. Recherche des deux
    valeurs les plus proches dans un tableau. Tri à bulles. Notion de
    complexité quadratique.
  **Commentaire.** On propose des outils pour valider la correction de
    l'algorithme.
- Utilisation de modules, de bibliothèques.
  **Non exigible.** Lecture d'un fichier de données simples. Calculs
    statistiques sur ces données. Représentation graphique (histogrammes,
    etc.).
- Algorithmes dichotomiques.
  **Non exigible.** Recherche dichotomique dans un tableau trié.
    Exponentiation rapide.
  **Commentaire.** On met en évidence une accélération entre complexité
    linéaire d'un algorithme naïf et complexité logarithmique d'un algorithme
    dichotomique. On met en œuvre des jeux de tests, des outils de
    validation.
- Fonctions récursives.
  **Non exigible.** Version récursive d'algorithmes dichotomiques. Fonctions
    produisant à l'aide de `print` successifs des figures alphanumériques.
    Dessins de fractales. Énumération des sous-listes ou des permutations
    d'une liste.
  **Commentaire.** On évite de se cantonner à des fonctions mathématiques
    (factorielle, suites récurrentes). On peut montrer le phénomène de
    dépassement de la taille de la pile.
- Algorithmes gloutons.
  **Non exigible.** Rendu de monnaie. Allocation de salles pour des cours.
    Sélection d'activité.
  **Commentaire.** On peut montrer par des exemples qu'un algorithme glouton
    ne fournit pas toujours une solution exacte ou optimale.
- Matrices de pixels et images.
  **Non exigible.** Algorithmes de rotation, de réduction ou
    d'agrandissement. Modification d'une image par convolution : flou,
    détection de contour, etc.
  **Commentaire.** Les images servent de support à la présentation de
    manipulations de tableaux à deux dimensions.
- Tris.
  **Non exigible.** Algorithmes quadratiques : tri par insertion, par
    sélection. Tri par partition-fusion. Tri rapide. Tri par comptage.
  **Commentaire.** On fait observer différentes caractéristiques (par
    exemple, stable ou non, en place ou non, comparatif ou non, etc).

---

## 2. Programme du second semestre

### 2.1. Méthodes de programmation et analyse des algorithmes

> On formalise par des leçons et travaux pratiques le travail entrepris au
> premier semestre concernant la discipline et les méthodes de programmation.
>
> Même si on ne prouve pas systématiquement tous les algorithmes, on dégage
> l'idée qu'un algorithme doit se prouver et que sa programmation doit se
> tester.

- Instruction et expression. Effet de bord.
  **Commentaire.** On peut signaler par exemple que le fait que l'affectation
    soit une instruction est un choix des concepteurs du langage Python et en
    expliquer les conséquences.
- Spécification des données attendues en entrée, et fournies en sortie/retour.
  **Commentaire.** On entraîne les étudiants à accompagner leurs programmes
    et leurs fonctions d'une spécification. Les signatures des fonctions sont
    toujours précisées.
- Annotation d'un bloc d'instructions par une précondition, une postcondition,
  une propriété invariante.
  **Commentaire.** Ces annotations se font à l'aide de commentaires.
- Assertion.
  **Commentaire.** L'utilisation d'assertions est encouragée par exemple pour
    valider des entrées. La levée d'une assertion entraîne l'arrêt du
    programme.
  **Hors programme.** Ni la définition ni le rattrapage des exceptions.
- Explicitation et justification des choix de conception ou programmation.
  **Commentaire.** Les parties complexes de codes ou d'algorithmes font
    l'objet de commentaires qui l'éclairent en évitant la paraphrase. Le choix
    des collections employées (par exemple, liste ou dictionnaire) est un
    choix éclairé.
- Terminaison. Correction partielle. Correction totale. Variant. Invariant.
  **Commentaire.** La correction est partielle quand le résultat est correct
    lorsque l'algorithme s'arrête, la correction est totale si elle est
    partielle et si l'algorithme termine.
  **Commentaire.** On montre sur plusieurs exemples que la terminaison peut
    se démontrer à l'aide d'un variant de boucle.
  **Commentaire.** Sur plusieurs exemples, on explicite, sans insister sur
    aucun formalisme, des invariants de boucles en vue de montrer la
    correction des algorithmes.
- Jeu de tests associé à un programme.
  **Non exigible.** Il n'est pas attendu de connaissances sur la génération
    automatique de jeux de tests.
  **Commentaire.** Un étudiant doit savoir écrire un jeu de tests à la main,
    donnant à la fois des entrées et les sorties correspondantes attendues. On
    sensibilise, par des exemples, à la notion de partitionnement des domaines
    d'entrée et au test des limites.
- Complexité.
  **Commentaire.** On aborde la notion de complexité temporelle dans le pire
    cas en ordre de grandeur. On peut, sur des exemples, aborder la notion de
    complexité en espace.

### 2.2. Représentation des nombres

> On présente sans formalisation théorique les enjeux de la représentation en
> mémoire des nombres. Ces notions permettent d'expliquer certaines difficultés
> rencontrées et précautions à prendre lors de la programmation ou de
> l'utilisation d'algorithmes de calcul numérique dans les disciplines qui y
> recourent.

- Représentation des entiers positifs sur des mots de taille fixe.
  **Limite.** La conversion d'une base à une autre n'est pas un objectif de
    formation.
- Représentation des entiers signés sur des mots de taille fixe.
  **Commentaire.** Complément à deux.
- Entiers multi-précision de Python.
  **Commentaire.** On les distingue des entiers de taille fixe sans détailler
    leur implémentation. On signale la difficulté à évaluer la complexité des
    opérations arithmétiques sur ces entiers.
- Distinction entre nombres réels, décimaux et flottants.
  **Commentaire.** On montre sur des exemples l'impossibilité de représenter
    certains nombres réels ou décimaux dans un mot machine.
- Représentation des flottants sur des mots de taille fixe.
  **Commentaire.** On signale la représentation de 0.
  **Hors programme.** On n'évoque pas les nombres dénormalisés, les infinis
    ni les NaN.
- Notion de mantisse, d'exposant.
  **Hors programme.** Aucune connaissance liée à la norme IEEE-754.
- Précision des calculs en flottants.
  **Commentaire.** On insiste sur les limites de précision dans le calcul
    avec des flottants, en particulier pour les comparaisons.
  **Hors programme.** Le comparatif des différents modes d'arrondi.

### 2.3. Bases des graphes, plus courts chemins

> Il s'agit de définir le modèle des graphes, leurs représentations et leurs
> manipulations.
>
> On s'efforce de mettre en avant des applications importantes et si possible
> modernes : réseau de transport, graphe du web, réseaux sociaux,
> bio-informatique. On précise autant que possible la taille typique de tels
> graphes.

- Vocabulaire des graphes.
  **Commentaire.** Graphe orienté, graphe non orienté. Sommet (ou nœud) ;
    arc, arête. Boucle. Degré (entrant et sortant). Chemin d'un sommet à un
    autre. Cycle. Connexité dans les graphes non orientés.
  **Commentaire.** On présente l'implémentation des graphes à l'aide de
    listes d'adjacence (rassemblées par exemple dans une liste ou dans un
    dictionnaire) et de matrice d'adjacence.
  **Hors programme.** On n'évoque ni multi-arcs ni multi-arêtes.
- Notations.
  **Commentaire.** Graphe $G = (S, A)$, degrés $d(s)$ (pour un graphe non
    orienté), $d^+(s)$ et $d^-(s)$ (pour un graphe orienté).
- Pondération d'un graphe. Étiquettes des arcs ou des arêtes d'un graphe.
  **Commentaire.** On motive l'ajout d'information à un graphe par des
    exemples concrets.
- Parcours d'un graphe.
  **Commentaire.** On introduit à cette occasion les piles et les files ; on
    souligne les problèmes d'efficacité posés par l'implémentation des files
    par les listes de Python et l'avantage d'utiliser un module dédié tel que
    `collections.deque`.
  **Commentaire.** Détection de la présence de cycles ou de la connexité d'un
    graphe non orienté.
- Recherche d'un plus court chemin dans un graphe pondéré avec des poids
  positifs.
  **Commentaire.** Algorithme de Dijkstra. On peut se contenter d'un modèle de
    file de priorité naïf pour extraire l'élément minimum d'une collection.
    Sur des exemples, on s'appuie sur l'algorithme A* vu comme variante de
    celui de Dijkstra pour une première sensibilisation à la notion
    d'heuristique.
