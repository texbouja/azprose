# Architecture Technique — AZprose

> Document à l'intention des agents IA. Toute contribution doit respecter
> l'architecture, les conventions de nommage et les patterns décrits ci-dessous.

---

## 1. Vue d'ensemble

AZprose est un éditeur de notes multi-format (Markdown, LaTeX, CSV, PDF) construit
avec **Tauri 2** (backend Rust) et **Svelte 5** (frontend runes). Le moteur d'édition
est **CodeMirror 6** avec des clients LSP unifiés via `@codemirror/lsp-client`.

**Formats supportés :** `.md`, `.tex`, `.csv`, `.tsv`, `.pdf`, `.html`, images,
et ~30 langages via Coloration Syntaxique CM6.

**Modèle de données central :** un onglet (`Tab`) contient `{ path, source, savedContent }`.
Le contenu du fichier est lu depuis le disque via `readText()` (wrapper générique de
`readTextFile`, pas spécifique au markdown) et manipulé en mémoire. La sauvegarde
écrit via `writeText()`. PDFs et images n'ont pas de `source` — ils sont rendus
directement sans passer par l'éditeur CM6.

Deux panels indépendants (`PanelManager.main` / `PanelManager.side`) gèrent chacun
leur propre liste d'onglets. Le panel principal héberge l'éditeur CM6, le panel
latéral affiche la preview, le PDF, le tableur, ou un second éditeur.

---

## 2. Stack technique

| Couche | Technologie |
|---|---|
| Backend | Rust, Tauri 2, `tauri-plugin-*` |
| Frontend | Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`) |
| Éditeur | CodeMirror 6 (`@codemirror/lsp-client` v6.2.5) |
| LSP | texlab (LaTeX), markdown-oxide (Markdown) |
| Rendu MD | markdown-it + plugins (callouts, footnotes, wikilinks, math) |
| Math | MathJax (tex-svg.js, lazy-loaded) |
| Code | Shiki (lazy-loaded, thèmes Catppuccin) |
| PDF | pdfjs-dist (`PDFViewer`, `PDFLinkService`) |
| Tableur | jspreadsheet CE v5.0.4 + jsuites + @jspreadsheet/formula |
| i18n | i18next (en, fr, de, es) |
| Build | Vite, `tauri build` |

---

## 3. Backend Rust (`src-tauri/src/`)

### Modules

| Fichier | Rôle |
|---|---|
| `lib.rs` | Point d'entrée Tauri, registration des commandes, gestion des projets/thèmes |
| `lsp_bridge.rs` | Spawn de processus LSP, Content-Length framing, stdin/stdout |
| `latex_engine/mod.rs` | Compilation LaTeX (latexmk), détection root, résolution dirs, texmf |
| `latex_engine/synctex.rs` | CLI wrapper synctex (forward + inverse search) |
| `terminal.rs` | PTY embarqué (tauri-plugin-shell) |
| `mdprinter.rs` | Export Markdown → PDF (headless Chromium) |

### Commandes Tauri exposées au frontend

```
lsp_spawn, lsp_write, lsp_kill
latex_build, latex_find_root, check_latexmk, latex_resolve_dirs
synctex_forward, synctex_inverse, latex_init_texmf, latex_rehash_texmf
terminal_spawn, terminal_write, terminal_resize, terminal_kill
read_project_config, write_project_config
read_project_session, write_project_session
get_projects_list, add_project, remove_project
list_project_themes, install_project_theme, remove_project_theme
open_folder, reveal_in_file_manager
export_markdown_pdf
```

### Communication Frontend ↔ Backend

- **IPC synchrone** : `invoke("command_name", { args })` depuis TS
- **Événements** : `emit("event_name", payload)` depuis Rust, `listen("event_name", handler)` depuis TS
- **LSP** : Rust spawn le processus, lit stdout avec Content-Length framing, émet chaque message complet via `lsp://output`. Le frontend envoie via `invoke("lsp_write", { id, content })`

---

## 4. Frontend — Structure des fichiers

