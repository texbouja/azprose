# Architecture globale — AZprose (Obsolète)

## Stack technique

| Couche | Technologie | Rôle |
|---|---|---|
| Backend natif | Tauri 2 (Rust) | Fenêtres, système de fichiers, IPC, plugins |
| Frontend | Svelte 5 + TypeScript | UI réactive, logique applicative |
| Bundler | Vite 7 / Bun | Build, lazy-splitting, dev server |
| Éditeur bas-niveau | CodeMirror 6 | Base de tous les modes d'édition |
| Éditeur WYSIWYM | ProseMark | Rendu Markdown en direct dans CM6 |
| Rendu mathématique | MathJax 4 (static-import) | Formules LaTeX dans ProseMark |
| Rendu PDF | PDF.js (pdfjs-dist) | Visualisation de fichiers PDF |

---

## Processus Rust (backend Tauri)

Le processus Rust gère exclusivement les interactions système. Il n'a pas de logique applicative.

**Fenêtres** — une fenêtre principale au démarrage. Chaque "Ouvrir un projet dans une nouvelle fenêtre" crée une `WebviewWindow` supplémentaire avec un label `azprose-project-{uuid}`. Chaque fenêtre est une instance indépendante complète de l'application frontend.

**Commande invoquée par le frontend** :
- `take_pending_open_files` — récupère les chemins de fichiers passés en argument CLI ou via "Ouvrir avec" avant que l'app soit prête à les recevoir.

**Événements émis vers le frontend** :
- `azprose:open-file` — fichier à ouvrir (association OS, glisser-déposer depuis Finder/Explorer)
- `tauri://drag-enter` / `drag-drop` / `drag-leave` — glisser-déposer de fichiers dans la fenêtre

**Plugin updater** — vérifie les mises à jour sur `github.com/azprose/azprose/releases`, signature minisign. La vérification se déclenche 1,5 s après le démarrage pour ne pas bloquer le rendu initial. L'installation est gérée par le frontend (`applyUpdate()`).

**Associations de fichiers** déclarées dans `tauri.conf.json` : `.md` / `.txt` / code source / `.tex` / images / `.pdf` — rôle `Alternate` (l'OS propose AZprose sans en faire l'éditeur par défaut).

---

## Shell de l'application (`src/app.svelte`)

Point d'entrée unique du frontend. Tous les composants majeurs sont montés ici.

### Layout

Grille CSS à 4 lignes :

```
TitleBar      (--titlebar-h  : 48px, masquable)
Breadcrumb    (--breadcrumb-h: 30px)
Workspace     (flex: 1)
StatusBar     (--statusbar-h : 28px)
```

Le workspace est lui-même un flex row : `Sidebar` (largeur persistée) + colonne principale (`TabsBar` + zone de contenu).

### Gestion des onglets

`tabs: Tab[]` + `activeTabId` stockés en mémoire (non persistés entre sessions). Chaque `Tab` porte `{ id, title, path, source, savedContent }`. Le contenu est lu depuis le disque à l'ouverture via `readMarkdown()` (API Tauri fs).

### Routage de rendu

La zone de contenu affiche un composant différent selon l'extension du fichier actif et les modes activés :

| Condition | Composant |
|---|---|
| `.pdf` | `LazyPdfViewer` |
| image (png/jpg/gif/webp/svg/ico) | `ImageViewer` |
| `.md` + prose + présentation | `SlideDeck` |
| `.md` + prose | `LazyProseMark` |
| tout texte en mode raw | `Editor` (CodeMirror brut) |
| aucun onglet actif | écran vide `.mdv-empty-state` |

### Persistance

Tous les états de longue durée passent par `persistedState(key, default)` — un wrapper sur `localStorage` qui expose un état Svelte 5 réactif. Clés principales : thème, transparence, dossiers ouverts, largeur sidebar, polices d'écriture, style prose, config MathJax.

### Sauvegarde

Déclenchée par `Cmd/Ctrl+S`. L'état `saveStatus` (`idle` / `dirty` / `saving` / `saved`) est affiché dans la StatusBar. La comparaison `source !== savedContent` détecte les modifications non sauvegardées.

---

## Modes d'édition

