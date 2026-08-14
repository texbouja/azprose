---
parent: index
---

# Les encadrés — callouts

Un *callout* est un **encadré coloré** qui met un passage en valeur. C'est un bloc de citation spécial : il commence par `>` (comme une citation), suivi de `[!type]`, où `type` donne la couleur et la signification de l'encadré.

```markdown
> [!note] Titre optionnel
> Contenu de l'encadré.
```

Le titre est facultatif : sans lui, l'encadré affiche le nom du type.

## Les types disponibles

AZprose comprend les types classiques du format Markdown Obsidian :

| Type | Usage | Rendu |
|------|-------|-------|
| `note` | Information neutre | bleu |
| `tip`, `hint`, `important` | Astuce, conseil | vert |
| `warning`, `caution`, `attention` | Attention | orange |
| `danger`, `error` | Danger | rouge |
| `success`, `check`, `done` | Réussite | vert |
| `info` | Information complémentaire | bleu |
| `question`, `help`, `faq` | Question | bleu |
| `todo` | Tâche à faire | orange |
| `failure`, `fail`, `missing` | Échec | rouge |
| `bug` | Bogue | rouge |
| `example` | Exemple | violet |
| `quote`, `cite` | Citation | gris |

Exemples :

> [!warning] Attention à la sauvegarde
> Les modifications non enregistrées peuvent être perdues. Prenez le réflexe `⌘S`.

> [!question] Pourquoi un encadré ?
> Parce que l'œil repère la couleur et la forme avant le texte. Un encadré rend un avertissement ou une astuce impossible à rater.

> [!success] Mission accomplie
> Vous savez maintenant encadrer vos idées !

## Les encadrés numérotés — callouts personnalisés de l'application

En plus des types classiques, AZprose apporte des **callouts personnalisés**, pensés pour les cours et les exercices. Ils sont numérotés automatiquement : chaque *Définition* ou *Exercice* du document prend un numéro dans l'ordre.

```markdown
> [!definition] Fonction paire
> Une fonction $f$ est paire si $f(-x) = f(x)$ pour tout $x$ de son domaine.

> [!theorem] Théorème des valeurs intermédiaires
> …

> [!exercise] Exercice d'application
> Soit $f$ la fonction définie sur $\mathbb{R}$ par $f(x) = x^2 - 4x + 3$. Résoudre $f(x) = 0$.
```

Les types personnalisés intégrés sont : `theorem` (théorème), `proposition`, `definition` (définition), `remark` (remarque), `example` (exemple), `exercise` (exercice).

## Plier et déplier — callouts repliables

Comme dans Obsidian, **chaque callout se replie d'un clic sur son titre** — avec ou sans marqueur. Le chevron sur la droite l'indique, et le contenu se replie ou se déplie.

Le marqueur `+` (déplié par défaut) ou `-` (replié par défaut), placé juste après le type, ne règle que **l'état initial** : sans marqueur, l'encadré est déplié par défaut (comme avec `+`).

```markdown
> [!note]+ Le détail en plus
> Ce paragraphe est visible, mais on peut replier l'encadré d'un clic.

> [!tip]- Un indice
> Cliquez pour déplier ce conseil.
```

## Ajouter un callout personnalisé

Vous voulez un type à vous — par exemple `rappel`, `materiel` ou `objectif` ? Rien de plus simple :

1. Ouvrez les réglages : `⌘,` (ou `Ctrl+,`), ou commande **Réglages** dans la palette.
2. Dans le menu de gauche, choisissez la section **Callouts**.
3. Dans le champ « Ajouter un type », tapez le nom de votre encadré (sans le `[!]`) — par exemple `materiel`.
4. Cliquez sur **Ajouter**, puis configurez :
   - le **libellé** affiché (par défaut, le nom) ;
   - la **numérotation** — *théorèmes*, *exercices* ou aucune ;
   - la **couleur** parmi la palette proposée.

Votre type est aussitôt disponible partout :

```markdown
> [!materiel] Pour cette séance
> Calculatrice graphique, cahier de brouillon, stylo rouge.
```

> [!tip] L'écriture assistée
> Quand vous tapez `> [!` dans l'éditeur, l'application vous propose la liste des types disponibles — y compris vos types personnalisés. Choisissez, et l'encadré se complète tout seul.

## Cas d'usage concrets

- **Attention** pour les pièges classiques en exercice.
- **Définition** et **Théorème** pour structurer un cours.
- **À retenir** (votre type personnalisé) pour les points à réviser avant un contrôle.
- Dans les colles, chaque planche peut commencer par un encadré *Programme* — voir [[colles|Les colles]].

## Voir aussi

- Organiser vos notes avec des étiquettes : [[vue-liens|La vue Liens]]
- Les métadonnées en tête de note : [[front-matter|Les métadonnées]]

#guide #callouts
