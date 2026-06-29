# Intégration Typst dans AZprose

> Rapport d'analyse — juin 2026

Ce rapport analyse une architecture d'intégration Typst limitée au rendu Preview/Presentation/Export, en utilisant `tex2typst` pour la conversion LaTeX↔Typst côté frontend, contrastant avec le plan lourd décrit dans `ai/typst-integration.md` (backend Rust complet, éditeur `.typ` dédié, PDFjs synchronisé, recherche inverse).

---

## 1. Principe retenu

| Couche | Moteur |
|---|---|
| **Prose** (édition WYSIWYG) | MathJax (inchangé) |
| **Preview** (MarkdownPreview) | Compilateur Typst |
| **Presentation** (SlideDeck) | Compilateur Typst |
| **Export PDF** | Compilateur Typst |

MathJax reste le moteur *éditorial* dans ProseMark (via `@prosemark/latex`). Typst devient le moteur de *rendu* pour la visualisation et l'export.

**`tex2typst`** (npm) comble le fossé syntaxique : le preamble LaTeX de l'utilisateur (`\newcommand`, `\DeclareMathOperator`, etc.) et les formules `$...$` sont convertis en Typst à la volée, côté frontend. L'utilisateur continue d'écrire en LaTeX partout.

---

## 2. La pièce manquante : `tex2typst`

