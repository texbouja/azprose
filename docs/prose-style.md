# Style Markdown — Guide de configuration

Le module **Style Markdown** vous permet de personnaliser l'apparence du rendu WYSIWYM de l'éditeur Markdown. Ces réglages n'affectent **que l'éditeur Markdown** — l'interface de l'application reste inchangée.

Pour ouvrir la fenêtre de paramètres, cliquez sur l'icône ⚙ (engrenage) tout à droite de la barre d'outils, puis sélectionnez **Style Markdown** dans la barre latérale.

---

## Mise en page

### Taille du texte

**Plage :** 12 – 22 px (pas : 1 px) · **Défaut :** 15 px

Contrôle la taille de la police du corps de texte. La taille affecte l'ensemble du contenu rendu — paragraphes, listes, citations — mais les titres conservent leurs proportions relatives (em).

### Hauteur de ligne

**Plage :** 1,30 – 2,20 (pas : 0,05) · **Défaut :** 1,65

L'interligne. Une valeur plus haute aère le texte et améliore la lisibilité pour les longs documents. Une valeur plus basse est utile pour les notes compactes ou la prise de notes rapide.

### Largeur maximale

**Plage :** 500 – 1200 px (pas : 50 px) · **Défaut :** 800 px

Largeur maximale de la zone de texte dans l'éditeur. Une ligne trop longue fatigue l'œil ; la valeur par défaut correspond à environ 75 caractères à 15 px avec Fira Sans, ce qui est optimal pour la lecture. Augmentez-la si vous travaillez souvent sur deux colonnes ou si votre écran est large.

### Marges horizontales

**Plage :** 16 – 80 px (pas : 4 px) · **Défaut :** 36 px

Espace vide à gauche et à droite de la zone de texte. Une marge généreuse donne un rendu plus aéré ; une marge réduite maximise l'espace utilisable sur les petits écrans.

---

## Polices

### Police principale

Police utilisée pour le corps du texte, les titres, les listes et les citations.

| Valeur | Police | Notes |
|--------|--------|-------|
| **Fira Sans** *(défaut)* | Fira Sans | Humaniste, lisible, excellente pour les textes longs |
| **Inter** | Inter | Police de l'interface — cohérence visuelle maximale |
| **Système** | Police système de l'OS | `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`… |

### Police monospace

Police utilisée pour les blocs de code, le code en ligne et les formules LaTeX en mode brut.

| Valeur | Police | Notes |
|--------|--------|-------|
| **Fira Code** *(défaut)* | Fira Code | Ligatures de code, excellente lisibilité |
| **JetBrains Mono** | JetBrains Mono | Légèrement plus large, très lisible |
| **Système** | Police monospace système | `ui-monospace`, `Menlo`, `Consolas`… |

---

## Réinitialiser

Le bouton **Réinitialiser** en bas de la fenêtre restaure toutes les valeurs par défaut. Les réglages sont sauvegardés automatiquement dans `localStorage` à chaque modification.

---

## Propriétés CSS exposées

Pour les utilisateurs avancés : les réglages ci-dessus sont traduits en variables CSS appliquées directement sur l'élément racine de l'éditeur (`.mdv-editor`). Vous pouvez les inspecter via les DevTools de Tauri.

| Variable | Contrôle |
|----------|----------|
| `--mdv-pm-font-size` | Taille du texte |
| `--mdv-pm-line-height` | Hauteur de ligne |
| `--mdv-pm-max-width` | Largeur maximale |
| `--mdv-pm-padding-h` | Marges horizontales |
| `--font` | Police principale (résolue) |
| `--pm-code-font` | Police monospace (résolue) |