### Mode raw — `Editor.svelte`

CodeMirror 6 direct. Coloration syntaxique auto-détectée par extension (`@codemirror/language-data`). Mode vim optionnel (activé via StatusBar ou palette). Mode lecture (`readingMode`) désactive l'édition sans changer de vue.

### Mode WYSIWYM — `ProseMarkEditor.svelte`

Chargé en **lazy-import** via `LazyProseMark.svelte`. Le bundle ProseMarkEditor + MathJax (~2 Mo minifié) est séparé du bundle principal par Vite. Un pre-warm silencieux déclenche l'import au premier fichier `.md` ouvert, avant que l'utilisateur bascule en mode prose.

Voir [architecture_mathjax.md](./loading-mathjax-packages.md) pour le détail MathJax et [charte_stylage.md](./charte_stylage.md) pour le CSS dynamique.

### Mode présentation — `SlideDeck.svelte`

Voir [solution_de_presentation.md](./solution_de_presentation.md).

### Visualiseur PDF — `LazyPdfViewer.svelte`

Lazy-import de PDF.js. Rendu dans un canvas WebGL. Barre de navigation flottante (apparaît au survol), panneau TOC/pièces jointes escamotable, zoom, recherche texte.

### Visualiseur image — `ImageViewer.svelte`

Composant léger, pas de dépendance externe. Affiche l'image via une URL Tauri (`convertFileSrc`) dans un `<img>`.

---

## Stores et état global

Tous les stores sont des modules `.svelte.ts` utilisant les runes Svelte 5. Ils sont des singletons importés directement, sans contexte Svelte.

| Store | Contenu | Persistance |
|---|---|---|
| `proseSettings` | Police, taille, interligne, maxWidth, CSS custom | localStorage |
| `mathJaxPreamble` | Macros LaTeX globales | localStorage |
| `mathJaxPackages` | Liste des extensions actives | localStorage |
| `overlays` | Booleens ouverture de chaque modale | mémoire |
| `notifications` | Erreurs / infos systeme | mémoire |
| `contextMenu` | Items du menu contextuel actif | mémoire |

---

## Palette de commandes

`buildCommands()` construit la liste complète des actions (ouvrir/créer fichier, basculer vue, changer de thème, partager, aide…). `filterAndRankCommands()` filtre et trie par pertinence pour la recherche floue. Accessible par `Cmd/Ctrl+K` ou `F1`.

---

## Internationalisation

Fichiers `src/locales/en.json` et `fr.json`. La clé active est persistée en localStorage. `getT($language)` retourne une fonction de traduction typée. Deux langues disponibles ; extension via un fichier JSON supplémentaire.

---

## Multi-fenêtre (projets)

Le menu "Ouvrir dans une nouvelle fenêtre" crée une `WebviewWindow` Tauri. La fenêtre enfant s'enregistre via l'événement `azprose:project-window-ready` ; la fenêtre parent répond avec le chemin du dossier via `azprose:open-folder:{label}`. Les deux fenêtres ont leur propre localStorage et leur propre état — elles ne partagent pas de données.

---

## À venir

### Édition LaTeX native

Le workflow cible : ouvrir un fichier `.tex`, le modifier dans CodeMirror avec coloration syntaxique LaTeX (déjà supportée via `@codemirror/language-data`), compiler via un backend Rust (latexmk ou tectonic embarqué), et afficher le PDF résultant dans le visualiseur PDF intégré sans quitter l'application.

Points d'intégration identifiés :
- La commande Tauri de compilation peut écrire le PDF dans un répertoire temporaire et émettre un événement pour déclencher la mise à jour du visualiseur.
- L'association `.tex` est déjà déclarée dans `tauri.conf.json`.
- L'auto-complétion des commandes LaTeX et la navigation symboles sont réalisables via des extensions CodeMirror.

### Édition Typst

Typst expose un compilateur en WebAssembly, utilisable directement dans le processus frontend sans appel Rust. Le flux serait similaire au mode raw de Markdown : édition dans CodeMirror, compilation WASM à chaque sauvegarde (ou en continu avec debounce), rendu dans le visualiseur PDF. La prévisualisation inline (SVG par page) est également envisageable pour une expérience WYSIWYM.
