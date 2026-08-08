# Le dialogue d'impression

Le **dialogue d'impression** est la fenêtre qui s'ouvre quand vous appuyez sur **⌘P** (note Markdown) ou sur le bouton **imprimante** de la vue colle d'une note quotidienne. Il regroupe **toute la mise en page** : gabarit, papier, marges, colonnes, en-têtes — puis vous propose **Aperçu** et **Exporter**.

> [!info] Deux modes, un seul dialogue
> - Mode **note** (⌘P) : tous les réglages décrits ci-dessous.
> - Mode **planches de colles** : le dialogue est simplifié (pas de gabarit, pas d'« inclure les fichiers liés ») et gagne la case « avec évaluation » — voir [[planches]].
>
> Vos derniers réglages sont chargés à chaque ouverture, selon le mode.

## Les réglages

### Gabarit

Le gabarit qui encadre le document — Document simple, Cours ou Dense. Réservé au mode note — voir [[gabarits]].

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

Quand cette option est active, les **wikilinks isolés sur leur ligne** (entourés de lignes vides, hors listes et blocs de code) deviennent des **transclusions** : le contenu de la note liée est **inclus dans le PDF** à la place du lien, récursivement (limite de profondeur et détection de boucles incluses). Un lien au **milieu d'un paragraphe** reste une simple référence. Voir [[transclusions]] pour le principe.

## Aperçu avant d'exporter

Le bouton **Aperçu** ouvre la page exacte du futur PDF dans une **fenêtre Chromium visible** — même HTML, mêmes réglages. La fenêtre reste ouverte : vous pouvez ajuster les réglages du dialogue et relancer l'aperçu. Dans cette fenêtre, **Ctrl+P** affiche l'aperçu d'impression du navigateur, et l'**Impression système** reste disponible si vous préférez imprimer directement.

> [!tip] Quand utiliser l'aperçu ?
> Dès que vous changez papier, marges, colonnes ou gabarit, un coup d'œil à l'aperçu évite le PDF raté. Les réglages de mise en page (papier, colonnes, en-têtes) ne sont pleinement visibles qu'à l'impression — l'aperçu dans la fenêtre les montre fidèlement.

## Exporter

Le bouton **Exporter** :

1. ouvre un **dialogue d'enregistrement** (le fichier suggéré est la note avec l'extension `.pdf`) ;
2. génère le PDF avec un navigateur Chromium invisible ;
3. affiche une notification avec le **chemin du fichier** écrit.

> [!note] Les formules mathématiques
> Le rendu des formules utilise le **CDN MathJax** : l'export **hors ligne** produit un PDF sans les formules (le reste du document est intact). Le préambule mathématique de vos réglages (macros personnalisées) est pris en compte à l'export.

> [!note] Rien n'est perdu si vous annulez
> Annuler le dialogue d'enregistrement (ou fermer le dialogue d'impression) ne fait rien : pas de fichier écrit, vos réglages restent tels quels jusqu'au prochain export réussi.

## La mémoire des réglages

À chaque export réussi, les réglages du dialogue sont **mémorisés par projet** dans `.azprose/print.json` — la prochaine ouverture les retrouve. Les planches de colles mémorisent les leurs dans `.azprose/print-planches.json` (voir [[planches]]). Les réglages typographiques de fond (polices, titres) vivent dans les réglages d'application — voir [[reglages]].

## Voir aussi

- Le principe de la chaîne : [[impression]]
- Les gabarits d'impression : [[gabarits]]
- Les réglages de fond : [[reglages]]
- Le cas des planches de colles : [[planches]]

#guide #impression