```
src/
├── app.svelte              # Shell principal — orchestre tout
├── app.css                 # Imports CSS + layout grid
├── main.ts                 # Point d'entrée Svelte
├── components/
│   ├── chrome/             # Titlebar, Breadcrumb, StatusBar
│   ├── console/            # ConsolePanel, Terminal
│   ├── csv/                # CsvSpreadsheet, CsvPreview (lazy wrappers)
│   ├── editor/             # Editor.svelte (CM6), TabsBar
│   ├── files/              # Sidebar (explorateur, favoris, projets)
│   ├── image/              # ImageViewer
│   ├── markdown/           # MarkdownPreview, ProseMarkEditor, SlideDeck
│   ├── overlays/           # SettingsOverlay, HelpOverlay, AboutOverlay, WelcomeOverlay
│   ├── panels/             # PanelLayout, PanelContainer, ContentRenderer, TabActions
│   ├── pdf/                # PdfViewer
│   ├── preview/            # HtmlPreview
│   ├── primitives/         # Button, Icon, Input, etc.
│   └── tex/                # (vide — LaTeX build géré depuis app.svelte)
├── lib/                    # Logique métier pure (pas de Svelte)
│   ├── lsp/                # transport.ts, texlab.ts, markdown-oxide.ts
│   ├── handlers/           # FileHandler system (latex, markdown, csv)
│   ├── commands.ts         # Command palette definitions
│   ├── panel-manager.ts    # PanelManager class
│   ├── panel-store.ts      # PanelState class
│   └── ...                 # 50+ modules utilitaires
├── stores/                 # 21 stores Svelte 5 runes (.svelte.ts)
├── csv/                    # spreadsheet.ts, cache.ts, flush.ts
├── latex/                  # latex-build.ts (orchestration frontend)
├── markdown/               # render.ts, wikilinks.ts, transclusion.ts, post-render.ts
├── pdf/                    # rect-select.ts, rect-render.ts, annotation-store.ts
├── locales/                # en.json, fr.json, de.json, es.json
├── styles/                 # CSS modulaire (chrome/, editor/, overlays/, etc.)
└── types/                  # Types partagés
```

---

## 5. Layout et composants Chrome

### Grille CSS (`app.css`)

```
.mdv-app
├── .mdv-titlebar      (grid-row: 1)  — barre de titre Tauri
├── .mdv-breadcrumb    (grid-row: 2)  — barre d'outils secondaire
├── .mdv-shell         (grid-row: 3)  — contenu principal (flex)
│   ├── Sidebar        (flex: 0 0 auto, largeur resizable)
│   └── .mdv-workspace (flex: 1)
│       ├── .mdv-workspace__content
│       │   └── PanelLayout (split main/side)
│       │       ├── PanelContainer (main)
│       │       ├── SplitHandle (draggable)
│       │       └── PanelContainer (side)
│       └── ConsolePanel (bas, hauteur resizable)
└── .mdv-statusbar     (grid-row: 4)  — barre de statut
```

Quand le titlebar est masqué : `grid-template-rows: 0 var(--breadcrumb-h) 1fr var(--statusbar-h)`.

### Composants Chrome

#### Titlebar (`components/chrome/Titlebar.svelte`)
- Barre de titre native Tauri, draggable
- Contrôle la visibilité (toggle via Breadcrumb)
- Thème, transparence, langue, écriture

#### Breadcrumb (`components/chrome/Breadcrumb.svelte`)
- Barre d'outils sous le titlebar
- Gauche : toggle sidebar, chemin du fichier actif, indicateur sauvegarde
- Centre : boutons de mode (raw/prose/preview/presentation), contrôles LaTeX
- Droite : boutons Vim, typographie, console, panneau latéral, plein écran, paramètres
- **Props principales :** `sidebarOpen`, `activePath`, `saveStatus`, `consoleOpen`, `viewPanelOpen`, `vimOn`, `typography`

#### StatusBar (`components/chrome/StatusBar.svelte`)
- Bas de fenêtre : nom du fichier, nombre de mots, minutes de lecture
- Bouton d'aide

