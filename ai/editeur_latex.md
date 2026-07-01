# Éditeur LaTeX — Analyse technique et plan d'action

Source principale : `ai/integration_latex.md`. Comportement calqué sur le mode Typst déjà implémenté.

## Architecture cible

| Couche | Typst (existant) | LaTeX (à faire) |
|--------|-----------------|-----------------|
| Détection fichier | `extFromPath() === "typ"` | `=== "tex"` (ou set `tex/sty/cls/ltx/bib`) |
| Syntaxe éditeur | Custom `StreamParser` | ✅ déjà fait : `stex` de CodeMirror |
| Backend Rust | `typst_engine/mod.rs` (compile natif) | Nouveau `latex_engine/mod.rs` → `std::process::Command` sur `latexmk` |
| Commande Tauri | `invoke("typst_export_pdf")` | `invoke("latex_build", { path, engine })` |
| PDF viewer | `LazyPdfViewer` (full) + `PdfViewer` (split) | ✅ `LazyPdfViewer` dans les deux modes (full + split) ; l'ancien `PdfViewer` (canvas) est retiré |
| Diagnostics | `diagnosticsStore.set("typst", …)` | `diagnosticsStore.set("latex", …)` — interface déjà compatible |
| Breadcrumb | 3 boutons : code / viewer / build | 3 boutons : éditeur / preview / build |
| i18n | 4 locales (`en/fr/de/es`) | mêmes 4 locales + nouvelles clés |

## État des lieux — déjà prêt

- **Syntaxe CodeMirror** : `.tex` → `stex` via `@codemirror/legacy-modes/mode/stex` dans `src/lib/editor-languages.ts:120-125`
- **Fichiers ouvrables** : `.tex/.sty/.cls/.ltx/.bib` dans `TEXT_EXTENSIONS` (`src/lib/files.ts:45`) et `is_supported_ext` Rust (`src-tauri/src/lib.rs:53`)
- **Diagnostics multi-moteur** : champ `source: "typst" | "latex"` déjà prévu dans l'interface `Diagnostic` (`src/lib/diagnostics.ts:17`)

## Spécificités LaTeX vs Typst

- **Compilation externe** : Typst utilise une lib Rust embarquée (`typst::compile`) ; LaTeX nécessite un binaire externe (`latexmk`/`pdflatex`) lancé via `std::process::Command`
- **Pas de live preview** : contrairement à Typst (rendu SVG temps réel), LaTeX produit un PDF. Pas d'équivalent à `TypstPreview.svelte`. La compilation est déclenchée manuellement par l'utilisateur (bouton build).
- **Split view** : éditeur à gauche + PdfViewer (lecteur PDF statique, déjà existant) à droite. Le PdfViewer surveille le fichier PDF et se rafraîchit après compilation, sans reflow intempestif.
- **Synctex** : nécessite parsing du `.synctex.gz` + mapping coordonnées PDF ↔ ligne source ; complexité élevée
- **Propre du projet** : moteur persistant par fichier (latexmk -pdf / -xelatex / -lualatex) ; sélecteur accessible par clic long sur le bouton build

## Plan d'action

### Phase 1 — Pipeline compilation Rust ✅
- [x] **1a** — `src-tauri/src/latex_engine/mod.rs` créé :
  - `latex_build(path, engine)` → `LatexBuildResult { pdf_path, diagnostics[] }`
  - Lance `latexmk` dans le répertoire du `.tex` avec `-interaction=nonstopmode -halt-on-error`
  - Parse stdout/stderr : erreurs `! …`, warnings `LaTeX Warning:`, `Package … Warning:`
  - Retourne le chemin du PDF si succès + diagnostics
- [x] **~1b~** *Feature gate supprimé* : pas de feature Cargo — latexmk détecté à l'exécution
- [x] **1c** — Commande enregistrée dans `lib.rs`
- [x] **1d** — `check_latexmk()` → `bool`, détecte si `latexmk -v` réussit (disponible côté frontend)

### Phase 2 — Pont app.svelte + PdfViewer split ✅
- [x] **2a** — `handleLatexBuild()` : appelle `invoke("latex_build", { path, engine })`, alimente `diagnosticsStore.set("latex", …)`, ouvre la console sur erreur
- [x] **2b** — `handleLatexViewer()` : save + build + `LazyPdfViewer` plein écran (`latexViewerOn`)
- [x] **2c** — `handleLatexSplit()` : save + build + split éditeur/`LazyPdfViewer` (`latexSplitOn`), réutilise le viewer PDF complet (coordonnées Synctex compatibles)
- [x] **2d** — États réactifs : `latexBuilding`, `latexViewerOn`, `latexSplitOn`, `latexEngine`, `viewerPdfPath` (partagé)
- [x] **2e** — Nettoyage : reset des états + `diagnosticsStore.clear("latex")` au changement de fichier non-`.tex`
- [x] Shell split LaTeX : grille éditeur / PdfViewer réutilisant le redimensionnement existant (`mdv-split`)`

### Phase 3 — Breadcrumb + UI ✅
- [x] **3a** — Breadcrumb : bloc `{#if activePath?.endsWith(".tex")}` avec 3 boutons :
  - **Éditeur** (Code2) → `onLatexCodeView`, ferme viewer/split
  - **Preview** (FileText) → `onToggleLatexViewer`, compile + PDF plein écran
  - **Build** (FileDown) → `onLatexBuild`, compile + diagnostics ; clic long (500ms) → popover choix moteur (pdfLaTeX/XeLaTeX/LuaLaTeX), persisté dans `latexEngine`
- [x] **3b** — Tab handle (`TabsBar.svelte`) : icone eye déclenche `handleLatexSplit`, bouton build accolé déclenche `handleLatexBuild` ; CSS `.mdv-tab__build`
- [x] **3c** — Persistance du moteur : variable `latexEngine` dans `app.svelte` (state), prête à être persistée par fichier via `project-config.ts`
- [x] **3d** — Split CSS réutilisé (`mdv-split`, `mdv-split__resize` existants)
- [x] **3e** — Nouvelles clés i18n : `breadcrumb.latexCodeView`, `breadcrumb.latexViewer`, `breadcrumb.latexBuild`, `breadcrumb.engine` — ajoutées aux 4 locales

### Réorganisation
- [x] **R1** — `src/components/tex/` créé, reçoit l'ancien `editor/PdfViewer.svelte` (archivé en attendant suppression définitive)
- [x] **R2** — Split LaTeX : `PdfViewer` (editor/) remplacé par `LazyPdfViewer` (pdf/) avec `split={true}` ; le viewer full est le même qu'en plein écran, garantissant compatibilité Synctex future

### Phase 4 — Synctex
- [ ] **4a** — Parser `.synctex.gz` en Rust (ou JS) → mapping `(page, x, y) ↔ (file, line_num)`
- [ ] **4b** — Source→PDF : clic gutter éditeur → scroll PDF à la page correspondante
- [ ] **4c** — PDF→Source : clic dans PdfViewer → scroll éditeur à la ligne
- [ ] **4d** — Activer `-synctex=1` dans la commande latexmk
