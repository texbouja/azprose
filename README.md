<h1 align="center">AZprose</h1>

<p align="center"><em>éditeur de texte scientifique — Markdown · LaTeX · PDF</em></p>



Application desktop cross-platform (**macOS · Windows · Linux**) pour la rédaction et la gestion de texte scientifique. 

Approche **WYSIWYM** (What You See Is What You Mean) pour l'édition Markdown, avec rendu MathJax.

Visualiseur PDF complet avec LaTeX.

> À la base c'est un fork de [marka.md](https://github.com/mattenarle10/markamd) — le conteneur Tauri/React a été migré vers Tauri/Svelte ; la couche d'édition Markdown est remplacée par [ProseMark](https://github.com/prosemark). 

## fonctionnalités (Phase 1)

| domaine | détails |
|---|---|
| édition | CodeMirror 6 avec coloration syntaxique — Markdown, LaTeX, TypeScript, Python, Rust, CSS, HTML, JSON, YAML, SQL, XML, … |
| images | visualiseur intégré — PNG, JPEG, WebP, SVG |
| fichiers | onglets, sidebar dossier, favoris, recherche, drag-to-move, annulation des ops fichier, menu contextuel |
| desktop | thèmes groupés, contrôle de transparence, raccourcis, vim opt-in, restauration de session, mises à jour signées |

## installation depuis les sources

Requiert **bun**, **rust** et les outils de build de la plateforme. Sur Linux, installer `libwebkit2gtk-4.1-dev libsoup-3.0-dev` et les dépendances Tauri.

```sh
bun install
bun run tauri dev      # fenêtre native avec HMR
bun run tauri build    # produit .AppImage / .deb / .rpm / .dmg / .exe
```

## raccourcis clavier

Modificateurs **macOS** ci-dessous. Sur **Windows / Linux** : `⌘` → `Ctrl`, `⌥` → `Alt`, `⇧` → `Shift`.

| touche | action |
|---|---|
| ⌘K | palette de commandes |
| ⌘O | ouvrir un fichier |
| ⌘⇧O | ouvrir un dossier |
| ⌘N | nouveau buffer |
| ⌘S | enregistrer |
| ⌘⇧S | enregistrer sous |
| ⌘B | basculer la sidebar |
| ⌘F | rechercher / remplacer |
| ⌘⇧C | copier le contenu |
| ⌘⌥Z | annuler dernière op fichier |
| ⌘/ | aide |
| esc | fermer |

## stack

| couche | choix |
|---|---|
| shell | Tauri 2 (Rust + WebView) |
| frontend | React 19 · Vite 7 · TypeScript 5.9 · Bun |
| éditeur | CodeMirror 6 + extensions lezer |
| icônes | lucide-react |
| styles | CSS variables, sans framework |

## roadmap

- [ ] Phase 1 — migration du conteneur vers Tauri/Svelte : sidebar, gestion de fichiers, onglets, thèmes, CodeMirror, ImageViewer
- [ ] Phase 2 — support Markdown WYSIWYM via ProseMark + MathJax
- [ ] Phase 3 — visualiseur PDF vectoriel (sélection, liens, DPR)
- [ ] Phase 4 — support LaTeX étendu
- [ ] Phase 5 - support Typst. 

## licence

MIT · fork de [marka.md](https://github.com/mattenarle10/markamd) (Matt Enarle) · modifications AZprose (Sadik Boujaida)
