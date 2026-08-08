# Gabarits et templates

Un **gabarit** (*template*) est une coquille qui encadre le contenu rendu de votre note : il ajoute un logo, un titre, une date, et donne au document imprimé son allure générale. Vous choisissez le gabarit dans le [[print-overlay]] (champ *Gabarit*) — ce réglage s'applique à l'export des **notes Markdown**.

## Les trois gabarits

| Gabarit | Ce qu'il fait | À quoi il sert |
|---------|---------------|----------------|
| **Document simple** | Logo (hauteur max. 64 px) puis le contenu de la note | Le choix du quotidien : une fiche, un support de cours |
| **Cours** | Un bandeau de couverture compact : logo, **titre** de la note, **date** du jour, filet de séparation, puis le contenu | Distribuer une note de cours en début de séance |
| **Dense** | Typographie resserrée (petite police, interligne et marges réduits) | Les documents longs, pour économiser le papier |

> [!info] Le gabarit ne touche pas au contenu
> Le gabarit encadre le contenu — il ne le modifie pas. Le corps du document (titres, paragraphes, images, tableaux) est mis en forme par les réglages typographiques de la section Impression — voir [[reglages]].

## Les variables du gabarit

Chaque gabarit peut afficher des informations calculées automatiquement, désignées par des variables entourées d'accolades :

| Variable | Contenu |
|----------|---------|
| `{{title}}` | Le titre : nom du fichier sans l'extension (ex. `Suites numériques`) |
| `{{date}}` | La date du jour au format français (ex. `7 janvier 2026`) |
| `{{logo}}` | L'image définie dans la note — invisible si absente |
| `{{altlogo}}` | Le texte alternatif du logo (accessibilité) |

Le titre et la date se remplissent tout seuls : vous n'avez rien à configurer.

## Le logo vient de la note elle-même

Si votre note déclare un **logo dans son front matter** (les métadonnées YAML en tête de note — voir [[front-matter]]), le gabarit l'affiche automatiquement :

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

## Les planches de colles : un gabarit à part

Les planches de colles n'utilisent **pas** ces gabarits : elles reprennent le **gabarit du rapport de colle** (le même visuel que le rapport envoyé par email), configurable dans les réglages — voir [[reglages]] (section *Gabarit du rapport*) et [[planches]].

## Voir aussi

- Le dialogue d'impression : [[print-overlay]]
- Les réglages typographiques des rendus imprimés : [[reglages]]
- Les métadonnées YAML en tête de note : [[front-matter]]

#guide #impression
