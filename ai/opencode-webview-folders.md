# OpenCode IA — Panneau latéral webview + distinction dossier projet/invité (encore en cours)

**Date : 2025-06-28**

## Objectif
Intégrer OpenCode comme IA dans un panneau latéral webview natif Tauri, et solidifier le système de dossiers projet/invités.

## Contraintes & Choix techniques
- Style : `var(--muted)`, `var(--fg)`, `var(--surface-hover)`, `var(--accent)`, transitions avec `var(--dur-fast)` / `var(--easing)` — jamais `color-mix`.
- Pas de dép `tauri-plugin-shell` ; spawn `opencode web` via `std::process::Command` côté Rust.
- `postinstall` efface `node_modules/.vite` (évite erreur 504 Vite).
- OpenCode bindé sur `127.0.0.1:4096` pour contourner l'interception Tauri de `localhost`.
- Le premier dossier chargé est le dossier **projet** (racine). Les dossiers ajoutés ensuite sont des **invités** (exclus de recherche/remplacement projet).
- Calquer le comportement sur VSCode (dossier projet, détection modifications externes).

## Progression

### Terminé
- **Nettoyage locales** : supprimé `it.json`, `ja.json`, `ko.json`, `pt-BR.json`, `zh.json` ; réduit `Language` à `"en" | "es" | "fr" | "de"`.
- **Menu langue** : déplacé dans `Breadcrumb.svelte`, bouton `Globe` + code langue, popover `.mdv-menu` avec `Check`.
- **Module Rust `opencode.rs`** : commands `start_opencode_server`, `stop_opencode_server`, `get_opencode_server_url`, `check_opencode_available`, enregistré dans `lib.rs`.
- **Remplacement iframe par webview enfant Tauri** : `Window::add_child()` avec `WebviewUrl::External()` au lieu de l'iframe (`src/components/opencode/OpencodeSidebar.svelte` réécrit).
- **Nouveau state `OpenCodeWebview` et commands Rust** : `open_opencode_sidebar`, `close_opencode_sidebar` (création/show/hide de la webview enfant).
- **Feature `"unstable"` activée** sur `tauri` dans `Cargo.toml` (nécessaire pour `add_child` et `get_window`).
- **CSP remise à `null`** dans `tauri.conf.json` (la webview enfant a son propre contexte de sécurité).
- **CSS sidebar opencode** : simplifié (seulement toast d'erreur).
- **Clé locale `opencode.notInstalled`** ajoutée dans `en.json`, `fr.json`, `es.json`, `de.json`.
- **Distinction projet/invité** : prop `isPrimary` dans `RootFolder`, badge `(guest)` affiché pour les dossiers non-principaux, libellé dynamique pour le bouton de fermeture.
- **Nouvelles clés locales** `sidebar.guestFolder`, `sidebar.removeGuest` dans les 4 langues.
- **CSS badge invité** : règle `.mdv-rootfolder__badge` dans `src/styles/files/sidebar.css`.
- **Détection modifications externes (VSCode-like)** :
  - `getMtime()` helper dans `src/lib/files.ts` via `stat()` de `@tauri-apps/plugin-fs`
  - `mtimeMap` (`Map<string, number>`) pour tracker les timestamps
  - Sur focus fenêtre / changement de visibilité : vérifie tous les onglets ouverts
  - Fichier modifié extérieurement + pas de changements non sauvegardés → rechargement auto + notification
  - Fichier modifié extérieurement + changements non sauvegardés → toast conflit avec action "reload (discard mine)"

### En cours
- *(aucun)*

### Bloqué
- *(aucun)*

## Décisions clés
- `add_child` (API unstable) plutôt qu'iframe : la CSP ne peut pas être assouplie pour charger du JS externe dans l'iframe, la webview enfant a son propre contexte sécurisé.
- Dossier projet = `folders[0]` : pas de nouvelle structure de state, le premier élément est toujours la racine du projet.
- Dossiers invités = `folders[1…]` : même rendu `RootFolder` mais avec badge + label de fermeture différent.

## Prochaines étapes
1. S'assurer que la recherche sidebar et le futur remplacement projet excluent bien les dossiers invités (déjà le cas : la recherche utilise `rootPath` = `folders[0]`).
2. Ajouter le titre de fenêtre dynamique (nom du projet au lieu de "untitled").

## Contexte critique
- `add_child`, `get_window`, `WebviewBuilder` sont derrière le flag `unstable` de `tauri`.
- Erreur 504 Vite résolue par `postinstall` effaçant `node_modules/.vite`.
- Les clés `app.fileReloaded`, `app.fileConflict`, `app.reloadDiscard` existent déjà dans les 4 locales (prêtes pour la détection de modifications externes).
- Le state des dossiers (`folders`) est persisté via `persistedState` avec la clé `mdview.folders`.

## Fichiers pertinents
- `src-tauri/Cargo.toml` : feature `"unstable"` ajoutée à `tauri`.
- `src-tauri/src/opencode.rs` : state `OpenCodeWebview`, commands `open_opencode_sidebar`, `close_opencode_sidebar`.
- `src-tauri/src/lib.rs` : enregistrement `OpenCodeWebview` + nouvelles commandes.
- `src-tauri/tauri.conf.json` : CSP `null`.
- `src/components/opencode/OpencodeSidebar.svelte` : réécrit (plus d'iframe, invoque Rust).
- `src/styles/opencode/sidebar.css` : simplifié (toast erreur seulement).
- `src/components/files/root-folder.svelte` : prop `isPrimary`, badge `(guest)`.
- `src/components/files/sidebar.svelte` : passage `isPrimary` + label dynamique pour close.
- `src/styles/files/sidebar.css` : règle `.mdv-rootfolder__badge`.
- `src/app.svelte` : prop `onClose` retirée de `<OpencodeSidebar>`, détection modifications externes, toast conflit.
- `src/lib/files.ts` : helper `getMtime()`.
- `src/lib/index.ts` : export `getMtime`.
