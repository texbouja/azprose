# Imprimer en PDF — la chaîne complète

AZprose convertit vos notes **Markdown en PDF** du bouton Exporter : une note de cours, une fiche, un polycopié — le résultat est un vrai document PDF, prêt à imprimer ou à distribuer. Cette page explique le principe et les points d'entrée ; les pages suivantes détaillent chaque brique.

## Le principe, en une phrase

Votre note est d'abord transformée en **page web autonome** (mise en page, images embarquées, formules mathématiques), puis confiée à un **navigateur Chromium invisible** (*headless*) intégré à l'application, qui produit le PDF et l'écrit directement sur votre disque.

> [!note] Pourquoi ce détour par un navigateur ?
> Le navigateur garantit que **ce que vous voyez à l'écran est exactement ce qui sera imprimé** : mêmes polices, mêmes couleurs, mêmes encadrés. Le PDF obtenu est **vectoriel** : le texte reste sélectionnable et copiable, et les formules mathématiques restent nettes à toute échelle (elles deviennent des images SVG, pas des photos).

## Trois points d'entrée

| Où | Quoi |
|----|------|
| **Raccourci ⌘P** sur une note Markdown ouverte | Ouvre le dialogue d'impression de la note (mode *note*) |
| **Palette de commandes** (⌘⇧P) → « exporter en PDF » | Le même dialogue, sur la note active |
| **Bouton imprimante** dans la vue colle d'une note quotidienne | Ouvre le dialogue en mode *planches de colles* — voir [[planches]] |

## Le parcours type

1. Ouvrez une note `.md` et appuyez sur **⌘P** — le dialogue d'impression s'ouvre avec **vos derniers réglages**.
2. Ajustez la mise en page (papier, marges, gabarit, colonnes, en-tête…) — chaque champ est expliqué dans [[print-overlay]].
3. Cliquez **Aperçu** si vous voulez vérifier le rendu avant d'exporter : une fenêtre Chromium s'ouvre avec la page exacte du futur PDF (voir l'encadré ci-dessous).
4. Cliquez **Exporter** — un dialogue d'enregistrement vous demande où écrire le fichier, puis le PDF est généré et le chemin vous est notifié.

> [!tip] L'aperçu d'impression en une touche
> Le bouton **Aperçu** ouvre la page dans une fenêtre de navigateur visible. Vous pouvez y faire **Ctrl+P** : le navigateur affiche alors son propre aperçu d'impression — le même moteur que celui qui produit le PDF. C'est le moyen le plus rapide de vérifier pagination, entêtes et pieds de page avant d'exporter.

## Ce que le PDF contient

- tout le **Markdown** de la note : titres, listes, tableaux, citations, encadrés (*callouts*), blocs de code ;
- les **images** locales (embarquées directement dans le PDF, pas de fichier à joindre) ;
- les **formules mathématiques** (requièrent une connexion Internet pour le chargement du moteur MathJax — voir l'encadré dans [[print-overlay]]) ;
- les **wikilinks** : en mode note, vous pouvez choisir d'« Inclure les fichiers liés » pour transformer en transclusions les liens isolés sur leur ligne — voir [[transclusions]] ;
- les **métadonnées** de la note via le gabarit choisi (titre, date, logo) — voir [[gabarits]].

## Vos réglages sont mémorisés

Les derniers réglages d'impression sont **sauvegardés par projet** (fichier `.azprose/print.json` dans votre coffre) : la prochaine ouverture du dialogue les retrouve tels quels. Les planches de colles ont leur propre mémoire (`.azprose/print-planches.json`) — voir [[planches]]. Les réglages de fond (polices, titres…) vivent dans les réglages d'application, section **Impression** — voir [[reglages]].

## La suite du guide

- [[gabarits]] — les gabarits d'impression (*templates*) et le logo en tête de document
- [[reglages]] — les réglages d'impression dans l'application (polices, typographie, titres, gabarit du rapport de colle)
- [[print-overlay]] — le dialogue d'impression pas à pas
- [[planches]] — cas particulier : imprimer les planches de colles

#guide #impression
