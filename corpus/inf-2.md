---
id: inf-2
filiere: [MP, PC, PSI, PT]
matiere: informatique
niveau: 2
source: "Programme d'informatique commune (tronc commun), MESRI 2021"
---

# Programme d'informatique commune — deuxième année

## Comment lire ce document

Transcription d'une partie du programme officiel d'informatique commune des
filières scientifiques, **restreinte à la deuxième année** (semestre 3, et
annexe « Langage Python » commune aux deux années). Le texte des notions et
des commentaires est **celui du document source** ; seuls les marques de
hiérarchie et les intitulés en gras sont ajoutés, ils rendent explicites ce
que la présentation du document exprimait par la position en colonne.

Le programme est organisé par semestres ; chaque section est présentée en deux
colonnes. La transcription conserve cette structure par l'indentation :

| Élément | Ce qu'il signifie | Portée |
|---|---|---|
| Puce **non indentée** | notion de la colonne de gauche | l'item |
| Ligne **indentée** commençant par un intitulé | commentaire de la colonne de droite | l'item |
| `**Commentaire.**` | précision pédagogique ou de notation — **ne restreint rien** | l'item qui précède |
| `**Limite.**` | restriction de portée ou d'ambition | l'item qui précède |
| `**Non exigible.**` | au programme, mais non exigible | l'item qui précède |
| `**Hors programme.**` | **exclu** — ne doit pas être traité, ne peut faire l'objet d'aucune évaluation | l'item qui précède |
| Citation `>` | commentaire général du programme officiel | la section |

À savoir, faute de quoi la lecture est faussée :

- **Hors programme.** est la seule mention **prohibitive** ; **Limite.** et
  **Non exigible.** restreignent sans exclure.
- Les **mots clés de code** (mots clés SQL et Python, fonctions, noms de
  modules) sont transcrits tels quels, entre backticks — ils désignent des
  éléments du langage, pas du texte courant.
- Les formules restent en LaTeX : `$…$` en ligne.
- Cette transcription est **dérivée**. En cas de doute, le document cité en
  `source` fait foi.

---

## 3. Programme du troisième semestre

### 3.1. Bases de données

> On se limite volontairement à une description applicative des bases de
> données en langage SQL. Il s'agit de permettre d'interroger une base
> présentant des données à travers plusieurs relations.
>
> **Hors programme.** On ne présente pas l'algèbre relationnelle ni le calcul
> relationnel.

- Vocabulaire des bases de données : tables ou relations, attributs ou
  colonnes, domaine, schéma de tables, enregistrements ou lignes, types de
  données.
  **Commentaire.** On présente ces concepts à travers de nombreux exemples.
    On s'en tient à une notion sommaire de domaine : entier, flottant,
    chaîne.
  **Hors programme.** Aucune considération quant aux types des moteurs SQL.
  **Hors programme.** Aucune notion relative à la représentation des dates ;
    en tant que de besoin on s'appuie sur des types numériques ou chaîne pour
    lesquels la relation d'ordre coïncide avec l'écoulement du temps.
  **Hors programme.** Toute notion relative aux collations ; on se place dans
    l'hypothèse que la relation d'ordre correspond à l'ordre lexicographique
    usuel.
  **Hors programme.** `NULL`.
- Clé primaire.
  **Commentaire.** Une clé primaire n'est pas forcément associée à un unique
    attribut même si c'est le cas le plus fréquent.
  **Hors programme.** La notion d'index.
- Entités et associations, clé étrangère.
  **Commentaire.** On s'intéresse au modèle entité–association au travers de
    cas concrets d'associations $1-1$, $1-*$, $*-*$. Séparation d'une
    association $*-*$ en deux associations $1-*$. L'utilisation de clés
    primaires et de clés étrangères permet de traduire en SQL les associations
    $1-1$ et $1-*$.
- Requêtes `SELECT` avec simple clause `WHERE` (sélection), projection,
  renommage `AS`.
  **Commentaire.** Les opérateurs au programme sont `+`, `-`, `*`, `/` (on
    passe outre les subtilités liées à la division entière ou flottante), `=`,
    `<>`, `<`, `<=`, `>`, `>=`, `AND`, `OR`, `NOT`.
