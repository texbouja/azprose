# Architecture projet — AZprose

## Modèle

Un projet = un dossier sur le disque. Une session = une fenêtre `WebviewWindow` Tauri v2 qui isole son `localStorage`. Pas de notion de "workspace multi-dossiers" : le dossier racine (`folders[0]`) est le projet ; `folders[1…]` n'existent pas (les invités ont été retirés).

## Flux de création

1. `handleInitProject` ouvre un sélecteur de dossier → `add_project` Rust écrit dans `app_data_dir/projects.json` → `store_project_folder` (Rust) enregistre un handoff `{label → path}` dans un `Mutex<HashMap>`.
2. Une `WebviewWindow` est créée avec le label `azprose-project-<ts>`. L'enfant émet `azprose:project-window-ready`, le parent (ou le nouveau process) répond avec `azprose:open-folder:<label>`.
3. `folders.update([path])` → `rootPath = path` → `loadConfig(rootPath)`.
4. `read_project_config` (Rust) lit `.azprose/config.json` ; si absent, crée `{}`.
5. Les settings de la config écrasent les stores (`proseSettings`, `theme`, etc.).
6. `configLoaded = true` → le write-back `$effect` s'active.

## Write-back config

Un `$effect` réactif (l.187) touche tous les stores → `scheduleConfigSync` (debounce 400ms). `flushConfigSync` annule le timer et écrit immédiatement, déclenché par `beforeunload` + `visibilitychange hidden` pour éviter la perte de config sur fermeture.

Le chargement valide chaque clé contre `CONFIG_SCHEMA` : clés inconnues ou mal typées sont ignorées avec notification toast.

## Changement de projet

`handleOpenProject` / `handleOpenProjectByPath` :
1. `find_project_window` (Rust) vérifie si le dossier est déjà ouvert → focus si oui.
2. Si le dossier est enfant/parent de `rootPath`, une confirmation est demandée (`project.warnCloseFolder`).
3. Nouvelle fenêtre créée via `WebviewWindow(label, …)`.
4. L'ancienne fenêtre `azprose-project-*` est fermée avec `_skipCloseConfirm = true` (pas de double confirmation).
5. Dossier non lié → nouvelle fenêtre sans fermeture (multi-fenêtres).

`onCloseRequested` détecte les tabs dirty (`source !== savedContent`) et demande confirmation via `project.warnCloseUnsaved`.

## Backend Rust

| Commande | Rôle |
|---|---|
| `read_project_config(root)` | Lit `.azprose/config.json`, crée `{}` si absent |
| `write_project_config(root, content)` | Écrit le fichier (backend standard `fs::write`) |
| `store_project_folder(label, path)` | Stocke le handoff dans `Mutex<HashMap>` |
| `take_project_folder(label)` | Consomme et retourne le handoff |
| `register_project_window(label, path)` | Enregistre une fenêtre ouverte (folder → label) |
| `unregister_project_window(label)` | Nettoie à la fermeture |
| `find_project_window(path)` | Cherche si un dossier est déjà ouvert |
| `set_external_change_alerts(on)` | Émet `azprose:set-alerts` pour le mode agent |
| `get_projects_list()` | Liste des projets connus depuis `app_data_dir/projects.json` |
| `add_project(name, path)` | Ajoute un projet (doublon ignoré) |
| `remove_project(path)` | Supprime un projet |

## Points de friction restants

| # | Friction | Impact |
|---|---|---|
| 2 | **`rootPath` implicite** — le dossier projet est celui ouvert en premier. `rootPath` est lié à `folders[0]` sans ID stable — si un jour on réintroduit les invités, le réordonnancement déplacerait la cible "nouveau fichier" et la recherche | Actuellement sans conséquence (projet unique, pas d'invités). Devient gênant si on rouvre les invités |
| 10 | **`externalChangeAlerts` uniquement settable via Rust** — pas d'UI pour basculer en mode agent | Nécessite une commande Rust, pas accessible à l'utilisateur |
| 12 | **Dossiers invités non triés** — pas de drag-and-drop pour réordonner les dossiers dans la sidebar | Faible priorité : pas d'invités actuellement |
