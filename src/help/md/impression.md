---
parent: index
---

# Imprimer en PDF

AZprose convertit vos notes **Markdown en PDF** du bouton Exporter : une note de cours, une fiche, un polycopié — le résultat est un vrai document PDF, prêt à imprimer ou à distribuer. Ce chapitre réunit tout le parcours : le principe, le dialogue d'impression, les gabarits, les réglages et le cas des planches de colles.

## Le principe, en une phrase

Votre note est d'abord transformée en **page web autonome** (mise en page, images embarquées, formules mathématiques), puis confiée à un **navigateur Chromium invisible** (*headless*) intégré à l'application, qui produit le PDF et l'écrit directement sur votre disque.

> [!note] Pourquoi ce détour par un navigateur ?
> Le navigateur garantit que **ce que vous voyez à l'écran est exactement ce qui sera imprimé** : mêmes polices, mêmes couleurs, mêmes encadrés. Le PDF obtenu est **vectoriel** : le texte reste sélectionnable et copiable, et les formules mathématiques restent nettes à toute échelle (elles deviennent des images SVG, pas des photos).

## Trois points d'entrée

| Où | Quoi |
|----|------|
| **Raccourci ⌘P** sur une note Markdown ouverte | Ouvre le dialogue d'impression de la note (mode *note*) |
| **Palette de commandes** (⌘⇧P) → « exporter en PDF » | Le même dialogue, sur la note active |
| **Bouton imprimante** dans la vue colle d'une note quotidienne | Ouvre le dialogue en mode *planches de colles* — voir [[impression#Les planches de colles|plus bas]] |

## Le parcours type

