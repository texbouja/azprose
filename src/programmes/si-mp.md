---
id: si-mp
filiere: [MP]
matiere: sciences industrielles
niveau: 2
source: "Programme de sciences industrielles de l'ingénieur (filière MPSI-MP), MESRI 2021"
---

# Programme de sciences industrielles de l'ingénieur — MP

## Comment lire ce document

Transcription d'une partie du programme officiel de sciences industrielles de
l'ingénieur de la filière MPSI-MP, **restreinte au niveau de seconde année**
(semestres S3 et S4). Le texte des compétences et des connaissances est **celui
du document source** ; seuls les marques de hiérarchie et les intitulés en gras
sont ajoutés, ils rendent explicites ce que la présentation du document
exprimait par la position en colonne.

Le programme est organisé en cinq compétences générales — Analyser (A),
Modéliser (B), Résoudre (C), Expérimenter (D), Communiquer (E) — déclinées en
compétences attendues (A1, A2, …). Chaque compétence attendue est présentée en
deux colonnes : « compétences développées » à gauche, « connaissances
associées » à droite, avec un indicateur de positionnement temporel. La
transcription conserve cette structure par l'indentation :

| Élément | Ce qu'il signifie | Portée |
|---|---|---|
| Puce **non indentée** | compétence développée de la colonne de gauche | l'item |
| Puce **indentée** | connaissance associée de la colonne de droite, sous la compétence qu'elle accompagne | l'item |
| « Semestre S3. » ou « Semestre S4. » en fin de puce | indicateur de positionnement temporel dans le cycle (acquis en fin du semestre précisé) | l'item |
| Citation `>` | commentaire du programme officiel | la sous-section |
| « ⇆ I » | lien avec l'enseignement d'informatique du tronc commun (symbole du document source) | l'item |

À savoir, faute de quoi la lecture est faussée :

- Les intitulés limitatifs sont, comme dans les autres programmes :

  | Intitulé | Ce qu'il signifie | Portée |
  |---|---|---|
  | **Commentaire.** | précision, notation — **ne restreint rien** | l'item qui précède |
  | **Limite.** | restriction de portée ou d'ambition | l'item qui précède |
  | **Non exigible.** | au programme, mais non exigible | l'item qui précède |
  | **Hors programme.** | **exclu** — ne doit pas être traité, ne peut faire l'objet d'aucune évaluation | l'item qui précède |

- **Hors programme.** est la seule mention **prohibitive** ; **Limite.**
  et **Non exigible.** restreignent sans exclure.
- Cette transcription est **dérivée**. En cas de doute, le document cité en
  `source` fait foi.

---

## A. Analyser

### A3. Analyser l'organisation fonctionnelle et structurelle

