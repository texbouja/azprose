# Intégration MathJax dans AZprose (Complété)

**Version :** MathJax 4.x (`mathjax` npm)  
**Mode :** static-import — tout est bundlé par Vite, servi depuis `public/mathjax/`. Aucune requête réseau.

---

## Changements critiques V3 → V4

En V3, les extensions d'accessibilité étaient **désactivées par défaut**. En V4, elles sont **activées par défaut** dans les composants combinés comme `tex-svg` :

| | V3 | V4 |
|---|---|---|
| Extensions a11y (speech, explorer…) | off | **on** |
| `startup.typeset` | false | **true** |
| `menuOptions.settings.enrich` | false | **true** |
| SRE (Speech Rule Engine) | chargé explicitement | chargé automatiquement si enrichissement actif |

Ces defaults V4 sont la cause des crashes "unknown sre function" sous WebKitGTK : SRE s'appuie sur un Web Worker (`public/mathjax/sre/speech-worker.js`) que WebKitGTK ne peut pas exécuter. Poser seulement `enableSpeech: false` (raisonnement V3) est insuffisant — en V4, SRE est amorcé par deux chemins indépendants : les flags `enable*` **et** le menu contextuel (`enrich: true` par défaut).

---

## Configuration de lancement — `src/main.ts`

La configuration doit être posée dans `window.MathJax` **avant** tout import de `mathjax/tex-svg.js`. En ESM, les imports sont hoistés au sommet du module ; la config est donc placée dans `main.ts`, qui s'exécute avant le montage de tout composant lazy.

```ts
const _mjPkgs: string[] = JSON.parse(
  localStorage.getItem("mdview.mathjax.packages") ?? "[]"
);

(window as any).MathJax = {
  loader: {
    // En ESM, document.currentScript est null — MathJax ne détecte pas son
    // chemin de base automatiquement. paths.mathjax le fixe explicitement.
    paths: { mathjax: "/mathjax" },
    ...(_mjPkgs.length > 0 && { load: _mjPkgs.map(p => `[tex]/${p}`) }),
  },

  // V4 : typeset: true par défaut → MathJax scannerait le DOM au démarrage,
  // en conflit avec le rendu widget-based de ProseMark. Impératif.
  startup: { typeset: false },

  ...(_mjPkgs.length > 0 && { tex: { packages: { "[+]": _mjPkgs } } }),

  options: {
    // Désactivation complète de la pipeline SRE/accessibilité.
    // enableEnrichment est le commutateur racine : speech, braille, explorer
    // et complexity en dépendent — désactiver l'enrichissement coupe tout.
    enableEnrichment: false,
    enableSpeech:     false,
    enableBraille:    false,
    enableExplorer:   false,
    enableComplexity: false,

    // Second chemin d'amorçage de SRE en V4 : le menu contextuel a enrich: true
    // par défaut, indépendamment des flags enable* ci-dessus.
    // Les deux couches doivent être désactivées explicitement.
    menuOptions: {
      settings: {
        enrich:       false,
        speech:       false,
        braille:      false,
        assistiveMml: false,
        voicing:      false,
      },
    },
  },
};
```

---

## Ordre d'import dans les composants

```
main.ts                      → window.MathJax = { ... }
                               ↑ doit s'exécuter en premier

ProseMarkEditor.svelte       → import "mathjax/tex-svg.js"
MarkdownPreview.svelte           lit window.MathJax au chargement
SlideDeck.svelte
                             → import "./mathjax-all-extensions.ts"
                               (empheq, mathtools, mhchem, physics)
                               ↑ doit venir après tex-svg.js
```

`mathjax-all-extensions.ts` enregistre ses modules dans une structure interne de MathJax qui doit déjà exister.

---

## Extensions optionnelles — `mathjax-all-extensions.ts`

Quatre extensions bundlées localement, activables par l'utilisateur dans Paramètres > MathJax :

| ID | Extension | Domaine |
|---|---|---|
| `empheq` | Encadrés d'équations | mise en évidence |
| `mathtools` | Extension d'`amsmath` (`\coloneqq`, `\prescript`…) | notation avancée |
| `mhchem` | Chimie moléculaire `\ce{H2O}` | sciences |
| `physics` | Bra-ket, dérivées, opérateurs… | physique |

Cocher une case ne déclenche aucun téléchargement réseau. Un changement de packages **nécessite un redémarrage** : MathJax s'initialise une seule fois au montage du composant.

---

## Intégration ProseMark

```ts
const mathOpts: LatexMarkdownEditorOptions = {
  mathJaxLoadMode: "static-import",  // utilise window.MathJax existant, pas le CDN
  renderCacheSize: 128,              // LRU cache — 128 dernières formules
};
```

### Préambule LaTeX global

Injecté dans la file MathJax avant la création de l'`EditorView` :

```ts
void mj?.startup?.promise?.then(() => {
  void mj.tex2svgPromise?.(preamble, { display: true });
});
```

Un `.then()` sur une promesse déjà résolue s'exécute dans l'ordre d'enregistrement. Posé avant la création de l'éditeur, le préambule entre dans la file série de MathJax avant toute formule de widget — les `\newcommand` sont disponibles dès le premier rendu.

---

## Stores persistés

| Store | Clé localStorage | Effet |
|---|---|---|
| `mathJaxPackages` (`string[]`) | `mdview.mathjax.packages` | packages activés — redémarrage requis |
| `mathJaxPreamble` (`string`) | `mdview.mathjax.preamble` | macros globales — effectif immédiatement |
