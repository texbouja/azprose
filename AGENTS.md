# AGENTS

- AZprose : éditeur WYSIWYM LaTeX/Markdown, public cible CPGE francophone. Stack : **Svelte 5 + Tauri 2 + Vite + TypeScript + Bun** (migration React → Svelte 5 complétée). Fork de azedit (React/markamd).
- Public : professeurs de maths CPGE, expert LaTeX (cpgekit), power-user non-dev, Linux/macOS.
- Style : dense, local-first, calme, keyboard-friendly, lowercase copy.
- Préférer les primitives de `src/components/primitives` et les icônes SVG inline de `src/lib/icons.ts` (lucide-svelte supprimé, −74 % au démarrage).
- Chaînes UI : ajouter dans **les 4 locales** (en/fr/de/es) via `src/locales/*.json`. Ne pas proposer de supprimer l'i18n.
- **Multi-fenêtres** : 1 projet = 1 dossier (+ `.azprose/`), 1 fenêtre `WebviewWindow`. Le dossier est passé par l'URL (`index.html?root=<path>`), lu synchroniquement au boot. Session/onglets/brouillons scopés par projet (`setSessionScope`, `src/lib/session.ts`). Fermeture déterministe via `window.destroy()`.
- Modèle dossiers : `folders[0]` = projet (porteur de `.azprose/`), `folders[1..]` = invités (badge, pas de config).

## ai/ — documents de référence (hors git, conservés localement dans `ai/`)

## commands

- `bun test` runs focused unit tests.
- `bun run build` runs TypeScript and Vite build.
- `cargo check --manifest-path src-tauri/Cargo.toml` checks the Rust shell.
- `bun run tauri dev` starts the desktop app during UI testing.
- `bun run install` builds a release binary and installs it to `/usr/local/bin/azprose` (Arch/CachyOS avec `sudo`).

## release/update notes

- App version is mirrored in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.lock`.
- Tauri updater artifacts are enabled in `src-tauri/tauri.conf.json`; signed release assets publish through GitHub Releases.
- Manual update UX lives in `src/hooks/use-update-flow.ts`, `src/lib/updater.ts`, command palette, Help, and About overlays.

## structure

- `src/components` contains chrome, editor (CodeMirror + ImageViewer), files/sidebar, overlays, and primitives.
- `src/hooks` owns stateful app flows.
- `src/lib` owns files, commands, updater, themes, i18n, writing-display, and platform helpers.
- `src/styles` is split by UI domain and imported from `src/app.css`.
- `src-tauri` contains Rust commands, capabilities, and bundle config.
