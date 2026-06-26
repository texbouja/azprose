# Solution de présentation

## Mode léger — SlideDeck (ProseMark, déjà intégré)

### Principe

Le mode présentation exploite directement le document Markdown ouvert dans l'éditeur, sans conversion ni second moteur. L'instance ProseMark existante (avec MathJax) est réutilisée en lecture seule : le rendu des formules est identique à celui de l'éditeur.

### Déclenchement

Le bouton Monitor apparaît dans la breadcrumb à gauche du bouton Prose, uniquement lorsque le mode prose est actif sur un onglet `.md`. Un second clic, ou la désactivation du mode prose, remet l'éditeur en mode normal.

### Traitement du document

1. **Stripping du frontmatter YAML** — le bloc `--- … ---` en tête de fichier est retiré avant tout découpage, pour que le `---` de fermeture ne soit pas interprété comme un séparateur de diapositive.
2. **Découpage** — le corps est splitté sur `\n---(?:\n|$)`, les sections vides sont ignorées.
3. **Affichage** — une instance `LazyProseMark` en `readOnly` reçoit le contenu de la diapositive courante. Une seule instance est maintenue dans le DOM ; le contenu est substitué à chaque navigation.

### Navigation

- Touches clavier : `←` `↑` (précédente), `→` `↓` `Espace` (suivante). Les événements sont ignorés si le focus est dans un `<input>` ou `<textarea>`.
- Boutons fléchés dans la barre de navigation en bas de l'écran (hauteur 36 px, `border-top: 1px solid var(--border)`).
- Compteur `n / total` centré entre les deux boutons.

### Contrainte de layout

`.mdv-shell__editor-solo` a `overflow: auto`. Un enfant direct avec `height: 100%` ne fonctionne pas dans ce contexte. Le composant `SlideDeck` utilise `position: absolute; inset: 0` pour s'appuyer sur le `position: relative` du conteneur parent, ce qui contourne la limitation.

### Intégration thème

Toutes les couleurs et polices du SlideDeck (`--bg`, `--border`, `--muted`, `--fg`, `--font-mono`) proviennent des tokens CSS actifs. Le passage d'un thème à l'autre est immédiat sans rechargement.

---

## Mode complet — Marp (différé)

### Cas d'usage

Documents conçus dès le départ comme des présentations : ratio 16:9, transitions, thème maîtrisé. Ces fichiers portent `marp: true` dans leur frontmatter YAML, ce qui les distingue des documents prose ordinaires.

### Intégration prévue

La détection du flag `marp: true` dans le frontmatter déclenchera un rendu Marp dédié au lieu du flux ProseMark habituel. Le rendu Marp a sa propre architecture CSS, indépendante du système de thèmes de l'application.

### État

Non implémenté. Priorité différée après consolidation du mode léger.