1. Ouvrez une note `.md` et appuyez sur **⌘P** — le dialogue d'impression s'ouvre avec **vos derniers réglages**.
2. Ajustez la mise en page (papier, marges, gabarit, colonnes, en-tête…) — chaque champ est expliqué dans [[impression#Le dialogue d'impression pas à pas|la section du dialogue]].
3. Cliquez **Aperçu** si vous voulez vérifier le rendu avant d'exporter : une fenêtre Chromium s'ouvre avec la page exacte du futur PDF (voir plus bas).
4. Cliquez **Exporter** — un dialogue d'enregistrement vous demande où écrire le fichier, puis le PDF est généré et le chemin vous est notifié.

> [!tip] L'aperçu d'impression en une touche
> Le bouton **Aperçu** ouvre la page dans une fenêtre de navigateur visible. Vous pouvez y faire **Ctrl+P** : le navigateur affiche alors son propre aperçu d'impression — le même moteur que celui qui produit le PDF. C'est le moyen le plus rapide de vérifier pagination, entêtes et pieds de page avant d'exporter.

## Ce que le PDF contient

- tout le **Markdown** de la note : titres, listes, tableaux, citations, encadrés (*callouts*), blocs de code ;
- les **images** locales (embarquées directement dans le PDF, pas de fichier à joindre) ;
- les **formules mathématiques** (requièrent une connexion Internet pour le chargement du moteur MathJax — voir plus bas) ;
- les **wikilinks** : en mode note, vous pouvez choisir d'« Inclure les fichiers liés » pour transformer en [[transclusions|transclusions]] les liens isolés sur leur ligne ;
- les **métadonnées** de la note via le gabarit choisi (titre, date, logo) — voir [[impression#Les gabarits et templates|les gabarits]].

## Le dialogue d'impression pas à pas

Le **dialogue d'impression** est la fenêtre qui s'ouvre quand vous appuyez sur **⌘P** (note Markdown) ou sur le bouton **imprimante** de la vue colle d'une note quotidienne. Il regroupe **toute la mise en page** : gabarit, papier, marges, colonnes, en-têtes — puis vous propose **Aperçu** et **Exporter**.

> [!info] Deux modes, un seul dialogue
> - Mode **note** (⌘P) : tous les réglages décrits ci-dessous.
> - Mode **planches de colles** : le dialogue est simplifié (pas de gabarit, pas d'« inclure les fichiers liés ») et gagne la case « avec évaluation » — voir [[impression#Les planches de colles|les planches de colles]].
>
> Vos derniers réglages sont chargés à chaque ouverture, selon le mode.

### Gabarit

Le gabarit qui encadre le document — Document simple, Cours ou Dense. Réservé au mode note — voir [[impression#Les gabarits et templates|les gabarits et templates]].

### Papier et orientation

| Réglage | Choix |
|---------|-------|
| **Papier** | A4 (défaut), A5, A3, Letter, Legal, ou **Personnalisé** |
| **Orientation** | Portrait (défaut) ou Paysage |

Avec le papier **Personnalisé**, deux compteurs apparaissent : **Largeur** et **Hauteur** en millimètres (de 50 à 600 mm) — utile pour les formats d'impression non standard (étiquettes, affiches).

### Marges

Quatre compteurs, en **millimètres** (0 à 50) : **haut**, **bas**, **gauche**, **droite**. Des marges de 10–15 mm sont confortables pour la plupart des documents.

### Colonnes

- **Colonnes** : 1, 2 ou 3 — le texte est alors composé en colonnes sur la page (comme un journal).
- **Écart colonnes** : l'espace entre les colonnes, en millimètres (2 à 30).

Deux colonnes sur du A4 paysage est le format classique d'un *polycopié*.

### En-tête et pied de page

Deux champs de texte, répétés sur **chaque page** du PDF :

- **En-tête** (ex. `Suites numériques — Terminale 6`) ;
- **Pied** (ex. `Page {page}/{pages}`).

Un champ **vide désactive** la zone. Quatre *placeholders* sont disponibles, remplacés automatiquement :

| Placeholder | Contenu |
|-------------|---------|
| `{title}` | Le titre du document (nom du fichier) |
| `{date}` | La date du jour |
| `{page}` | Le numéro de page courant |
| `{pages}` | Le nombre total de pages |

> [!note] L'en-tête vit dans la marge
> L'en-tête et le pied sont dessinés dans la **zone de marge** : pensez à garder des marges haute/basse suffisantes (10 mm ou plus) pour qu'ils ne chevauchent pas le contenu.

### Échelle et fonds

- **Échelle** : de 50 % à 200 % — la taille globale du contenu sur la page (un curseur avec affichage du pourcentage).
- **Imprimer les fonds** : active l'impression des **couleurs de fond** — indispensable pour les encadrés *callouts* colorés et les blocs de code ombrés. Désactivé, seul le texte noir est imprimé.

### Inclure les fichiers liés (mode note)

Quand cette option est active, les **wikilinks isolés sur leur ligne** (entourés de lignes vides, hors listes et blocs de code) deviennent des [[transclusions|transclusions]] : le contenu de la note liée est **inclus dans le PDF** à la place du lien, récursivement (limite de profondeur et détection de boucles incluses). Un lien au **milieu d'un paragraphe** reste une simple référence.

### Aperçu et export

Le bouton **Aperçu** ouvre la page exacte du futur PDF dans une **fenêtre Chromium visible** — même HTML, mêmes réglages. La fenêtre reste ouverte : vous pouvez ajuster les réglages du dialogue et relancer l'aperçu. Dans cette fenêtre, **Ctrl+P** affiche l'aperçu d'impression du navigateur, et l'**Impression système** reste disponible si vous préférez imprimer directement.

> [!tip] Quand utiliser l'aperçu ?
> Dès que vous changez papier, marges, colonnes ou gabarit, un coup d'œil à l'aperçu évite le PDF raté. Les réglages de mise en page (papier, colonnes, en-têtes) ne sont pleinement visibles qu'à l'impression — l'aperçu dans la fenêtre les montre fidèlement.

Le bouton **Exporter** :

1. ouvre un **dialogue d'enregistrement** (le fichier suggéré est la note avec l'extension `.pdf`) ;
2. génère le PDF avec un navigateur Chromium invisible ;
3. affiche une notification avec le **chemin du fichier** écrit.

> [!note] Les formules mathématiques
> Le rendu des formules utilise le **CDN MathJax** : l'export **hors ligne** produit un PDF sans les formules (le reste du document est intact). Le préambule mathématique de vos réglages (macros personnalisées) est pris en compte à l'export.

> [!note] Rien n'est perdu si vous annulez
> Annuler le dialogue d'enregistrement (ou fermer le dialogue d'impression) ne fait rien : pas de fichier écrit, vos réglages restent tels quels jusqu'au prochain export réussi.

## Les gabarits et templates

Un **gabarit** (*template*) est une coquille qui encadre le contenu rendu de votre note : il ajoute un logo, un titre, une date, et donne au document imprimé son allure générale. Vous choisissez le gabarit dans le dialogue d'impression (champ *Gabarit*) — ce réglage s'applique à l'export des **notes Markdown**.

### Les trois gabarits

| Gabarit | Ce qu'il fait | À quoi il sert |
|---------|---------------|----------------|
| **Document simple** | Logo (hauteur max. 64 px) puis le contenu de la note | Le choix du quotidien : une fiche, un support de cours |
| **Cours** | Un bandeau de couverture compact : logo, **titre** de la note, **date** du jour, filet de séparation, puis le contenu | Distribuer une note de cours en début de séance |
| **Dense** | Typographie resserrée (petite police, interligne et marges réduits) | Les documents longs, pour économiser le papier |

> [!info] Le gabarit ne touche pas au contenu
> Le gabarit encadre le contenu — il ne le modifie pas. Le corps du document (titres, paragraphes, images, tableaux) est mis en forme par les réglages typographiques de la section Impression — voir [[impression#Les réglages d'impression|les réglages]].

### Les variables du gabarit

Chaque gabarit peut afficher des informations calculées automatiquement, désignées par des variables entourées d'accolades :

| Variable | Contenu |
|----------|---------|
| `{{title}}` | Le titre : nom du fichier sans l'extension (ex. `Suites numériques`) |
| `{{date}}` | La date du jour au format français (ex. `7 janvier 2026`) |
| `{{logo}}` | L'image définie dans la note — invisible si absente |
| `{{altlogo}}` | Le texte alternatif du logo (accessibilité) |

Le titre et la date se remplissent tout seuls : vous n'avez rien à configurer.

### Le logo vient de la note elle-même

Si votre note déclare un **logo dans son front matter** (les métadonnées YAML en tête de note — voir [[front-matter|Les métadonnées]]), le gabarit l'affiche automatiquement :

````markdown
---
logo: images/lycee.png
altlogo: Logo du lycée
---

# Suites numériques — limites et convergence
````

Le chemin du logo peut être :

- **relatif au document** (conseillé) : `logo: images/lycee.png` — le fichier est cherché à côté de la note ;
- **absolu** : `/home/vous/Documents/lycee.png` ;
- une **adresse web** (`https://…`) ou une image déjà encodée en *data URI*.

> [!note] Une image illisible ne casse rien
> Si le fichier est absent ou illisible, le logo est simplement **invisible** — jamais d'image cassée à l'impression. Le reste du document est inchangé.

## Les réglages d'impression

Les réglages **Impression** se trouvent dans les paramètres de l'application : **Réglages (⌘,)** → section **Impression**. Ils définissent le **fond** de tous les documents imprimés : polices, taille, titres, et le gabarit des rapports de colle.

> [!warning] Une seule règle à retenir
> Ces réglages ne s'appliquent **qu'aux rendus d'impression** :
> - l'export **md → PDF** ;
> - les **planches de colles** (PDF) ;
> - les **emails de colles** et leurs **images archivées** (PNG).
>
> L'**aperçu à l'écran** (le panneau d'aperçu de l'éditeur) n'est **pas** affecté : il suit les réglages de la section **Aperçu**. C'est voulu — vous pouvez avoir un écran confortable et un papier compact.

### Polices

Deux réglages de police :

- **Principale** — la police du texte courant : Fira Sans, Inter, Ubuntu, Ubuntu Condensed, Système, ou **Personnalisée**.
- **Monospace** — la police du code : Fira Code, JetBrains Mono, Ubuntu Mono, Système.

> [!tip] Vérification des polices personnalisées
> Lorsque vous tapez une police **personnalisée**, l'application la vérifie **mot par mot** contre les polices réellement installées sur votre système : un champ **rouge** signale un nom inconnu (il serait remplacé à l'impression), **orange** un nom partiellement reconnu, **normal** un nom valide. Vérifiez l'orthographe exacte (ex. `Lato`, `Source Sans 3`).

### Typographie

| Réglage | Plage | Effet |
|---------|-------|-------|
| **Taille de police** | 12 – 24 px | La taille du texte courant |
| **Interligne** | 1,3 – 2,2 | L'espace vertical entre les lignes |
| **Largeur de colonne** | 500 – 1200 px | La largeur maximale du texte sur la page |

Un interligne proche de **1,5** est confortable pour un document distribué ; des valeurs basses (≈ 1,35) compriment le document pour économiser le papier.

### Titres

Pour chacun des trois niveaux de titre (H1, H2, H3), vous réglez :

- la **police** (avec les mêmes choix que la police principale, personnalisée comprise) ;
- la **taille** ;
- l'**alignement** (gauche, centre, droite) ;
- les **marges** haute et basse (l'espace autour du titre).

Ce sont ces réglages qui donnent la hiérarchie visuelle du document imprimé.

### Gabarit du rapport de colle

La section la plus puissante — elle ne concerne que les **colles**. Le rapport de colle (le visuel envoyé par email et imprimé sur les planches — voir [[impression#Les planches de colles|les planches]]) est composé de **5 zones dans un ordre fixe** :

| Zone | Contenu par défaut |
|------|--------------------|
| **Titre** | La matière et l'élève |
| **Sous-titre** | La date, ou « Rapport de colle » |
| **Métadonnées** | Les lignes date, créneau, salle, classe, groupe, colleur |
| **Corps** | Le programme et l'énoncé de la colle |
| **Évaluation** | La note globale, le détail par rubrique et les observations |

Pour chaque zone vous pouvez :

- **vider le template** → la zone disparaît du rapport ;
- **écrire un template** avec des variables `{{…}}` — les boutons de variables vous les insèrent à la fin du texte sans doublon ;
- **ajouter une classe CSS** à la zone (pour la styler depuis un fichier CSS).

#### Les variables du rapport

Les variables disponibles couvrent tout le contenu de la fiche : `{{matiere}}`, `{{eleve}}`, `{{date}}`, `{{meta.classe}}`, `{{meta.creneau}}`, `{{meta.salle}}`, `{{meta.programme}}`, `{{colleur}}`, `{{note}}`, `{{noteMax}}`, et les blocs `{{blocProg}}`, `{{blocEnonce}}`, `{{blocEval}}` (des zones entières déjà rendues), `{{rubriques}}` (le détail des notes par rubrique) et `{{observations}}`.

> [!note] Échappement automatique
> Les variables de **texte** (matière, élève, dates…) sont **échappées automatiquement** : un caractère spécial saisi dans la fiche ne peut pas casser la mise en page. Les blocs déjà **rendus** (`{{blocEnonce}}`, `{{rubriques}}`…) sont insérés tels quels — c'est leur rôle.

#### Les blocs conditionnels et de répétition

Le gabarit est plus qu'un texte : il sait s'adapter au contenu.

- `{{#if salle}} · {{salle}}{{/if}}` n'affiche le « · » **que si** la salle est renseignée — un rapport sans salle n'affiche pas de séparateur orphelin.
- `{{#unless var}}…{{/unless}}` fait l'inverse (affiche si la variable est **absente**).
- `{{#each rubriques}}…{{/each}}` répète le contenu **pour chaque rubrique** notée ; dans la boucle, les champs `{{label}}`, `{{value}}` et `{{maxScore}}` prennent la valeur de la rubrique courante.
- `{{else}}…` fournit la branche alternative (dans `{{#if}}` comme dans `{{#each}}`).
- Les blocs **s'imbriquent** les uns dans les autres.

> [!example] Un template de zone Évaluation
> ```
> {{#if note}}Note globale : {{note}}/{{noteMax}}{{else}}Aucune note{{/if}}
> {{#if rubriques}}{{#each rubriques}}{{label}} : {{value}}/{{maxScore}}
> {{/each}}{{/if}}
> {{#if observations}}Observations : {{observations}}{{/if}}
> ```

#### Fichiers CSS du gabarit

Vous pouvez ajouter des **fichiers CSS** (`.css`) qui stylent le rapport — par exemple vos couleurs d'établissement. Leur contenu est **copié** dans les réglages (le fichier n'est pas lié) : pour recharger des modifications, **re-sélectionnez le fichier**. Bouton « Retirer » pour l'enlever.

#### CSS personnalisé

Le champ **CSS personnalisé** reçoit des règles CSS libres, appliquées **après** le CSS du gabarit sur tous les rendus d'impression — la règle la plus fine gagne. Il s'applique au contenu des documents (md → PDF) comme aux rapports de colle.

#### Réinitialiser

Le bouton **Réinitialiser** en bas de la section restaure tous les réglages d'impression à leurs valeurs par défaut.

## Les planches de colles

Les **planches de colles** sont les fiches d'interrogation d'une note quotidienne (une fiche par élève, bloc de métadonnées + énoncé — voir [[colles|Les colles]]). Elles s'impriment via le **même dialogue d'impression** que les notes, mais dans un mode dédié.

### Le point d'entrée

1. Ouvrez la **note quotidienne** du jour de colle et passez son aperçu en **mode colle** (l'icône colle de la barre d'outils de l'aperçu) — voir [[journal|Les notes quotidiennes]].
2. Dans la barre d'outils, cliquez le bouton **imprimante** (« Imprimer »).
3. Le dialogue d'impression s'ouvre en mode *planches* : il compte les planches de la note et propose la mise en page.

### Ce qui change dans le dialogue

Le mode planches est **simplifié** par rapport au mode note :

- **plus de gabarit** — les planches utilisent toujours le **gabarit du rapport de colle** (le même visuel que le rapport envoyé par email) ;
- **plus d'« inclure les fichiers liés »** ;
- s'ajoutent la **case à cocher « Avec évaluation »** et un **compteur** indiquant le nombre de planches trouvées dans la note.

Tous les autres réglages restent disponibles : **papier, orientation, marges, colonnes, en-tête et pied de page, échelle, fonds**.

### La case « Avec évaluation »

La case (décochée par défaut) décide si la section **Évaluation** de chaque planche — les notes par rubrique et les observations — est incluse :

| État | Contenu des planches | Usage |
|------|----------------------|-------|
| **Sans** (défaut) | Métadonnées, programme, énoncé — **sans** les notes ni les observations | La **feuille d'examen** à découper et distribuer aux élèves le jour de la colle |
| **Avec** | La planche complète, notes et observations comprises | La version **administration / archivage** de la séance |

> [!note] L'élève, lui, reçoit toujours le compte rendu complet
> Le rapport envoyé par email à chaque famille contient toujours l'évaluation (note, rubriques, observations) — la case ne concerne que l'impression des planches. Voir [[colles|Les colles]].

### La mise en page par défaut

Par défaut, les planches s'impriment en **A4 paysage avec deux planches par page**, côte à côte — une feuille à découper en deux. Vous pouvez tout changer : **une planche par page** (colonne = 1) pour un format plus grand, trois par page pour économiser le papier, ou l'**orientation portrait**. Le groupe de planches d'une même page ne se sépare jamais entre deux pages.

### La planche : le gabarit du rapport

Chaque planche reprend le **gabarit du rapport de colle** configurable dans les réglages — 5 zones (titre, sous-titre, métadonnées, corps, évaluation), variables, blocs conditionnels — voir [[impression#Gabarit du rapport de colle|le gabarit du rapport]]. Particularités des planches imprimées :

- la **salle** est omise (le PDF est une feuille d'examen, pas un courrier — l'email la conserve) ;
- la **signature** n'apparaît dans aucun rendu ;
- la **mise en page** de la planche s'adapte à sa colonne (hauteur naturelle, fond blanc).

### Une mémoire séparée

Les réglages du mode planches sont mémorisés **séparément** de ceux des notes (`.azprose/print/colle.json`) : vous pouvez donc avoir, par exemple, un export de notes en A4 portrait et des planches en A4 paysage sans rien reconfigurer à chaque fois.

> [!tip] Une note sans planche
> Si la note ne contient **aucune planche** (pas de bloc `colle`), le dialogue l'indique et l'export est désactivé — impossible de produire un PDF vide.

## La mémoire des réglages

Les derniers réglages d'impression sont **sauvegardés par projet** (fichier `.azprose/print/md.json` dans votre coffre — les planches de colles ont leur propre mémoire dans `.azprose/print/colle.json`) : la prochaine ouverture du dialogue les retrouve tels quels. Les anciens fichiers `print.json` et `print-planches.json` sont relus automatiquement à la première ouverture (migration en lecture seule). Les réglages de fond (polices, titres…) vivent dans les réglages d'application, section **Impression**.

## Voir aussi

- Embarquer le contenu d'une note (les transclusions de l'export) : [[transclusions|Embarquer une note]]
- Le logo vient du front matter : [[front-matter|Les métadonnées]]
- Le cas d'usage des colles : [[colles|Les colles]]

#guide #impression