- Utilisation des mots-clés `DISTINCT`, `LIMIT`, `OFFSET`, `ORDER BY`.
- Opérateurs ensemblistes `UNION`, `INTERSECT` et `EXCEPT`, produit cartésien.
- Jointures internes $T_1 \text{ JOIN } T_2 \dots \text{ JOIN } T_n \text{ ON }
  \phi$. Autojointure.
  **Commentaire.** On présente les jointures en lien avec la notion de
    relations entre tables. On se limite aux équi-jointures : $\phi$ est une
    conjonction d'égalités.
- Agrégation avec les fonctions `MIN`, `MAX`, `SUM`, `AVG` et `COUNT`, y
  compris avec `GROUP BY`.
  **Commentaire.** Pour la mise en œuvre des agrégats, on s'en tient à la
    norme SQL99. On présente quelques exemples de requêtes imbriquées.
- Filtrage des agrégats avec `HAVING`.
  **Commentaire.** On marque la différence entre `WHERE` et `HAVING` sur des
    exemples.
- Mise en œuvre.
  **Hors programme.** La création de tables et la suppression de tables au
    travers du langage SQL.
  **Commentaire.** La mise en œuvre effective se fait au travers d'un
    logiciel permettant d'interroger une base de données à l'aide de requêtes
    SQL.
  **Limite.** Récupérer le résultat d'une requête à partir d'un programme
    n'est pas un objectif.
  **Commentaire.** Même si aucun formalisme graphique précis n'est au
    programme, on peut décrire les entités et les associations qui les lient
    au travers de diagrammes sagittaux informels.
  **Hors programme.** La notion de modèle logique vs physique, les bases de
    données non relationnelles, les méthodes de modélisation de base, les
    fragments DDL, TCL et ACL du langage SQL, les transactions,
    l'optimisation de requêtes par l'algèbre relationnelle.

### 3.2. Dictionnaires et programmation dynamique

> Les dictionnaires sont utilisés en boîte noire dès la première année ; les
> principes de leur fonctionnement sont présentés en deuxième année. Ils
> peuvent être utilisés afin de mettre en mémoire des résultats
> intermédiaires quand on implémente une stratégie d'optimisation par
> programmation dynamique.

- Dictionnaires, clés et valeurs.
  **Commentaire.** On présente les principes du hachage, et les limitations
    qui en découlent sur le domaine des clés utilisables.
- Usage des dictionnaires en programmation Python.
  **Commentaire.** Syntaxe pour l'écriture des dictionnaires. Parcours d'un
    dictionnaire.
- Programmation dynamique. Propriété de sous-structure optimale. Chevauchement
  de sous-problèmes. Calcul de bas en haut ou par mémoïsation. Reconstruction
  d'une solution optimale à partir de l'information calculée.
  **Commentaire.** La mémoïsation peut être implémentée à l'aide d'un
    dictionnaire. On souligne les enjeux de complexité en mémoire.
  **Commentaire.** Exemples : partition équilibrée d'un tableau d'entiers
    positifs, ordonnancement de tâches pondérées, plus longue sous-suite
    commune, distance d'édition (Levenshtein), distances dans un graphe
    (Floyd-Warshall).
- Mise en œuvre.
  **Commentaire.** Les exemples proposés ne forment une liste ni limitative
    ni impérative. Les cas les plus complexes de situations où la
    programmation dynamique peut être utilisée sont guidés. On met en rapport
    le statut de la propriété de sous-structure optimale en programmation
    dynamique avec sa situation en stratégie gloutonne vue en première année.

### 3.3. Algorithmique pour l'intelligence artificielle et l'étude des jeux

> Cette partie permet notamment de revisiter les notions de programmation et
> de représentation de données par un graphe, qui sont vues en première année,
> en les appliquant à des enjeux contemporains.

- Algorithme des $k$ plus proches voisins avec distance euclidienne.
  **Commentaire.** Matrice de confusion. Lien avec l'apprentissage supervisé.
- Algorithme des $k$-moyennes.
  **Commentaire.** Lien avec l'apprentissage non-supervisé.
  **Hors programme.** La démonstration de la convergence.
  **Commentaire.** On observe des convergences vers des minima locaux.
