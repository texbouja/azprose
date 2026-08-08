# 8. Les notes quotidiennes — journal

Une *daily note* est une note datée, une par jour. C'est la cheville ouvrière du système : on y jette tout ce qui arrive, on y renvoie les détails par des liens, et on y revient le lendemain.

## Créer une note du jour

AZprose gère les daily notes automatiquement. Ouvrez la **palette de commandes** (`⌘⇧P` ou `Ctrl+⇧P`) et tapez « daily » — vous y trouverez :

| Commande | Action |
|----------|--------|
| *Open today's daily note* | Ouvre (ou crée) la note d'aujourd'hui |
| *Open yesterday's daily note* | La note d'hier |
| *Open tomorrow's daily note* | La note de demain |
| *Jump to daily note…* | Choisit une date dans un calendrier |
| *Open next monday's daily note*… | Les jours de la semaine à venir |
| *Open last friday's daily note*… | Les jours passés |

> [!tip] Toutes les commandes daily
> La palette de commandes (⌘⇧P) est votre meilleure amie : tapez « daily » et vous verrez toutes les commandes du journal, y compris *Jump to daily note…* qui ouvre un calendrier pour choisir une date passée ou future.

## La vue Journal

Une note quotidienne porte un nom de fichier daté, par exemple `2026-01-07.md`. Les notes du jour sont rangées dans le dossier *daily* (modifiable dans les réglages), et la vue **Journal** de la barre latérale gauche — la deuxième icône (le calendrier) — les classe **par mois** : ouvrez l'année, ouvrez le mois, et vous voyez toutes vos notes datées, prêtes à ouvrir. Voir aussi le chapitre 1, [[01-prise-en-main|Prise en main]].

## Que mettre dans une note quotidienne ?

La note du jour est un **journal de bord**, pas un document soigné :

- ce que vous avez fait, ce qui est à faire ;
- les liens vers les notes détaillées : `[[Suites numériques]]`, `[[Ahmed El Moujahid]]` ;
- des tags pour retrouver les thèmes du jour : `#colles`, `#revision` ;
- des questions, des idées, des références.

L'important : **tout relie**, rien ne s'égare. Le lendemain, la note d'hier devient un *backlink* naturel de tout ce qu'elle cite (voir le chapitre 6, [[06-vue-liens|La vue Liens]]).

## Le cas des colles : un cas d'école

La note quotidienne est le support naturel des séances de colle. Dans le chapitre 10, [[10-colles|Les colles]], vous verrez comment la note du jour (par exemple [[2026-01-07]]) devient la feuille de route d'une journée de colles : une fiche par élève, chacune reliée à sa fiche d'élève et à sa matière.

## Cas d'usage concrets

- **Journal de révision** : chaque jour, notez ce que vous avez révisé et taguez `#revision` ; le panneau Tags agrége les jours.
- **Carnet de bord du professeur** : le déroulé de chaque séance, les élèves interrogés, les remarques.
- **Corbeille à idées** : tout ce qui passe par la tête, relié plus tard à de vraies notes.

> [!example] Exemple de note du jour
> Voici à quoi ressemble une note quotidienne bien utilisée :
>
> ```markdown
> # 2026-01-07
>
> Journée colles — voir [[10-colles|Les colles]].
>
> - Planches du jour et élèves interrogés : [[2026-01-07]].
> - Relire [[Suites numériques]] avant jeudi.
> - Penser à l'exercice bonus pour [[Ahmed El Moujahid]].
>
> #colles #revision
> ```

## Voir aussi

- Le cas d'usage complet des colles : chapitre 10, [[10-colles|Les colles]]
- Les backlinks qui relient les journées : chapitre 6, [[06-vue-liens|La vue Liens]]
- La vue Journal de la barre latérale : chapitre 1, [[01-prise-en-main|Prise en main]]

#guide #journal
