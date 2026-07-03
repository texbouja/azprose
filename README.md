<h1 align="center">AZprose</h1>

<p align="center"><em>éditeur WYSIWYM pour les sciences — Markdown · LaTeX · Typst</em></p>

Application de bureau multi-platforme (**macOS · Windows · Linux**) conçue pour les professeurs de mathématiques en CPGE et toute personne à la recherche d'une application multi-langage pour la gestion et la rédaction de contenu scientifique. **Markdwon, LaTeX et Typst** sont supportés.

Agréable au quotidien, puissant quand il le faut. Avec un support naissant de **Typst**.

---

## aperçu

AZprose est un éditeur **WYSIWYM** (What You See Is What You Mean) qui combine la simplicité du Markdown et la puissance de LaTeX. Il s'adresse aux auteurs techniques qui veulent écrire du texte mathématique sans lutter contre un éditeur.

- **édition Markdown** avec coloration syntaxique (CodeMirror 6) et prévisualisation
- **rendu mathématique** (MathJax) en ligne et en mode présentateur
- **mode SlideDeck** pour des présentations sans quitter l'éditeur
- **visualisation PDF** embarquée avec support SyncTeX (aller-retron entre la source et le PDF)
- **compilation LaTeX** (latexmk) avec détection automatique des moteurs
- **compilation Typst** (typst-cli) embarquée
- **barre latérale** : arborescence de fichiers avec multi-sélection, icônes MIME, ouverture rapide
- **i18n** : français, anglais, allemand, espagnol
- **palette de commandes** (⌘K) pour tout faire sans la souris
- **interface calme** : dense, keyboard-first, locale-first, sans distraction

## stack

| couche | choix |
|---|---|
| framework | **Svelte 5** (runes) |
| éditeur | **CodeMirror 6** + ProseMark |
| backend natif | **Tauri 2** (Rust) |
| bundler | **Vite 8** |
| langage | **TypeScript 6** |
| exécution | **Bun** |
| PDF | pdfjs-dist |
| math | MathJax |
| compression LaTeX | latexmk + latexindent |

## débuter

### prérequis

- [Bun](https://bun.sh)
- [Rust](https://rustup.rs)
- Linux : `libwebkit2gtk-4.1-dev`, `libsoup-3.0-dev` et les dépendances Tauri

```sh
git clone https://github.com/texbouja/azprose.git
cd azprose
bun install
bun run tauri dev      # fenêtre native avec HMR
bun run tauri build    # bundles .deb/.rpm/.AppImage / .dmg / .msi
```

### scripts

| commande | description |
|---|---|
| `bun test` | tests unitaires |
| `bun run build` | build TypeScript + Vite |
| `cargo check --manifest-path src-tauri/Cargo.toml` | vérification Rust |
| `bun run tauri dev` | développement avec HMR |
| `bun run build-release` | build release + install |

## raccourcis

(modificateurs macOS ; sur Windows/Linux : `⌘`→`Ctrl`, `⌥`→`Alt`, `⇧`→`Shift`)

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
| ⌘⇧C | copier contenu |
| ⌘⌥Z | annuler dernière op fichier |
| ⌘/ | aide |
| esc | fermer |

## licence

MIT