---

## 6. Système de panels

### PanelManager (`lib/panel-manager.ts`)

Classe centrale qui gère les deux panels (main et side).

```typescript
class PanelManager {
  main: PanelState    // éditeur principal
  side: PanelState    // panneau latéral (preview, PDF, etc.)
  layout: "main" | "main+side"
  splitRatio: number  // 0.45 par défaut (45% main / 55% side)
}
```

**Méthodes clés :**
- `openInMain(path, opts?)` — ouvre un fichier dans le panel principal
- `openInSide(path, opts?)` — ouvre dans le side panel (le rend visible)
- `toggleExpandPanel("main"|"side")` — agrandit un panel à 100%, restore au double-clic
- `findTabByPath(path)` — cherche un onglet dans les deux panels
- `toJSON()` / `fromJSON()` — sérialisation pour restauration de session

### PanelState (`lib/panel-store.ts`)

État d'un panel individuel (main ou side).

```typescript
class PanelState {
  id: string                    // "main" | "side"
  visible: boolean
  tabs: Tab[]                   // onglets ouverts
  activeTabId: string | null    // onglet actif
}
```

**Type Tab :**
```typescript
type Tab = {
  id: string
  title: string
  path: string
  source: string          // contenu en mémoire
  savedContent: string    // contenu sur disque (pour dirty check)
  preview?: boolean       // onglet preview (réutilisable)
  renderMode?: "raw" | "prose" | "preview" | "presentation"
  sourceType?: "latex"   // origine du PDF affiché
}
```

### PanelLayout (`components/panels/PanelLayout.svelte`)

Composant de layout split horizontal :
- Deux `PanelContainer` côte à côte
- Handle de redimensionnement drag (`col-resize`, clamped 20%-80%)
- Le ratio est géré via `flex` CSS (`style="flex: {splitRatio}"`)

### PanelContainer (`components/panels/PanelContainer.svelte`)

Conteneur d'un panel avec :
- Barre d'onglets (`TabsBar`) avec drag-and-drop
- Zone de contenu (`ContentRenderer`)
- Scroll infini pour les onglets

### ContentRenderer (`components/panels/ContentRenderer.svelte`)

**Routeur central** — décide quoi renderer selon le type de fichier et le panel :

| Priorité | Condition | Composant |
|---|---|---|
| 1 | `.pdf` | `LazyPdfViewer` |
| 2 | Image | `ImageViewer` |
| 3 | `.md` side + presentation | `LazySlideDeck` |
| 4 | `.md` side | `LazyMarkdownPreview` |
| 5 | `.md` main + prosemark | `LazyProseMark` |
| 6 | `.html` side | `LazyHtmlPreview` |
| 7 | `.csv`/`.tsv` side | `LazyCsvSpreadsheet` |
| 8 | Autre | `Editor` (CM6) |

**Assignation LSP :**
- `.tex` → `getTexlabClient()`
- `.md` → `getMarkdownOxideClient()`
- Autre → `null`

### TabActions (`components/panels/TabActions.svelte`)