- **Dépôt** : [github.com/qwinsi/tex2typst](https://github.com/qwinsi/tex2typst)
- **npm** : `tex2typst`
- **License** : Apache 2.0
- **Fonction** : conversion bidirectionnelle de formules mathématiques LaTeX ↔ Typst
- **Compatibilité** : ✅ Node.js, ✅ Navigateur (WebView Tauri)
- **Poids** : < 20 KB compressé
- **API** : `tex2typst(tex: string): string` — aussi simple que ça

### 2.1 Ce qu'il convertit

```typescript
import { tex2typst } from "tex2typst";

tex2typst("e \\overset{\\text{def}}{=} \\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n");
// → "e eq.def lim_(n -> infinity) (1 + 1/n)^n"

tex2typst("\\frac{a}{b}");
// → "a / b"   (ou "frac(a, b)" selon les options)
```

### 2.2 Ce qu'il résout dans AZprose

| Problème | Sans tex2typst | Avec tex2typst |
|---|---|---|
| Preamble `\newcommand{\vect}[1]{\boldsymbol{#1}}` | Ignoré par Typst → formules cassées | Converti en `#let vect(#body) = { $bold(#body)$ }` |
| `\frac{}{}` en Typst | Pas valide → erreur de compilation | Converti en `frac(,)` ou `/` |
| `\sum_{i=1}^n` | Pas valide → erreur | Converti en `sum_(i=1)^n` |
| `\alpha \beta \gamma` | Pas valide → erreur | Converti en `alpha beta gamma` |
| `\operatorname{argmax}` | Pas valide → erreur | Converti en `"argmax"` ou fonction appropriée |

L'utilisateur écrit son **preamble LaTeX** dans les paramètres (inchangé). `tex2typst` le convertit en preamble Typst au moment du rendu Preview/Presentation/Export. Aucune double maintenance.

---

## 3. Pipeline de compilation Typst

`tex2typst` gère la syntaxe, mais il faut toujours un compilateur Typst pour produire du SVG/PDF.

### 3.1 Options

| Option | Latence | Taille bundle | Gestion packages | Notes |
|---|---|---|---|---|
| **Rust natif** (Tauri command) | ~2–10 ms | +30–50 Mo binaire | `typst_kit::SystemPackages` | Performant, packages réseau OK |
| **WASM** (`typst-ts-wasm`) | ~10–50 ms | +6–8 Mo WASM | Limitée (pas de réseau) | Pas de dépendance Rust |

### 3.2 Architecture retenue

```
  Frontend (WebView)
  ─────────────────────────────────────────────────────
  Markdown source (avec $...$ et preamble MathJax)
        │
        ▼
  tex2typst(src)          ← conversion LaTeX → Typst
        │
        ▼
  markdown-it + plugins   ← rendu HTML
        │
        ▼
  Appel Tauri invoke("typst_render", { source })
        │
  ──────┼──────────────────────────────────────────────
        ▼
  Backend Rust
  ─────────────────────────────────────────────────────
  typst::compile(&world)
        │
        ▼
  typst_svg::svg(&page)    → retourne <svg>...</svg>
  typst_pdf::pdf(&doc)     → retourne Vec<u8>
        │
  ──────┼──────────────────────────────────────────────
        ▼
  Frontend insère SVG / charge PDF
```

Le backend Rust est un module minimal de ~200 lignes (pas de world multi-fichiers, pas d'IDE).

### 3.3 Commande Tauri `typst_render`

```rust
#[tauri::command]
fn typst_render(source: String) -> Result<String, String> {
    let world = TypstRenderWorld { source };
    let doc = typst::compile(&world)
        .map_err(|e| diagnostics_to_string(&e))?;
    // Preview: première page en SVG (width: auto, height: auto)
    let svg = typst_svg::svg_merged(&doc.pages, "cm");
    Ok(svg)
}
```

Pour l'export PDF, une commande séparée `typst_export_pdf` retourne le document complet en `Vec<u8>`.

---

## 4. Modifications dans le code existant

### 4.1 `src/lib/markdown-render.ts`

```typescript
import { tex2typst } from "tex2typst";

export async function renderMarkdown(
  src: string,
  theme: Theme,
  mathEngine: "mathjax" | "typst" = "mathjax",
): Promise<string> {
  let body = src;

  if (mathEngine === "typst") {
    // Convertir tout le document LaTeX → Typst
    body = tex2typst(body, { wrapUnknownCommands: true });
    // Pas de conversion $ → \( (le plugin math est désactivé)
    // Pas d'appel MathJax.typesetPromise() après rendu
  } else {
    // Comportement actuel : conversion $ → \( + MathJax
  }

  // ... reste inchangé (frontmatter, shiki, etc.)
}
```

**Option** : au lieu de convertir le document entier, on peut ne convertir que les formules `$...$` et le preamble via `tex2typst`. C'est plus ciblé mais plus complexe à implémenter.

### 4.2 Preamble utilisateur

Actuellement stocké dans `mathjaxPreamble` store (localStorage). Avec `tex2typst` :

```typescript
// Au moment du rendu Typst :
const latexPreamble = mathJaxPreamble.current;
const typstPreamble = tex2typst(latexPreamble, { isPreamble: true });
// → typstPreamble est un #let ... valide pour Typst
```

Stockage unique, conversion automatique. L'utilisateur ne change rien.

### 4.3 Preview / Presentation

`MarkdownPreview.svelte` et `SlideDeck.svelte` appellent `renderMarkdown(src, theme, "typst")` :

- Plus d'import `mathjax/tex-svg.js`
- Plus d'appel `MathJax.typesetPromise()`
- Rendu SVG inline via le retour de `typst_render`

### 4.4 Export PDF

La commande `typst_export_pdf` remplace le `window.print()` actuel (cassé sur macOS/Windows) :

```rust
#[tauri::command]
fn typst_export_pdf(source: String, path: String) -> Result<(), String> {
    let world = TypstExportWorld::new(&source);
    let doc = typst::compile(&world).map_err(|e| e.to_string())?;
    let pdf = typst_pdf::pdf(&doc, &PdfOptions::default());
    std::fs::write(&path, pdf).map_err(|e| e.to_string())?;
    Ok(())
}
```

---

## 5. Dépendances

### npm (frontend)
```json
{
  "tex2typst": "^0.3.0"
}
```

### Cargo (backend)
```toml
[dependencies]
typst          = "0.13"
typst_svg      = "0.13"
typst_pdf      = "0.13"
typst_kit      = "0.13"     # polices + packages (optionnel si on ne compile que des fragments simples)
```

Pas de `typst_ide` (hors scope). Feature flag `typst` recommandé dans `Cargo.toml`.

---

## 6. Risques et limitations

| Risque | Sévérité | Mitigation |
|---|---|---|
| **`tex2typst` couvre-t-il tous les cas du preamble ?** | Moyenne | Tester sur les preambles réels des utilisateurs. Les commandes exotiques (`\usepackage`, `\newtheorem`) ne sont pas supportées. |
| **`tex2typst` non maintenu ?** | Faible | 438 commits, dernière mise à jour récente. Si abandon, le remplacer par MiTeX (Rust, plus complet). |
| **Taille du binaire Rust** | Moyenne | Feature flag `typst` ; build conditionnel. |
| **Latence compilation Typst** | Base | < 10 ms via Rust natif. Cache LRU des fragments déjà compilés. |
| **Divergence visuelle Prose ↔ Preview** | Faible | Les deux passes par `tex2typst` : ProseMark utilise MathJax sur la source LaTeX, Preview utilise Typst sur le résultat `tex2typst`. Les différences sont visuellement mineures (fractions, espacement). |
| **Packages Typst** (`#import`) | Faible | Pas de support dans ce scope (fragments autonomes seulement). |

---

## 7. Alternatives à `tex2typst`

| Outil | Langage | Scope | Compatibilité AZprose |
|---|---|---|---|
| **tex2typst** | JS/TS | Maths | ✅ WebView direct, idéal |
| **MiTeX** | Rust + Typst | Maths + document complet | ✅ Backend Rust, plus complet mais plus lourd |
| **Pandoc** | Haskell | Document complet | ❌ Binaire externe, pas pour le temps réel |
| **Tylax** | JS+WASM | Maths | ✅ Combinaison des deux, mais dépendance externe |

`tex2typst` est le meilleur rapport simplicité/couverture pour le besoin : convertir le preamble et les formules mathématiques d'une page web.

---

## 8. Plan d'implémentation

| Phase | Contenu | Dépendances |
|---|---|---|
| **1 — Base Rust** | Module `typst_engine` minimal, commande `typst_render` (SVG) | typst, typst_svg crates |
| **2 — Export PDF** | Commande `typst_export_pdf`, remplacer `window.print()` | typst_pdf crate |
| **3 — tex2typst** | Installer `tex2typst`, convertir preamble et formules dans `markdown-render.ts` | tex2typst npm |
| **4 — Preview Typst** | `MarkdownPreview` utilise le nouveau pipeline | Phases 1–3 |
| **5 — Presentation Typst** | `SlideDeck` utilise le nouveau pipeline | Phases 1–3 |
| **6 — Prose reste sur MathJax** | Aucun changement. `ProseMarkEditor.svelte` continue d'importer `mathjax/tex-svg.js`. | — |

Le phasage permet de valider chaque étape indépendamment.