- Justifier le choix des constituants dédiés aux fonctions d'un système.
  - Diagramme de bloc interne. Semestre S4.
  - Chaines fonctionnelles (chaine d'information et chaine de puissance).
    Semestre S4.
- Analyser les principes d'intelligence artificielle. ⇆ I
  - Régression et classification, apprentissages supervisé et non supervisé.
    Semestre S3.
  - Phases d'apprentissage et d'inférence. Semestre S3.
  - Modèle linéaire monovariable ou multivariable. Semestre S3.
  - Réseaux de neurones (couches d'entrée, cachées et de sortie, neurones,
    biais, poids et fonction d'activation). Semestre S3.

### A4. Analyser les performances et les écarts

- Extraire un indicateur de performance pertinent à partir du cahier des
  charges ou de résultats issus de l'expérimentation ou de la simulation.
  Semestre S4.
- Caractériser les écarts entre les performances.
  - Ordre de grandeur. Semestre S4.
  - Homogénéité des résultats. Semestre S4.
- Interpréter et vérifier la cohérence des résultats obtenus expérimentalement,
  analytiquement ou numériquement. ⇆ I
  - Matrice de confusion (tableau de contingence), sensibilité et spécificité
    d'un test. Semestre S4.
- Rechercher et proposer des causes aux écarts constatés. Semestre S4.

## B. Modéliser

### B1. Choisir les grandeurs physiques et les caractériser

- Identifier les performances à prévoir ou à évaluer. Semestre S4.
- Identifier les grandeurs d'entrée et de sortie d'un modèle.
  - Grandeurs flux, grandeurs effort. Semestre S4.
- Identifier les paramètres d'un modèle. Semestre S4.
- Identifier et justifier les hypothèses nécessaires à la modélisation.
  Semestre S4.

### B2. Proposer un modèle de connaissance et de comportement

- Choisir un modèle adapté aux performances à prévoir ou à évaluer.
  - Phénomènes physiques. Semestre S4.
  - Domaine de validité. Semestre S4.
  - Solide indéformable. Semestre S4.
- Compléter un modèle multiphysique.
  - Paramètres d'un modèle. Semestre S3.
  - Grandeurs flux et effort. Semestre S3.
- Associer un modèle aux composants des chaines fonctionnelles.
  - Sources parfaites. Semestre S3.

> **Commentaire.** Un logiciel de modélisation multiphysique permettant
> d'assembler des composants technologiques issus d'une bibliothèque est
> privilégié pour la modélisation des systèmes pluritechnologiques. Les
> modèles mis en œuvre couvrent différents domaines (électrique, mécanique,
> thermique, hydraulique et pneumatique).

- Simplifier un modèle.
  - Linéarisation d'un modèle autour d'un point de fonctionnement.
    Semestre S3.
  - Pôles dominants et réduction de l'ordre du modèle : principe ;
    justification ; limites. Semestre S3.
- Déterminer les caractéristiques d'un solide ou d'un ensemble de solides
  indéformables.
  - Solide indéformable : définition ; repère ; équivalence solide/repère ;
    volume et masse ; centre d'inertie ; matrice d'inertie. Semestre S3.

> **Non exigible.** Les calculs intégraux des éléments d'inertie (matrice et
> centre d'inertie) ne donnent pas lieu à évaluation.

### B3. Valider un modèle

- Préciser les limites de validité d'un modèle.
  - Point de fonctionnement. Semestre S4.
  - Non-linéarités (courbure, hystérésis, saturation et seuil) et retard pur.
    Semestre S4.
- Modifier les paramètres et enrichir le modèle pour minimiser l'écart entre
  les résultats analytiques et/ou numériques et les résultats expérimentaux.
  Semestre S4.

## C. Résoudre

### C1. Proposer une démarche de résolution

- Proposer une démarche de réglage d'un correcteur.
  - Compensation de pôles, réglage de marges, amortissement, rapidité et bande
    passante. Semestre S3.
  - Application aux correcteurs de type proportionnel, proportionnel intégral
    et à avance de phase. Semestre S3.
- Choisir une démarche de résolution d'un problème d'ingénierie numérique ou
  d'intelligence artificielle. ⇆ I
  - Décomposition d'un problème complexe en sous problèmes simples.
    Semestre S3.
  - Choix des algorithmes (réseaux de neurones, k plus proches voisins et
    régression linéaire multiple). Semestre S3.
- Proposer une démarche permettant la détermination d'une action mécanique
  inconnue ou d'une loi de mouvement.
  - Graphe de structure. Semestre S3.
  - Choix des isolements. Semestre S3.
  - Choix des équations à écrire pour appliquer le principe fondamental de la
    statique ou le principe fondamental de la dynamique dans un référentiel
    galiléen. Semestre S3.
  - Théorème de l'énergie cinétique. Semestre S3.

### C2. Mettre en œuvre une démarche de résolution analytique

- Mettre en œuvre une démarche de réglage d'un correcteur.
  - Correcteurs proportionnel et proportionnel intégral. Semestre S4.
- Déterminer les actions mécaniques en dynamique dans le cas où le mouvement
  est imposé.
  - Torseurs cinétique et dynamique d'un solide ou d'un ensemble de solides,
    par rapport à un référentiel galiléen. Semestre S3.
  - Principe fondamental de la dynamique en référentiel galiléen.
    Semestre S3.
  - Énergie cinétique. Semestre S3.
  - Inertie et masse équivalentes. Semestre S3.
  - Puissance d'une action mécanique extérieure à un solide ou à un ensemble
    de solides, dans son mouvement par rapport au repère galiléen.
    Semestre S3.
- Déterminer la loi de mouvement dans le cas où les efforts extérieurs sont
  connus.
  - Puissance intérieure à un ensemble de solides. Semestre S3.
  - Théorème de l'énergie cinétique. Semestre S3.
  - Rendement en régime permanent. Semestre S3.

### C3. Mettre en œuvre une démarche de résolution numérique

- Résoudre numériquement une équation ou un système d'équations. ⇆ I
  - Réécriture des équations d'un problème. Semestre S3.
  - Résolution de problèmes du type $f(x) = 0$ (méthodes de dichotomie et de
    Newton). Semestre S3.
  - Résolution d'un système linéaire du type $A \cdot X = B$. Semestre S3.
  - Résolution d'équations différentielles (schéma d'Euler explicite).
    Semestre S3.
  - Intégration et dérivation numérique (schémas arrière et avant).
    Semestre S3.

> **Commentaire.** La « réécriture des équations » signifie :
>
> - remettre en forme des équations pour leurs traitements par une
>   bibliothèque ;
> - mettre sous forme matricielle un problème (problème de Cauchy et système
>   linéaire).
>
> **Commentaire.** Les méthodes numériques sont introduites au fur et à
> mesure, en fonction des besoins de la formation. Pour la résolution d'un
> système d'équations du type $A \cdot X = B$, l'utilisation d'une
> bibliothèque préimplémentée est privilégiée.
>
> **Non exigible.** Les aspects théoriques liés aux méthodes numériques ne
> sont pas exigibles (stabilité, convergence, conditionnement de matrices…).

- Résoudre un problème en utilisant une solution d'intelligence artificielle.
  ⇆ I
  - Apprentissage supervisé. Semestre S3.
  - Choix des données d'apprentissage. Semestre S3.
  - Mise en œuvre des algorithmes (réseaux de neurones, k plus proches voisins
    et régression linéaire multiple). Semestre S3.
  - Phases d'apprentissage et d'inférence. Semestre S3.

> **Commentaire.** Des bibliothèques préimplémentées sont utilisées.