Barre d'actions contextuelles au-dessus de chaque panel. Affiche des boutons selon le type de fichier actif :
- **Markdown** : raw/prose/preview/presentation, export PDF
- **LaTeX** : build, viewer PDF
- **CSV** : (pas d'actions spéciales)
- Bouton plein écran pour le side panel

---

## 7. Console

### ConsolePanel (`components/console/ConsolePanel.svelte`)

Panel en bas de la zone de travail, hauteur resizable (80-600px).

**Trois onglets :**
1. **Diagnostics** — erreurs/warnings de texlab, markdown-oxide, LaTeX build
2. **Terminal** — PTY embarqué (spawn/write/resize/kill via Tauri)
3. **Log** — logs des serveurs LSP

**Props :** `diagnostics`, `height`, `activeTab`, `terminalCwd`, `logLines`, `hidden`

Le terminal est monté paresseusement (lazy) et reste vivant entre les changements d'onglets.

---

## 8. Modales (Overlays)

Toutes les overlays sont gérées par le store `overlays` (`stores/overlays.svelte.ts`).

### SettingsOverlay (`components/overlays/SettingsOverlay.svelte`)
- Panneau latéral droit avec sections repliables
- **Sections :** Editor, Markdown (general, prose, preview, presentation, callouts, mathjax), CSV, LaTeX (general, build)
- Chaque module a ses `$state()` runes liées aux stores持久化
- Reset par module

### HelpOverlay
- Raccourcis clavier, fonctionnalités, tutoriel

### AboutOverlay
- Version, licence, liens, vérification des mises à jour

### WelcomeOverlay
- Modal d'accueil au premier lancement

### CommandPalette
- Recherche floue parmi toutes les commandes
- Catégories : recent, file, latex, markdown, view, theme, help

---

## 9. State Management

### Pattern : stores runes Svelte 5

Tous les stores sont dans `src/stores/*.svelte.ts` et utilisent les runes Svelte 5.

**Store persistant (`persisted.svelte.ts`) :**
```typescript
// Crée un state $state<T> synchronisé avec localStorage
const sidebarOpen = persistedState(STORAGE_KEYS.sidebarOpen, true);
// sidebarOpen.current — lit/écrit la valeur
// sidebarOpen.current = false — persiste automatiquement
```

### Stores principaux

| Store | Fichier | Rôle |
|---|---|---|
| `sidebarOpen/Width` | app.svelte (inline) | État sidebar |
| `overlays` | overlays.svelte.ts | Toggle des modales (settings, help, about, palette, welcome) |
| `notifications` | notifications.svelte.ts | Toasts d'erreur/info |
| `diagnosticsStore` | diagnostics.svelte.ts | Bus de diagnostics (latex, markdown) |
| `editorSettings` | editor-settings.svelte.ts | Police, taille, tab, line numbers |
| `proseMarkSettings` | markdown-settings.svelte.ts | Style prose (police, taille, espacement) |
| `previewSettings` | markdown-settings.svelte.ts | Style preview |
| `csvSettings` | markdown-settings.svelte.ts | Style CSV |
| `latexSettings` | latex-settings.svelte.ts | Bibtex mode, shell-escape, max repeat |
| `generalSettings` | general-settings.svelte.ts | Transparence, langue par défaut |
| `calloutSettings` | callout-settings.svelte.ts | Définitions de callouts |
| `mathJaxPreamble` | mathjax-preamble.svelte.ts | preamble LaTeX pour MathJax |
| `slideSettings` | slide-settings.svelte.ts | Mode slide (16:9, 4:3) |
| `rootPath` | root-path.svelte.ts | Chemin racine du vault |
| `syncLine` | sync-line.svelte.ts | Ligne de sync cursor→preview |
| `navHistory` | nav-history.svelte.ts | Historique navigation |
| `shortcuts` | shortcuts.svelte.ts | Raccourcis clavier custom |

### Clés de stockement (`lib/storage.ts`)

Toutes les clés localStorage sont centralisées dans `STORAGE_KEYS`. Format : `mdview.<category>.<name>`.

---

## 10. Système LSP

### Transport (`lib/lsp/transport.ts`)

`createTauriTransport(id, command, args, env?)` crée un transport qui bridge le processus LSP Rust ↔ CM6.

**Flux :**
1. Premier `send()` → spawn le processus via `invoke("lsp_spawn")`
2. Rust lit stdout, parse Content-Length, émet chaque message JSON-RPC via `lsp://output`
3. `routeMessage(raw)` routage :
   - **Filter** (`setFilter`) — peut consommer le message avant CM6
   - **Server requests** (method + id, sans result) → `onServerRequest` handler
   - **Initialized notification** → callbacks `onInitialized`
   - **Tout le reste** → handlers CM6 (diagnostics, completions, etc.)

**Extensions API :**
- `setFilter(fn)` — filtre entrant (consomme avant CM6)
- `setOutFilter(fn)` — filtre sortant (supprime messages sortants)
- `onServerRequest(fn)` — intercepte les requêtes serveur (registerCapability, showDocument, etc.)
- `sendRequest(method, params, timeout?)` — requête JSON-RPC avec timeout
- `rawSend(message)` — envoi brut sans filtre

### texlab (`lib/lsp/texlab.ts`)

Singleton `getTexlabClient()`. Crée le transport avec `TEXMFHOME` pointant vers `.azprose/texmf`.
Wire `publishDiagnostics` → `diagnosticsStore("latex")`, `$/logMessage` → `logStore("latex")`.

### markdown-oxide (`lib/lsp/markdown-oxide.ts`)

Singleton `getMarkdownOxideClient()`. Auto-crée `.moxide.toml` si absent.
Gère `client/registerCapability`, `window/showDocument`, `client/applyEdit` via `onServerRequest`.
Extensions : `serverCompletion()` (obligatoire pour les complétions LSP), `serverDiagnostics()`.

---

## 11. Système de handlers (`lib/handlers/`)

Pattern **lazy-loading** par extension de fichier.

```typescript
// types.ts
interface HandlerContext {
  activePath: () => string | null
  source: () => string
  pm: PanelManager
  ls: LatexState
  handleSave: () => Promise<void>
  // ... 20+ méthodes/getters
}

interface FileHandler {
  setupEffects: () => void   // active les $effect réactifs
  cleanup?: () => void        // désactive les effets
}
```

**Factories :**
- `tex` → `createLatexHandler` (compilation, viewer, forward sync)
- `md` → `createMarkdownHandler` (transclusion, navigation, export PDF)
- `csv`/`tsv` → `createCsvHandler` (pas d'effets spéciaux)

Le `HandlerContext` est construit dans `app.svelte` et fournit l'accès à tout l'état applicatif. Les handlers ne doivent **jamais** importer de stores directement — ils passent par `ctx`.

---

## 12. Commandes (`lib/commands.ts`)

```typescript
type Command = {
  id: string
  label: string          // clé i18n ou texte brut
  hint?: string
  shortcut?: string
  icon?: IconData        // string SVG inline
  category?: CommandCategory  // "recent"|"file"|"latex"|"markdown"|"view"|"theme"|"help"
  keywords?: string[]
  action: () => void | Promise<void>
}
```

**`buildCommands(actions)`** construit la liste complète. Les commandes sont injectées dans la `CommandPalette`.

**Convention :** les commandes spécifiques à un format (LaTeX build, markdown export, etc.) sont définies dans `buildCommands` et déclenchent des appels dynamiques (`import("@/latex")`).

---

## 13. Sous-systèmes domain-specific

### Markdown

**Rendu (`markdown/render.ts`) :**
Pipeline markdown-it avec plugins (ordre) : taskLists → mark → mathPlugin → wikilinkPlugin → callouts → footnote → source_lines → heading anchors → Shiki.

**Pré-rendu :** transclusion (`![[file]]`) résolue async via Tauri `readFile`.
**Post-rendu :** images locales → data: URIs, PDF rect embeds → PNG, wikilinks → paths complets.

**ProseMark (`ProseMarkEditor.svelte`) :** Éditeur WYSIWYG basé sur `@prosemark/core` avec extensions CM6.

**SlideDeck (`SlideDeck.svelte`) :** Découpe sur `\n---\n`, rend chaque slide. Navigation clavier.

### LaTeX

**Frontend (`latex/latex-build.ts`) :** Orchestration : invoke `latex_build` → écoute `latex://log` + `latex://build-complete` → met à jour `LatexState`.

**Backend (`latex_engine/mod.rs`) :** Spawn `latexmk` avec args configurables. Parse `.log` pour diagnostics structurés. Parse `.fls` pour dependency tracking.

**Synctex :** CLI wrapper (`synctex forward` / `synctex inverse`). Forward: Ctrl+click dans éditeur → page PDF. Inverse: Ctrl+click dans PDF → ligne source.

### CSV

**Frontend (`csv/spreadsheet.ts`) :** Init jspreadsheet CE, détection delimiter, cache drift detection, context menu (hide/show), toolbar.

**Cache (`csv/cache.ts`) :** v3 — data, styles, columnWidths, hiddenColumns, hiddenRows. Hash djb2 pour drift detection. `.azprose/csv-cache/<name>.<hash>.json`.

**Flush (`csv/flush.ts`) :** Registre global pour flush les writes IPC avant `window.destroy()`.

### PDF

**PdfViewer (`components/pdf/PdfViewer.svelte`) :** pdfjs-dist avec PDFViewer, PDFLinkService, PDFFindController. Toolbar hover-reveal, panneau TOC/attachments, navigation history.

**Rect selection (`pdf/rect-select.ts`) :** Alt+drag → overlay CSS → conversion coordonnées PDF → copie wikilink `[[file#page=N&rect=x,y,w,h]]` dans le clipboard.

**Rect render (`pdf/rect-render.ts`) :** Rend PDF→canvas→crop→PNG à 2.0×. Cache disque dans `.azprose/pdf/rectangle/`.

**Annotations (`pdf/annotation-store.ts`) :** CRUD JSON, types : rect, highlight, text-note, ink, stamp. Original PDF jamais modifié.

---

## 14. i18n

**Système :** i18next, 4 langues (en, fr, de, es).

**Convention de clés :** `<category>.<subcategory>.<name>` en minuscules.
Exemples :
- `settings.section.latex` — titre de section
- `command.latexBuildHint` — indice de commande
- `breadcrumb.toggleViewPanel` — tooltip breadcrumb
- `pdf.selectRegion` — action PDF

**Store :** `language` store Svelte 5, persisté dans localStorage.

**Usage dans les composants :**
```typescript
let t = $derived(getT($language));
// puis {t("settings.latexBuild")}
```

---

## 15. Styles et Thème

### Organisation CSS

```
src/styles/
├── globals.css           # Reset, variables CSS de base
├── tokens.css            # Tokens de couleur (light/dark via prefers-color-scheme)
├── tokens.base.css       # Variables CSS communes
├── chrome/               # titlebar.css, breadcrumb.css, statusbar.css
├── editor/               # tabs.css, search.css
├── files/                # sidebar.css
├── overlays/             # overlay.css, palette.css, settings.css, help.css, about.css, welcome.css
├── markdown/             # prose.css, preview.css
├── pdf/                  # pdf.css
├── shared/               # menu.css, kbd.css, toast.css, transparency.css
└── themes.json           # Catalogue de thèmes
```

### Convention CSS

- Classes BEM-style préfixées `mdv-` (ex: `mdv-settings__input`)
- Variables CSS pour les couleurs : `var(--bg)`, `var(--fg)`, `var(--surface)`, `var(--border)`, `var(--muted)`
- Variables CSS pour la typographie : `var(--font-ui)`, `var(--font-mono)`
- Transitions : `var(--dur-base) var(--easing)` sur background-color, color, border-color

### Thèmes

- 4 palettes : Neutral, Catppuccin, Skarline, Crafted
- Custom themes : fichiers CSS dans `<project>/.azprose/themes/<name>.css`
- La transparence est supportée (macOS vibrancy, CSS backdrop-filter)

---

## 16. Conventions pour agents IA

### Règles strictes

1. **Svelte 5 runes uniquement** — `$state`, `$derived`, `$effect`, `$props`, `$bindable`. Pas de stores Svelte 4 (`writable`, `readable`) sauf pour `i18n.ts` (legacy).
2. **Pas de comments** sauf demande explicite.
3. **Pas de `console.log`** dans le code productif.
4. **Lazy loading** pour les composants lourds : créer un `Lazy*.svelte` wrapper avec `dynamic import()`.
5. **Stores** : utiliser `persistedState()` pour les settings persistants. Les stores runes sont dans `src/stores/*.svelte.ts`.
6. **Handlers** : toute logique liée à un type de fichier va dans `src/lib/handlers/<ext>.ts`. Le handler reçoit `HandlerContext` et ne doit pas importer de stores.
7. **i18n** : toute chaîne visible par l'utilisateur doit passer par `t("key")`. Ajouter la clé dans les 4 fichiers locale.
8. **LSP** : les clients LSP sont des singletons (`getTexlabClient()`, `getMarkdownOxideClient()`). Ne jamais créer de second instance.
9. **Tauri IPC** : utiliser `invoke()` pour les commandes backend. Les événements Rust→JS utilisent `listen()`.
10. **CSS** : préfixer `mdv-`, utiliser les variables CSS existantes, pas de hardcoded colors.

### Patterns de code

**Ajouter un nouveau composant lourd :**
1. Créer `src/components/<dir>/Component.svelte`
2. Créer `src/components/<dir>/LazyComponent.svelte` (dynamic import)
3. L'importer dans le parent via `LazyComponent`

**Ajouter un nouveau store :**
1. Créer `src/stores/<name>.svelte.ts`
2. Utiliser `$state()` runes, exporter un objet avec `.current` getter/setter
3. Si persistant : `persistedState(STORAGE_KEYS.xxx, defaultValue)`

**Ajouter une nouvelle commande :**
1. Ajouter dans `buildCommands()` dans `lib/commands.ts`
2. Ajouter les clés i18n `command.<id>` et `command.<id>Hint` dans les 4 locales
3. Si la commande est contextuelle (selon le fichier actif), ajouter le conditionnement dans `app.svelte`

**Ajouter un nouveau format :**
1. Étendre `isSupportedExt()` dans `src-tauri/src/lib.rs`
2. Ajouter le mapping dans `languageFromExt()` dans `lib/editor-languages.ts`
3. Ajouter le handler dans `lib/handlers/` + `FACTORIES` dans `lib/handlers/index.ts`
4. Ajouter le routing dans `ContentRenderer.svelte`
5. Ajouter les clés i18n

### Architecture de l'état applicatif

```
app.svelte (orchestrator)
├── pm: PanelManager          → gère main + side panels
│   ├── pm.main: PanelState   → tabs, activeTab, source, save
│   └── pm.side: PanelState   → idem
├── ls: LatexState            → état compilation LaTeX
├── overlays                  → toggle des modales
├── notifications             → toasts
├── diagnosticsStore          → bus de diagnostics
├── consoleOpen/Tab/Height    → état console
├── sidebarOpen/Width         → état sidebar
├── typo: TypographySettings  → paramètres typographie
└── handlers                  → FileHandler par extension
    ├── latex handler         → build, viewer, sync
    ├── markdown handler      → transclusion, navigation, export
    └── csv handler           → (pas d'effets)
```

L'état est **unidirectionnel** : `app.svelte` est la source de vérité. Les composants enfants reçoivent des props et émettent des callbacks. Les stores partagés (diagnostics, notifications) sont accessibles partout.

---

## 17. Fichiers importants pour démarrer

| Objectif | Fichier(s) |
|---|---|
| Comprendre le layout | `app.css`, `app.svelte` (template) |
| Ajouter un composant panel | `PanelLayout.svelte`, `ContentRenderer.svelte` |
| Ajouter une commande | `lib/commands.ts`, `app.svelte` (buildCommands) |
| Modifier le rendu Markdown | `markdown/render.ts`, `markdown/wikilinks.ts` |
| Modifier le comportement éditeur | `components/editor/Editor.svelte`, `lib/editor-languages.ts` |
| Ajouter un store | `stores/` (un fichier par store) |
| Modifier la sidebar | `components/files/Sidebar.svelte` |
| Modifier les settings | `components/overlays/SettingsOverlay.svelte`, `stores/*-settings.svelte.ts` |
| Ajouter une commande Tauri | `src-tauri/src/lib.rs` (invoke_handler) |
| Modifier le LSP | `lib/lsp/transport.ts`, `lib/lsp/texlab.ts`, `lib/lsp/markdown-oxide.ts` |
