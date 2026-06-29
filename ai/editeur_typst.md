# Éditeur Typst — feuille de route

> Juin 2026. **Remplace** la direction décrite dans `ai/integration_typst.md`
> (Typst comme moteur de rendu des maths Markdown), désormais **abandonnée**.

## Changement de cap

L'idée d'utiliser Typst pour *rendre les formules* dans la preview/présentation Markdown
(via extraction de formules + `tex2typst` par formule) a échoué et est abandonnée. MathJax
reste l'unique moteur de maths côté Markdown (Prose, Preview, Présentation).

**Nouvel objectif** : un véritable **mode éditeur Typst** pour les fichiers `.typ`, offrant
une **live preview** et la **compilation vers PDF**. Inspirations : `tinymist` (LSP +
serveur de preview SVG incrémental, référence haut de gamme), `typstudio` (même stack
Tauri + Svelte + crate `typst` natif, rend en SVG — la plus directement transposable),
`typstify` (Go, référence UX).

**Décisions actées :** preview en **SVG natif** (crate Rust, pas de WASM/`typst.ts`) ;
livraison **par phases** (MVP d'abord, puis itérations).

## ⚠️ Condition essentielle — compatibilité Windows

**Une grande partie du public cible est sous Windows.** Toute fonctionnalité de l'éditeur
Typst (et du reste de l'app) **doit fonctionner sous Windows**, pas seulement Linux/macOS.
C'est une condition non négociable de chaque tâche ci-dessous.

Implications concrètes :
- **Pas de chemins/API Unix-only.** Ne pas lire `HOME`/`XDG_*` en dur → utiliser le crate
  [`dirs`](https://docs.rs/dirs) (`dirs::data_dir()`, `dirs::cache_dir()`) qui résout le bon
  emplacement par plateforme (Windows : `%APPDATA%` / `%LOCALAPPDATA%`).
- Pas de séparateur `/` codé en dur, pas de prefix-match de chemins sensible à la casse.
- Vérifier la compilation/build Windows (CI) avant de considérer une phase « faite ».

**✅ Corrigé** (checkpoint « avant typst live view ») : la résolution des packages dans
`src-tauri/src/typst_engine/mod.rs` utilise désormais le crate `dirs` (`data_dir()` /
`cache_dir()`) → bon dossier par OS (Windows : `%APPDATA%` / `%LOCALAPPDATA%`). Auparavant
elle lisait `XDG_*`/`HOME` et renvoyait `None` sous Windows. Rappel : le crate `typst`
**compile** sous Windows (Rust pur, binaires MSVC officiels) ; les pièges restants sont
*runtime* (chemins/env vars).

## Ce qui existe déjà (working tree non commité)

Le MVP est largement amorcé — il faut le finir et le réorienter de PDF vers SVG :

| Élément | Fichier | État |
|---|---|---|
| Coloration `.typ` (CodeMirror `StreamParser`) | `src/lib/editor-languages.ts` (`typst`, ~l.36, l.131) | ✅ En place |
| Backend `RenderWorld` (fonts embarquées+système, packages XDG, accès projet) | `src-tauri/src/typst_engine/mod.rs:38` | ✅ Solide |
| `typst_render(file_path, source) → SVG fusionné` | `mod.rs:156` (`svg_merged`) | ✅ Présent, **inutilisé par le frontend** |
| `typst_export_pdf(file_path, source, path)` | `mod.rs:163` | ✅ Présent et **câblé** |
| `typst_page_count(file_path, source)` | `mod.rs:181` | ✅ Présent, inutilisé |
| Toggle preview + export, recompilation debouncée | `src/app.svelte` (`handleToggleTypstPreview` l.1161, effect l.1201) | ⚠️ Marche mais **via PDF**, à réorienter SVG |
| Boutons Breadcrumb (preview/export, visibles si `.typ`) | `src/components/chrome/Breadcrumb.svelte:264` | ✅ En place |
| i18n `breadcrumb.typstPreview/typstExport` | `src/locales/*.json` | ✅ 4 locales |

**Approche actuelle de la preview** : `handleToggleTypstPreview` compile tout le `.typ` en
**PDF** dans `appDataDir`, puis l'affiche via `LazyPdfViewer` (le viewer PDF.js déjà utilisé
pour les `.pdf`), avec recompilation PDF debouncée à chaque frappe (`app.svelte:1201-1219`).
→ Lourd (recompile + re-render PDF.js à chaque pause, perte du scroll). **On remplace ce
chemin par du SVG.**

## Code mort à retirer (reliquat de l'approche abandonnée)

- `src/lib/typst-render.ts` — `renderTypstMath` / `typstPageCount` par formule, **importé
  nulle part**, et bug `file_path` manquant. À **supprimer**.
- Classes CSS `.typst-rendered*` dans `src/styles/preview/preview.css:245-248` et
  `src/styles/editor/slides.css:220-223` — utilisées seulement par le code mort. À retirer
  (ne pas confondre avec les styles de la nouvelle preview, qui seront propres au composant).

---

## Phase 0 — Nettoyage

1. Supprimer `src/lib/typst-render.ts` et les classes `.typst-rendered*` (preview.css,
   slides.css).
2. Marquer `ai/integration_typst.md` comme **obsolète/abandonné** (bandeau en tête, ou
   déplacer en `ai/archive/`).

## Phase 1 — Live preview SVG (MVP)

**Objectif** : éditer un `.typ` à gauche, voir le SVG compilé à droite, mis à jour en live.
Réutilise le `typst_render` déjà présent (corrigé pour passer `file_path`).

### Backend (`mod.rs`)

- Ajouter une commande **`typst_preview(file_path, source) -> TypstPreview`** qui compile
  **une seule fois** et renvoie le SVG **+ les warnings** (aujourd'hui jetés dans `compile()`,
  `mod.rs:152`) :
  ```rust
  #[derive(serde::Serialize)]
  struct TypstPreview { svg: String, warnings: Vec<String>, pages: usize }
  ```
  Réutiliser `compile()` (déjà câblé sur `RenderWorld`). `svg_merged` fournit le SVG continu
  (toutes pages empilées) — idéal pour un scroll-view. `typst_render`/`typst_page_count`
  peuvent rester ou être remplacés par cette commande unique (évite la double compilation).
- L'enregistrer sous `#[cfg(feature = "typst")]` dans `lib.rs:386`.

### Frontend

- Nouveau composant **`src/components/typst/TypstPreview.svelte`** (+ wrapper lazy, sur le
  modèle de `LazyPdfViewer` / `LazyMarkdownPreview`) :
  - props `value: string`, `filePath: string` ;
  - debounce ~300 ms → `invoke("typst_preview", { filePath, source: value })` ;
  - injecte le SVG dans un conteneur scrollable ; conserve la **dernière preview valide**
    en cas d'erreur (pas de flash) ; affiche un panneau d'erreur/warnings.
- Dans `app.svelte` : remplacer la branche PDF `typstPreviewOn && compiledPdfPath`
  (l.1371-1372) par `<TypstPreview value={source} filePath={activePath} />`, **dans le
  layout split** (éditeur | preview, comme la preview Markdown l.1351) plutôt qu'en solo.
- Supprimer la compilation-PDF-pour-preview : `compiledPdfPath`, l'effect debounce PDF
  (l.1201-1219) et l'écriture du PDF dans `appDataDir` ne servent plus la preview. La
  capability `$APPDATA/**` (`capabilities/default.json`) devient inutile pour la preview
  (la garder seulement si un autre usage la requiert).
- `handleTypstExportPdf` (export PDF sur disque à côté du source) **reste inchangé** — c'est
  la « compilation vers PDF » de l'objectif, déjà fonctionnelle.

### Tests manuels

- Ouvrir un `.typ` → toggle preview → SVG affiché, mis à jour à la frappe.
- Erreur de syntaxe → panneau d'erreur, dernière preview valide conservée.
- Export PDF → fichier `.pdf` correct à côté du source.

## Phase 2 — Robustesse & ergonomie

- **Diagnostics** : panneau erreurs+warnings avec ligne/colonne (les diagnostics Typst
  portent un `span` → ligne/colonne via la `Source`). Surface sous l'éditeur.
- **État de compilation** : spinner « compilation… » non bloquant ; debounce ajustable.
- **Scroll preview** préservé entre deux recompilations.
- ✅ **Packages `@preview` — chemins cross-plateforme (cf. condition essentielle Windows)** :
  fait — résolution via le crate `dirs` (bon dossier sur chaque OS, Windows inclus).
  Indépendant du téléchargement.
- **Packages `@preview` — téléchargement** : `RenderWorld` lit le cache local mais **ne
  télécharge pas**. `#import "@preview/..."` n'aboutit que si déjà en cache. → chantier séparé.
- **Polices** : embarquées + système déjà chargées ; vérifier la cohérence cross-plateforme.

## Phase 3 — Avancé (plus tard)

- **SVG par page** : commande renvoyant `Vec<String>` (un SVG/page) + navigation de pages
  (comme typstudio), au lieu du SVG fusionné.
- **Scroll-sync & click-to-jump** source↔preview via mapping de spans Typst (cf. tinymist :
  `DocToSrcJumpInfo`). Gros morceau.
- **Autocomplétion / hover** : nécessiterait un LSP (tinymist) — hors scope raisonnable
  pour l'instant.
- **Export PDF** : choix du chemin via dialog au lieu de « à côté du fichier ».

---

## Récapitulatif des fichiers

| Phase | Fichiers |
|---|---|
| 0 | suppr. `src/lib/typst-render.ts` ; `preview.css`, `slides.css` (retrait `.typst-rendered*`) ; `ai/integration_typst.md` (obsolète) |
| 1 | `src-tauri/src/typst_engine/mod.rs` (+`typst_preview`), `src-tauri/src/lib.rs` (enregistrement) ; `src/components/typst/TypstPreview.svelte` (+ lazy) ; `src/app.svelte` (branche preview, retrait PDF-preview) |
| 2 | `mod.rs` (diagnostics structurés), `TypstPreview.svelte` (panneau, scroll, états) |
| 3 | `mod.rs` (SVG/page, spans), `TypstPreview.svelte` (navigation, scroll-sync) |

## Principes conservés

- **Compatibilité Windows** : condition essentielle (cf. section dédiée). Public cible
  majoritairement sous Windows.
- **Pas de WASM** : rendu via le crate `typst` natif (cohérent avec le projet).
- **MathJax inchangé** côté Markdown (Prose/Preview/Présentation).
- **Feature flag `typst`** : tout le backend Typst reste sous `#[cfg(feature = "typst")]`.
