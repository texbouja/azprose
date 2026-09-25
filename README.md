<h1 align="center">AZprose</h1>

<p align="center"><em>
Éditeur de texte scientifique — Markdown · LaTeX<br>
Assistant de gestion d'une classe en CPGE
</em></p>

AZprose est une application de bureau (**Linux · macOS · Windows**) pour la rédaction de contenu scientifique et la gestion d'une classe de CPGE. Tout est traité en local, sans service cloud.

- **Markdown** (saveur Obsidian : wikilinks, transclusions, callouts). Deux modes d'édition, brut et « prose » : le second affiche le balisage et les formules MathJax sur place. Deux modes de visualisation : page web et présentation multi-pages.
- **LaTeX** : compilation avec `latexmk`, complétion et diagnostics avec `texlab`, recherche inverse par `Ctrl+clic` (SyncTeX).
- **Typst** : prévu, pas encore disponible.
- **Gestion de classe** : calendrier, tableur et filtrage de données stockées dans une base SQLite, sans connaissances particulières en bases de données. La chaîne des colles est complète : import du colloscope, génération des feuilles de colles, transclusion des planches, page d'évaluation. Les notes sont ensuite retrouvées par élève ou par semaine.
- **Orientée projet** : chaque projet est un dossier, et toute sa configuration (thème compris) est rangée dans `.azprose/`, qui le suit s'il est déplacé.

La documentation utilisateur se trouve dans [docs/user/](docs/user/).

---

## Construire et lancer sous Linux

Ce guide a été testé sur MX Linux 25 (Debian 13 « trixie »). Il vaut pour toute distribution basée sur Debian ou Ubuntu récente.

AZprose est une application [Tauri 2](https://tauri.app) : une interface Svelte/Vite, gérée avec **bun**, et un backend en **Rust**.

| Outil | Rôle | Version |
|---|---|---|
| bun | gestionnaire de paquets JS, scripts, tests | récente (≥ 1.2) |
| Node.js | exécute la CLI Tauri et Vite (appelés par `bun run`) | ≥ 24 |
| Rust (rustup) | backend Tauri | stable récente |
| WebKitGTK 4.1, GTK 3… | bibliothèques système de Tauri | paquets de la distribution |

> Les versions de Node et de Rust fournies par Debian 13 (Node 20, rustc 1.85) sont trop anciennes. On installe les deux dans l'espace utilisateur, sans toucher au système.

### 1. Bibliothèques système

```bash
sudo apt update
sudo apt install build-essential curl pkg-config libssl-dev \
  libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

Ajoutez `patchelf` si vous voulez produire une AppImage.

### 2. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustc --version
```

### 3. bun

```bash
curl -fsSL https://bun.sh/install | bash
```

L'installeur ajoute `~/.bun/bin` au PATH dans `~/.bashrc`. Pour que les applications graphiques (VSCode…) trouvent aussi bun, ajoutez les mêmes lignes à `~/.profile` :

```bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

### 4. Node.js ≥ 24 (via fnm)

```bash
curl -fsSL https://fnm.vercel.app/install | bash
# ouvrir un nouveau terminal, puis :
fnm install 24
fnm default 24
node --version
```

### 5. Dépendances du projet

```bash
git clone https://github.com/texbouja/azprose.git
cd azprose
bun install
```

Vérifications facultatives :

```bash
bunx tsc --noEmit   # typage
bun test            # tests unitaires
```

### 6. Outils externes utilisés à l'exécution

L'application lance ces programmes ; ils doivent être dans le `PATH`.

| Programme | Sert à | Obligatoire |
|---|---|---|
| `markdown-oxide` | serveur LSP Markdown (wikilinks, callouts) | pour l'édition Markdown |
| `texlab` | serveur LSP LaTeX (complétion, diagnostics) | pour l'édition LaTeX |
| `latexmk`, `synctex` | compilation LaTeX, recherche inverse | pour compiler du LaTeX |
| Chrome ou Chromium | export PDF/PNG du Markdown | facultatif : sinon, Chromium est téléchargé au premier export |

**LaTeX** : TeX Live fournit `latexmk` et `synctex`.

```bash
sudo apt install texlive latexmk   # ou texlive-full pour tout avoir
```

**markdown-oxide et texlab** : il est plus rapide d'utiliser les binaires officiels publiés sur GitHub que de compiler les crates avec `cargo install`. On les installe dans `~/.local/bin`, qui est dans le PATH par défaut sur Debian :

```bash
mkdir -p ~/.local/bin && cd "$(mktemp -d)"

# texlab — https://github.com/latex-lsp/texlab/releases
curl -fsSL https://github.com/latex-lsp/texlab/releases/latest/download/texlab-x86_64-linux.tar.gz | tar xz
install -m755 texlab ~/.local/bin/

# markdown-oxide — https://github.com/Feel-ix-343/markdown-oxide/releases
MOXIDE=v0.25.12
curl -fsSL https://github.com/Feel-ix-343/markdown-oxide/releases/download/$MOXIDE/markdown-oxide-$MOXIDE-x86_64-unknown-linux-gnu.tar.gz | tar xz
install -m755 markdown-oxide-$MOXIDE-x86_64-unknown-linux-gnu/markdown-oxide ~/.local/bin/

texlab --version && markdown-oxide --version
```

Pour une version plus récente, changez `MOXIDE` selon la page des releases.

### 7. Lancer en mode développement

```bash
bun run tauri dev
```

Cette commande démarre Vite sur le port 1420, compile le backend Rust (quelques minutes la première fois, quelques secondes ensuite) et ouvre la fenêtre. Les modifications de l'interface sont rechargées à chaud ; celles du Rust déclenchent une recompilation.

### 8. Construire et installer un paquet `.deb`

```bash
bun run tauri build --bundles deb
sudo apt install ./src-tauri/target/release/bundle/deb/azprose_*_amd64.deb
```

Le paquet s'appelle `azprose` (`sudo apt remove azprose` pour le désinstaller). Sans `--bundles deb`, la commande produit aussi un `.rpm` et une AppImage (cette dernière demande `patchelf`).

### Dépannage

| Symptôme | Cause et solution |
|---|---|
| `Error 71 (Protocol error) dispatching to Wayland display` | Bug du rendu DMA-BUF de WebKitGTK sous Wayland. L'application définit elle-même `WEBKIT_DISABLE_DMABUF_RENDERER=1` au démarrage ; si l'erreur apparaît encore, lancez avec `WEBKIT_DISABLE_DMABUF_RENDERER=1 bun run tauri dev`. |
| `bun run tauri dev` s'arrête aussitôt, port 1420 occupé | Une autre instance tourne encore. Repérez-la avec `ss -ltnp \| grep 1420` et arrêtez-la. |
| `pkg-config: command not found` ou `webkit2gtk-4.1 not found` | Les paquets de l'étape 1 manquent. |
| Erreurs de compilation Rust sur des crates récentes | Le `rustc` du système est utilisé à la place de rustup : vérifiez que `which cargo` donne `~/.cargo/bin/cargo`. |
| Pas de complétion Markdown ou LaTeX | `markdown-oxide` ou `texlab` introuvable : vérifiez `which markdown-oxide texlab`. Si l'app est lancée depuis le menu, `~/.local/bin` doit être dans le PATH de la session (`~/.profile`). |

---

## Licence

MIT
