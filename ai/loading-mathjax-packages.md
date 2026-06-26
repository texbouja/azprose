# Architecture MathJax — AZprose

## Principe

MathJax est chargé en **mode static-import** : tous les modules nécessaires sont bundlés par Vite et servis localement. Aucune requête réseau n'a lieu au démarrage ni pendant l'utilisation. C'est une contrainte forte pour un contexte Tauri (pas de CDN, politique CSP stricte, support hors-ligne).

---

## Chaîne d'initialisation

### 1. Import statique du moteur principal

Dans `ProseMarkEditor.svelte`, en tête de fichier (avant tout import ProseMark) :

```ts
import "mathjax/tex-svg.js";
```

Ce fichier déclenche l'initialisation synchrone de MathJax. Il doit être importé **avant** les extensions optionnelles pour que MathJax soit prêt à les recevoir.

### 2. Extensions optionnelles (`mathjax-all-extensions.ts`)

```ts
// DOIT être importé APRES mathjax/tex-svg.js
import "mathjax/input/tex/extensions/mathtools.js";
import "mathjax/input/tex/extensions/empheq.js";
import "mathjax/input/tex/extensions/mhchem.js";
import "mathjax/input/tex/extensions/physics.js";
```

Ce fichier est importé statiquement dans le même composant. Les quatre extensions dépendent uniquement du coeur MathJax (base, ams, newcommand) — pas de dépendances croisées entre elles.

L'ordre import `tex-svg.js` puis extensions est obligatoire : les extensions enregistrent leurs modules dans une structure interne de MathJax qui doit déjà exister.

### 3. Configuration `window.MathJax`

La configuration est construite dynamiquement avant le montage du composant, à partir des packages activés par l'utilisateur (lus depuis localStorage) :

```ts
window.MathJax = {
  startup: { typeset: false },   // ProseMark gere le cycle de rendu lui-meme
  loader: { load: ["[tex]/mathtools", ...] },
  tex: { packages: { "[+]": ["mathtools", ...] } },
};
```

`typeset: false` est impératif : sans lui MathJax scannerait le DOM au démarrage, entrant en conflit avec le cycle de rendu de ProseMark.

Les entrées `loader.load` et `packages["[+]"]` sont construites à partir du tableau `mathJaxPackages.current` stocké en localStorage. Seuls les packages cochés par l'utilisateur sont activés.

### 4. Intégration ProseMark

```ts
const mathOpts: LatexMarkdownEditorOptions = {
  mathJaxLoadMode: "static-import",
  renderCacheSize: 128,
};
```

- `mathJaxLoadMode: "static-import"` — indique à ProseMark d'utiliser l'instance `window.MathJax` déjà présente plutôt que d'en charger une depuis le CDN jsDelivr.
- `renderCacheSize: 128` — les 128 dernières formules rendues sont mises en cache. Un document qui scrolle ne re-rend pas les formules déjà visitées.

### 5. Injection du préambule LaTeX

Le préambule global (macros utilisateur) est injecté dans la file MathJax **avant** la création de l'`EditorView`, en s'appuyant sur la promesse `startup.promise` :

```ts
void mj?.startup?.promise?.then(() => {
  void mj.tex2svgPromise?.(preamble, { display: true });
});
```

Les callbacks enregistrés sur une promesse résolue s'exécutent dans l'ordre d'enregistrement. En posant ce `.then()` avant la création de l'éditeur, le préambule entre dans la file série de MathJax avant toute formule de widget. Les `\newcommand` et `\DeclareMathOperator` sont disponibles dès le premier rendu.

---

## Stores persistés

Deux stores `persistedState` (localStorage) portent la configuration MathJax :

**`mathJaxPackages`** (`string[]`, défaut `[]`)
Liste des identifiants de packages activés. Lue au démarrage pour construire `window.MathJax`. Un changement nécessite un redémarrage de l'application car MathJax s'initialise une seule fois au montage du composant.

**`mathJaxPreamble`** (`string`, défaut `""`)
Macros LaTeX globales. Injectée à chaque montage de `ProseMarkEditor` via `tex2svgPromise`. Effective immédiatement sans redémarrage.

---

## Interface de configuration (Paramètres > Préambule MathJax)

### Packages

Grille de cases à cocher. Packages disponibles :

| ID | Extension |
|---|---|
| `empheq` | Encadrés d'équations avec accolades |
| `mathtools` | Extension d'`amsmath` (coloneqq, prescript...) |
| `mhchem` | Chimie : formules moléculaires `\ce{H2O}` |
| `physics` | Notation physique (bra-ket, dérivées...) |

Tous les packages sont bundlés localement dans `mathjax-all-extensions.ts` — cocher une case ne déclenche aucun téléchargement réseau. Le changement est persisté immédiatement mais **prend effet au prochain démarrage**.

### Macros LaTeX globales

Zone de texte libre. Accepte `\newcommand`, `\renewcommand`, `\DeclareMathOperator` et toute commande TeX valide dans un contexte display-math. Exemple :

```latex
\newcommand{\vect}[1]{\boldsymbol{#1}}
\DeclareMathOperator{\sh}{sh}
```

Le changement est persisté à chaque frappe et prend effet à la prochaine ouverture d'un fichier (remontage de `ProseMarkEditor`).

### Boutons du panneau

- **Réinitialiser** — vide le préambule (les packages ne sont pas touchés).
- **Relancer l'application** — nécessaire après un changement de packages ; appelle `restartApp()` via l'API Tauri.
