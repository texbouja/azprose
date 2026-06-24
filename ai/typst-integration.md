# Intégration Typst dans AZprose

> Rapport d'étude — juin 2026  
> Référence backend analysée : [typesetter](https://codeberg.org/haydn/typesetter) (Rust + GTK4 + `typst_ide`)

---

## 1. Contexte et objectif

Typst est un système de composition typographique moderne (concurrent de LaTeX) qui compile des fichiers `.typ` vers PDF. Ses points forts pour AZprose :

- Compilation incrémentale très rapide (< 50 ms sur fichiers courants)
- API Rust native (`typst`, `typst_ide`) — pas d'appel à un binaire externe
- **Recherche inverse bidirectionnelle** sans SyncTeX : la crate `typst_ide` expose directement la correspondance source ↔ position PDF
- Syntaxe plus accessible que LaTeX tout en étant aussi expressive pour les mathématiques

L'objectif est d'évaluer ce qu'il faudrait ajouter à la base AZprose (Tauri 2 + Svelte 5 + CodeMirror 6 + ProseMark) pour disposer d'un éditeur Typst complet avec prévisualisation PDF synchronisée.

---

## 2. Architecture de référence — typesetter

Le projet typesetter est une application GTK4 mono-processus. Ses trois acteurs principaux communiquent par canaux Tokio dans le même processus Rust :

| Acteur | Rôle | Équivalent AZprose |
|---|---|---|
| `CompilationWorker` | Sérialise et déduplique les requêtes de compilation | Tauri command async |
| `RenderingWorker` | Rastérise les pages à la demande | PDFjs (côté frontend) |
| `IdeWorker` | Recherche inverse, autocomplétion, hover, outline | Tauri commands |

Le cœur est `TypesetterWorld` qui implémente `typst::World` et `typst_ide::IdeWorld`. Il partage via `Arc` les polices, paquets et bibliothèque standard entre les compilations successives, rendant les compilations incrémentielles très efficaces.

---

## 3. API Typst nécessaires

Crates Rust à ajouter à `src-tauri/Cargo.toml` :

```toml
[dependencies]
typst          = "0.13"          # compilateur
typst_ide      = "0.13"          # recherche inverse, autocomplétion
typst_pdf      = "0.13"          # export PDF
typst_kit      = "0.13"          # gestion polices/paquets
comemo         = "0.4"           # memoïsation incrémentale
tokio          = { version = "1", features = ["rt-multi-thread", "sync"] }
```

Fonctions clés utilisées dans typesetter :

```rust
// Compilation
typst::compile::<PagedDocument>(&world)

// Export PDF (bytes envoyés au frontend)
typst_pdf::pdf(&doc, &PdfOptions::default())

// Recherche inverse : prévisualisation → source
typst_ide::jump_from_click(world, doc, &PagedPosition { page, point })
// → Jump::File(file_id, byte_offset)

// Recherche inverse : source → prévisualisation  
typst_ide::jump_from_cursor(doc, &source, cursor_offset)
// → Vec<PagedPosition> { page: usize, point: Point (pt) }

// IDE (bonus)
typst_ide::autocomplete(world, doc_opt, &source, cursor_offset, explicit)
typst_ide::tooltip(world, doc_opt, &source, cursor_offset, Side::Before)
```

---

## 4. Architecture cible dans AZprose

### 4.1 Backend Rust (Tauri)

Un module `src-tauri/src/typst_engine/` calqué sur `typesetter/src/typst_system/` :

```
src-tauri/src/typst_engine/
  mod.rs        — TypstEngine, DocumentArena, partage d'état
  world.rs      — TypesetterWorld implémentant typst::World
  compile.rs    — CompilationWorker, export PDF
  ide.rs        — IdeWorker, jump_from_click/cursor
```

Le `TypstEngine` est ajouté au `AppState` de Tauri et partagé via `Arc<Mutex<TypstEngine>>`.

Commandes Tauri exposées :

```rust
#[tauri::command]
async fn typst_compile(
    source: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<CompileResult, String>

#[tauri::command]
async fn typst_get_pdf(state: State<'_, AppState>) -> Result<Vec<u8>, String>

#[tauri::command]
async fn typst_jump_from_source(
    cursor_offset: usize,
    state: State<'_, AppState>,
) -> Result<Option<PreviewLocation>, String>
// PreviewLocation = { page: usize, x: f64, y: f64 }  (coordonnées en points)

#[tauri::command]
async fn typst_jump_from_preview(
    page: usize, x: f64, y: f64,
    state: State<'_, AppState>,
) -> Result<Option<usize>, String>
// → byte offset dans le source
```

Événements Tauri (push vers le frontend) :

```rust
// Après chaque compilation réussie
app.emit_all("typst:compiled", CompileEvent {
    success: bool,
    diagnostics: Vec<Diagnostic>,
    generation: u64,
})?;
```

### 4.2 Frontend Svelte/TypeScript
 À remplir 

### 4.3 Éditeur Typst — CodeMirror

Le package npm `codemirror-lang-typst` fournit un parser Lezer + coloration syntaxique pour Typst :

```typescript
import { typst } from "codemirror-lang-typst";

// Dans TypstEditor (analogue à Editor.tsx) :
const state = EditorState.create({
  extensions: [
    typst(),                    // grammaire Typst
    lineNumbers(),
    history(), bracketMatching(),
    search({ top: true }),
    EditorView.lineWrapping,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChangeRef.current(u.state.doc.toString());
    }),
    // Mise en évidence de la position courante pour la recherche inverse
    cursorPositionField,        // StateField → position en bytes
  ],
});
```

La compilation est déclenchée **on debounce** (300–500 ms après la dernière modification) via `invoke("typst_compile", { source, path })`.

### 4.4 Prévisualisation PDF — PDFjs

Le viewer PDFjs (déjà prévu en Phase 3 de MANIFEST.md) recharge le PDF après chaque événement `typst:compiled` :

```typescript
// Dans TypstPdfViewer :
useEffect(() => {
  const unlisten = listen<CompileEvent>("typst:compiled", async (event) => {
    if (!event.payload.success) return;
    const pdfBytes = await invoke<number[]>("typst_get_pdf");
    const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
    await pdfViewerRef.current?.loadDocument(URL.createObjectURL(blob));
  });
  return () => { unlisten.then(fn => fn()); };
}, []);
```

**Gestion des clics (prévisualisation → source) :**

```typescript
const handlePdfClick = async (page: number, x: number, y: number) => {
  // x, y en points dans le repère de la page (origine haut-gauche)
  const offset = await invoke<number | null>("typst_jump_from_preview", {
    page, x, y,
  });
  if (offset !== null) {
    editorView.dispatch({
      selection: { anchor: offset },
      scrollIntoView: true,
    });
  }
};
```

**Scroll synchronisé (source → prévisualisation) :**

```typescript
// Listener sur les changements de sélection dans CodeMirror :
EditorView.updateListener.of(async (update) => {
  if (!update.selectionSet) return;
  const offset = update.state.selection.main.head;
  const loc = await invoke<{ page: number; x: number; y: number } | null>(
    "typst_jump_from_source", { cursorOffset: offset }
  );
  if (loc) pdfViewer.scrollToPosition(loc.page, loc.x, loc.y);
}),
```

---

## 5. Recherche inverse — correspondance de coordonnées

`typst_ide::jump_from_cursor` retourne des positions en **points typographiques** (1 pt = 1/72 in) dans le repère Typst (origine haut-gauche de la page).

PDFjs utilise un repère **bas-gauche** (convention PDF). La transformation :

```typescript
// Coordonnées PDFjs → Typst (pour jump_from_preview)
const pdfPage = await pdfDoc.getPage(pageNumber + 1);
const viewport = pdfPage.getViewport({ scale: 1.0 }); // en unités PDF (pt)
// Un clic canvas (clientX, clientY) → coordonnées de page :
const rect = canvasElem.getBoundingClientRect();
const scaleX = viewport.width / rect.width;
const scaleY = viewport.height / rect.height;
const pdfX = (clientX - rect.left) * scaleX;           // pt, depuis gauche
const pdfY = viewport.height - (clientY - rect.top) * scaleY; // pt, depuis bas → Typst veut depuis le haut
const typstY = viewport.height - pdfY;                  // = (clientY - rect.top) * scaleY
// Appel : invoke("typst_jump_from_preview", { page, x: pdfX, y: typstY })

// Coordonnées Typst → PDFjs (pour jump_from_source)
// typst retourne { page, x (pt), y (pt) } depuis haut-gauche
// PDFjs scrollIntoView attend une position dans le viewport courant
```

La crate `typst_ide` prend en compte le zoom via la structure `PagedPosition { page: usize, point: Point }` où `point` est en points absolus — indépendant de l'échelle de rendu.

---

## 6. Migration GTK → AZprose : cartographie des composants

| Composant GTK (typesetter) | Équivalent AZprose |
|---|---|
| `GtkSourceView` (édition) | `TypstEditor` — CodeMirror 6 + `codemirror-lang-typst` |
| `GtkDrawingArea` (rendu pages) | `TypstPdfViewer` — PDFjs dans `<canvas>` |
| `libadwaita` AdwApplicationWindow | Shell AZprose existant (TitleBar + Breadcrumb + StatusBar) |
| `AdwDialog` pour les erreurs | Système de Toast/Notification AZprose existant |
| `GtkTreeView` pour l'outline | Overlay PaletteCommands existant ou panneau dédié |
| Dialogues fichiers GTK | `tauri::dialog::FilePicker` déjà utilisé dans AZprose |
| Thème clair/sombre GTK | `usePersistedState("theme")` d'AZprose |
| Tokio worker threads | Inchangé — Tauri utilise Tokio |
| `mpsc`/`oneshot` Tokio | Inchangé — même design côté Rust |
| `TypstSystem` / `DocumentArena` | `TypstEngine` ajouté à l'`AppState` Tauri |

**Ce qui est déjà présent dans AZprose et utilisable directement :**
- Sidebar avec navigation de fichiers (`.typ` détectable comme texte)
- OpenTabs avec onglets multi-fichiers
- Système de commandes (palette) → raccourcis pour compiler, exporter
- Persistance des préférences (`usePersistedState`)
- Notifications (Toast) pour les erreurs de compilation
- Titre de fenêtre, fil d'Ariane, barre de statut

**Ce qui est spécifique à Typst et à créer :**
- `TypstEditor` (CodeMirror + grammaire Typst)
- `TypstPdfViewer` (PDFjs + gestion des clics, scroll synchronisé)
- `TypstWorkspace` (layout côte à côte éditeur | PDF)
- Module Rust `typst_engine` (world, compilation, IDE)
- Tauri commands + événements Typst
- Autocomplétion Typst dans CodeMirror (via `typst_ide::autocomplete`)

---

## 7. Difficultés et points de vigilance

### 7.1 Taille des dépendances Rust
Les crates `typst` + `typst_ide` + `typst_pdf` + `typst_kit` ajoutent un volume de compilation non négligeable (~5–15 min de build initial, ~30–50 MB de binaire supplémentaire). Envisager une feature flag Cargo (`typst` feature) pour conserver un build AZprose sans Typst.

### 7.2 Gestion des polices
`typst_kit::FontStore` scanne les polices système au démarrage (quelques secondes). Ce scan peut être mis en cache entre les sessions ou limité à un répertoire configurable. typesetter le fait en arrière-plan au démarrage de l'application.

### 7.3 Gestion des packages Typst
`typst_kit` propose `SystemPackages` (cache local `~/.cache/typst/packages`) et `UniversePackages` (téléchargement depuis `packages.typst.app`). Dans AZprose, il faudra contrôler les accès réseau (permission Tauri) et gérer le cas hors-ligne.

### 7.4 Documents multi-fichiers
`typst_ide` et `TypesetterWorld` supposent un fichier principal (`main`). Les includes (`#include "autre.typ"`) sont résolus depuis le système de fichiers réel. Le fichier ouvert dans l'éditeur peut être n'importe quel fichier du projet ; le fichier principal de compilation est distinct (à configurer par l'utilisateur, comme dans typesetter).

### 7.5 Transfert du PDF vers le frontend
`typst_pdf::pdf(...)` retourne `Vec<u8>`. Via Tauri, transférer un PDF de plusieurs Mo via la commande IPC (JSON base64) est coûteux. Alternatives :
- Écrire le PDF dans un fichier temporaire et le servir via le protocole `asset://` de Tauri
- Utiliser `tauri::ipc::Channel` pour un transfert binaire direct (disponible depuis Tauri 2.2)
- Utiliser le protocole personnalisé Tauri (`custom_protocol`) pour exposer le PDF

### 7.6 Fréquence de recompilation
Typst compile en < 100 ms sur la plupart des documents. Un debounce de 300–500 ms sur les changements de l'éditeur est approprié. Pour les gros documents (thèses, livres), envisager un debounce adaptatif (proportionnel au temps de la dernière compilation).

### 7.7 Scroll synchronisé — latence
L'appel `jump_from_source` à chaque déplacement du curseur génère des requêtes Tauri fréquentes. Soit limiter à `selectionSet && !docChanged` (déplacements curseur sans frappe), soit utiliser un debounce séparé (100 ms).

---

## 8. Plan d'implémentation suggéré

| Phase | Contenu | Prérequis |
|---|---|---|
| **5a** — Backend Typst | `typst_engine` Rust, commandes `compile`/`get_pdf`, événement `typst:compiled` | Phase 3 (PDF viewer) |
| **5b** — Éditeur Typst | `TypstEditor` (CodeMirror + grammaire), détection `.typ`, layout basique | Phase 5a |
| **5c** — Viewer PDF Typst | `TypstPdfViewer` (PDFjs), rechargement auto, zoom/navigation | Phase 5a + 5b |
| **5d** — Recherche inverse | `jump_from_source` (curseur → PDF), `jump_from_preview` (clic → curseur) | Phase 5c |
| **5e** — Autocomplétion | `typst_ide::autocomplete` via CodeMirror `autocompletion()` | Phase 5b |
| **5f** — Diagnostics | Affichage des erreurs Typst dans la gouttière CodeMirror + Toast | Phase 5b |

Les phases 5a–5d sont suffisantes pour un workflow de rédaction complet. Les phases 5e–5f améliorent l'expérience mais ne sont pas bloquantes.

---

## 9. Ressources

- `typesetter` — référence backend complète (Rust) : https://codeberg.org/haydn/typesetter
- `codemirror-lang-typst` — grammaire Lezer/CodeMirror 6 pour Typst
- Documentation `typst_ide` : https://docs.rs/typst-ide
- Documentation `typst_pdf` : https://docs.rs/typst-pdf
- `typst_kit` (fonts + packages) : https://docs.rs/typst-kit
- API Tauri `custom_protocol` (transfert binaire) : https://tauri.app/reference/javascript/api/
- AZprose MANIFEST.md — Phase 3 (PDF viewer, base pour le viewer Typst)
