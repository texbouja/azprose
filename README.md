<h1 align="center">AZprose</h1>

<p align="center"><em>éditeur de texte scientifique — Markdown · LaTeX · Typst</em></p>



Application desktop multi-platforme (**macOS • Windows • Linux**) et multi-langage de composition (**Markdown • LaTeX • Typst**) pour la rédaction et la gestion de documents scientifiques.

Approche **WYSIWYM** (What You See Is What You Mean) pour l'édition Markdown, avec rendu MathJax.

Fonctions de base d'un éditeur LaTeX avec viualisation PDF intégrée et prise en charge de Synctex. 

> À la base c'est un fork de [marka.md](https://github.com/mattenarle10/markamd) — le conteneur Tauri/React a été migré vers Tauri/Svelte ; la couche d'édition Markdown a été remplacée par [ProseMark](https://github.com/prosemark). 

- [x] Phase 1 — Réectriture de Marka.md  
  - [x] migration de React vers Svelte; 
  - [x] conversion du système Markdown de base en mode Preview sans Split;  
  - [x] ajout d'un mode WISYWYM avec ProseMark;
  - [x] ajout d'un mode Presentation (du pauvre en attendant Marp);   
  - [x] ajout du support du texte mathématique avec Mathjax, compatible prosemark/latex; 

- [x] Phase 2 — Lecteurs multimédia. 
  - [x] visonneuse des formats d'images courants (webview); 
  - [x] lecteur PDF (PDFjs).
  - [ ] support de Marp 

- [ ] Phase 4 — support LaTeX étendu
- [ ] Phase 5 — support Typst. 

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

## installation depuis les sources

Requiert **bun**, **rust** et les outils de build de la plateforme. Sur Linux, installer `libwebkit2gtk-4.1-dev libsoup-3.0-dev` et les dépendances Tauri.

```sh
bun install
bun run tauri dev      # fenêtre native avec HMR
bun run tauri build    # produit .AppImage / .deb / .rpm / .dmg / .exe
``` 

## licence

MIT · fork de [marka.md](https://github.com/mattenarle10/markamd) (Matt Enarle) · modifications AZprose (Sadik Boujaida)