- Jeux d'accessibilité à deux joueurs sur un graphe. Stratégie. Stratégie
  gagnante. Position gagnante. Détermination des positions gagnantes par le
  calcul des attracteurs. Construction de stratégies gagnantes.
  **Commentaire.** On considère des jeux à deux joueurs ($J_1$ et $J_2$)
    modélisés par des graphes bipartis (l'ensemble des états contrôlés par
    $J_1$ et l'ensemble des états contrôlés par $J_2$). Il y a trois types
    d'états finals : les états gagnants pour $J_1$, les états gagnants pour
    $J_2$ et les états de match nul.
  **Limite.** On ne considère que les stratégies sans mémoire.
- Notion d'heuristique. Algorithme min-max avec une heuristique.
  **Hors programme.** L'élagage alpha-beta.
- Mise en œuvre.
  **Limite.** La connaissance dans le détail des algorithmes de cette section
    n'est pas un attendu du programme.
  **Commentaire.** Les étudiants acquièrent une familiarité avec les idées
    sous-jacentes qu'ils peuvent réinvestir dans des situations où les
    modélisations et les recommandations d'implémentation sont guidées,
    notamment dans leurs aspects arborescents.

---

## Annexe A. Langage Python

> Cette annexe liste limitativement les éléments du langage Python (version 3
> ou supérieure) dont la connaissance est exigible des étudiants.
>
> **Non exigible.** Aucun concept sous-jacent n'est exigible au titre de la
> présente annexe.
>
> **Non exigible.** Aucune connaissance sur un module particulier n'est
> exigible des étudiants.
>
> **Commentaire.** Toute utilisation d'autres éléments du langage que ceux que
> liste cette annexe, ou d'une fonction d'un module, doit obligatoirement être
> accompagnée de la documentation utile, sans que puisse être attendue une
> quelconque maîtrise par les étudiants de ces éléments.

- Traits généraux.
  - Typage dynamique : l'interpréteur détermine le type à la volée lors de
    l'exécution du code.
  - Principe d'indentation.
  - Portée lexicale : lorsqu'une expression fait référence à une variable à
    l'intérieur d'une fonction, Python cherche la valeur définie à l'intérieur
    de la fonction et à défaut la valeur dans l'espace global du module.
  - Appel de fonction par valeur : l'exécution de $f(x)$ évalue d'abord $x$
    puis exécute $f$ avec la valeur calculée.
- Types de base.
  - Opérations sur les entiers (`int`) : `+`, `-`, `*`, `//`, `**`, `%` avec
    des opérandes positifs.
  - Opérations sur les flottants (`float`) : `+`, `-`, `*`, `/`, `**`.
  - Opérations sur les booléens (`bool`) : `not`, `or`, `and` (et leur
    caractère paresseux).
  - Comparaisons `==`, `!=`, `<`, `>`, `<=`, `>=`.
- Types structurés.
  - Structures indicées immuables (chaînes, tuples) : `len`, accès par indice
    positif valide, concaténation `+`, répétition `*`, tranche.
  - Listes : création par compréhension $[e \text{ for } x \text{ in } s]$, par
    $[e] * n$, par `append` successifs ; `len`, accès par indice positif
    valide ; concaténation `+`, extraction de tranche, copie (y compris son
    caractère superficiel) ; `pop` en dernière position.
  - Dictionnaires : création $\{c_1 : v_1, \dots, c_n : v_n\}$, accès,
    insertion, présence d'une clé $k \text{ in } d$, `len`, `copy`.
- Structures de contrôle.
  - Instruction d'affectation avec `=`. Dépaquetage de tuples.
  - Instruction conditionnelle : `if`, `elif`, `else`.
  - Boucle `while` (sans `else`). `break`, `return` dans un corps de boucle.
  - Boucle `for` (sans `else`) et itération sur `range(a, b)`, une chaîne, un
    tuple, une liste, un dictionnaire au travers des méthodes `keys` et
    `items`.
  - Définition d'une fonction `def f(p1, …, pn)`, `return`.
- Divers.
  - Introduction d'un commentaire avec `#`.
  - Utilisation simple de `print`, sans paramètre facultatif.
  - Importation de modules avec `import module`, `import module as alias`,
    `from module import f, g, …`.
  - Manipulation de fichiers texte (la documentation utile de ces fonctions
    doit être rappelée ; tout problème relatif aux encodages est éludé) :
    `open`, `read`, `readline`, `readlines`, `split`, `write`, `close`.
  - Assertion : `assert` (sans message d'erreur).
