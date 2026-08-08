# Les réglages d'impression

Les réglages **Impression** se trouvent dans les paramètres de l'application : **Réglages (⌘,)** → section **Impression**. Ils définissent le **fond** de tous les documents imprimés : polices, taille, titres, et le gabarit des rapports de colle.

> [!warning] Une seule règle à retenir
> Ces réglages ne s'appliquent **qu'aux rendus d'impression** :
> - l'export **md → PDF** ;
> - les **planches de colles** (PDF) ;
> - les **emails de colles** et leurs **images archivées** (PNG).
>
> L'**aperçu à l'écran** (le panneau d'aperçu de l'éditeur) n'est **pas** affecté : il suit les réglages de la section **Aperçu**. C'est voulu — vous pouvez avoir un écran confortable et un papier compact.

## Polices

Deux réglages de police :

- **Principale** — la police du texte courant : Fira Sans, Inter, Ubuntu, Ubuntu Condensed, Système, ou **Personnalisée**.
- **Monospace** — la police du code : Fira Code, JetBrains Mono, Ubuntu Mono, Système.

> [!tip] Vérification des polices personnalisées
> Lorsque vous tapez une police **personnalisée**, l'application la vérifie **mot par mot** contre les polices réellement installées sur votre système : un champ **rouge** signale un nom inconnu (il serait remplacé à l'impression), **orange** un nom partiellement reconnu, **normal** un nom valide. Vérifiez l'orthographe exacte (ex. `Lato`, `Source Sans 3`).

## Typographie

| Réglage | Plage | Effet |
|---------|-------|-------|
| **Taille de police** | 12 – 24 px | La taille du texte courant |
| **Interligne** | 1,3 – 2,2 | L'espace vertical entre les lignes |
| **Largeur de colonne** | 500 – 1200 px | La largeur maximale du texte sur la page |

Un interligne proche de **1,5** est confortable pour un document distribué ; des valeurs basses (≈ 1,35) compriment le document pour économiser le papier.

## Titres

Pour chacun des trois niveaux de titre (H1, H2, H3), vous réglez :

- la **police** (avec les mêmes choix que la police principale, personnalisée comprise) ;
- la **taille** ;
- l'**alignement** (gauche, centre, droite) ;
- les **marges** haute et basse (l'espace autour du titre).

Ce sont ces réglages qui donnent la hiérarchie visuelle du document imprimé.

## Gabarit du rapport de colle

C'est la section la plus puissante — elle ne concerne que les **colles**. Le rapport de colle (le visuel envoyé par email et imprimé sur les planches — voir [[planches]]) est composé de **5 zones dans un ordre fixe** :

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

### Les variables

Les variables disponibles couvrent tout le contenu de la fiche : `{{matiere}}`, `{{eleve}}`, `{{date}}`, `{{meta.classe}}`, `{{meta.creneau}}`, `{{meta.salle}}`, `{{meta.programme}}`, `{{colleur}}`, `{{note}}`, `{{noteMax}}`, et les blocs `{{blocProg}}`, `{{blocEnonce}}`, `{{blocEval}}` (des zones entières déjà rendues), `{{rubriques}}` (le détail des notes par rubrique) et `{{observations}}`.

> [!note] Échappement automatique
> Les variables de **texte** (matière, élève, dates…) sont **échappées automatiquement** : un caractère spécial saisi dans la fiche ne peut pas casser la mise en page. Les blocs déjà **rendus** (`{{blocEnonce}}`, `{{rubriques}}`…) sont insérés tels quels — c'est leur rôle.

### Les blocs conditionnels et de répétition

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

## Fichiers CSS du gabarit

Vous pouvez ajouter des **fichiers CSS** (`.css`) qui stylent le rapport — par exemple vos couleurs d'établissement. Leur contenu est **copié** dans les réglages (le fichier n'est pas lié) : pour recharger des modifications, **re-sélectionnez le fichier**. Bouton « Retirer » pour l'enlever.

## CSS personnalisé

Le champ **CSS personnalisé** reçoit des règles CSS libres, appliquées **après** le CSS du gabarit sur tous les rendus d'impression — la règle la plus fine gagne. Il s'applique au contenu des documents (md → PDF) comme aux rapports de colle.

## Réinitialiser

Le bouton **Réinitialiser** en bas de la section restaure tous les réglages d'impression à leurs valeurs par défaut.

## Voir aussi

- Le dialogue d'impression : [[print-overlay]]
- Les gabarits de documents Markdown : [[gabarits]]
- Le cas des planches de colles : [[planches]]
- Les métadonnées YAML (front matter) : [[front-matter]]

#guide #impression
