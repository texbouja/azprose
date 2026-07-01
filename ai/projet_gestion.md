# Architecture projet AZprose — cible & feuille de route (complété sauf étape 7)

> Juin 2026. Décrit l'architecture **cible** de la gestion de projets/fenêtres/sessions
> et la feuille de route pour y arriver. Diagnostic des défauts actuels :
> [`audit_projet.md`](audit_projet.md).

## Objectif

Modèle **vault Obsidian** : un projet = un dossier, chacun **indépendant**, avec sa propre
**session** (onglets, dernier fichier) et sa propre **config** (thème, réglages…) rangées
dans `.azprose/` à l'intérieur du dossier. Plusieurs projets ouverts = plusieurs fenêtres,
chacune maîtresse d'elle-même.

## Décision d'architecture : modèle « VS Code »

Référence : **VS Code n'est pas un process indépendant par projet.** C'est **un process
coordinateur unique** + **un renderer isolé par fenêtre** + les travaux risqués/lourds
(recherche, file-watcher, serveurs de langage, **terminaux**) déportés en **process
enfants**. L'état par espace de travail est isolé (jamais de clés globales qui se
télescopent) ; les réglages projet vivent dans `.vscode/` — l'équivalent de notre
`.azprose/`.

**Cible retenue (calquée VS Code) :** **1 backend Tauri + webviews isolées par fenêtre +
état projet dans `.azprose/`**, avec les sous-systèmes risqués en process enfants (le
**terminal PTY** l'est déjà via `portable-pty` ; le futur **indexeur** le sera). On obtient
la robustesse de VS Code sans la lourdeur d'un process OS par projet.

### Comportement au crash (pourquoi ce choix tient)
- Erreur JS / **rendu Svelte** dans une vue → désormais **contenue** (voir « Résilience aux
  crashs » ci-dessous) : la fenêtre et la chrome survivent.
- Crash du *renderer* (contenu web) → isolé par WebKitGTK : **les autres fenêtres
  survivent**.
- Panic du **backend Rust** → c'est la limite du 1-backend : il peut fermer **toutes** les
  fenêtres. Mitigé par : (a) écritures **atomiques** de l'état dans `.azprose/` →
  redémarrage propre sans perte ; (b) travaux risqués (indexeur, terminal) en **process
  enfants** qui ne font pas tomber le backend.

### Résilience aux crashs (frontend) — *quick-win implémenté*
Couche de robustesse complémentaire au stockage `.azprose/`. Implémentée :
- **Isolation par vue** : le contenu de l'onglet actif est enveloppé dans
  `<svelte:boundary>` (`src/app.svelte`). Une erreur de rendu/effet affiche un encart local
  (« Cette vue a planté · Recharger la vue »), **le reste de l'UI vit** (sidebar, breadcrumb,
  onglets, statusbar, console).
- **Overlay non destructif** (`src/main.ts`) : remplace l'ancien handler qui faisait
  `document.body.innerHTML = …` (il rasait toute l'app à la moindre exception). Affiche
  l'erreur, propose Recharger/Ignorer, et émet `azprose:crash`.
- **Flush + canal console** : `reportCrash` (`src/app.svelte`) flush les brouillons
  (`saveAllDirtyDrafts`) et pousse l'erreur dans la console Diagnostics (source `APP`),
  branché sur le boundary (`onerror`) et sur `azprose:crash`.

Limites : un **panic backend Rust** reste global ; le **CSS** ne lève pas d'exception (mise
en page cassée ≠ crash attrapable). **Dépendance** : aujourd'hui le flush écrit les
brouillons en `localStorage` ; après l'Étape 2, il doit écrire **atomiquement dans
`.azprose/`** (voir feuille de route).

### Repli documenté : multi-process réel
Un process OS par projet (data-dir webview distinct par projet) donnerait l'isolation au
crash **totale** (un projet qui plante n'affecte jamais les autres) et un `localStorage`
isolé d'office. Coût : contourner le plugin `single-instance` (qui aujourd'hui renvoie tout
nouveau lancement vers l'instance existante), gérer un data-dir par projet, et rendre le
registre de projets/handoff **inter-process** (l'état Rust actuel est par-process). Non
retenu par défaut ; à reconsidérer si l'isolation au crash totale devient prioritaire.

## Architecture cible — composants

### Projet = dossier + `.azprose/`
`.azprose/` contient tout l'état **propre au projet**, écrit **atomiquement**
(fichier temporaire + `rename`) pour survivre à un crash :
- `config.json` — réglages projet (thème, prose, slides…). **Existe déjà.**
- `session.json` — onglets ouverts, onglet actif, dernier fichier, position.
- `drafts/` — brouillons des fichiers modifiés non sauvegardés (hot-exit façon VS Code).
- (futur) `index/` — index de recherche en tâche de fond.

### Assignation du dossier à la création (fin du handshake)
La fenêtre doit connaître son projet **avant le premier rendu**, de façon **synchrone** :
- option A : passer le dossier dans l'URL de la fenêtre (`index.html?root=<path>`) ;
- option B : la fenêtre appelle elle-même `take_project_folder(myLabel)` **au boot**, avant
  d'initialiser `rootPath`/sidebar (le handoff est déjà stocké côté Rust par
  `store_project_folder` au moment de la création).

→ Supprime le handshake d'événements `project-window-ready` / `open-folder` et le bug
sidebar.

### Isolation de l'état par fenêtre
- Plus aucune clé `localStorage` **globale** pour l'état **projet** : tout ce qui est
  « projet » (folders, dernier fichier, session, brouillons) vient de `.azprose/`.
- Ce qui reste en `localStorage` est limité aux **préférences vraiment globales à
  l'application** (ex. langue par défaut), et assumé partagé.

### Dossiers « invités »
`add folder` ajoute un dossier **invité** affiché dans la sidebar mais **hors projet** :
- modèle de données distinguant `projectRoot` (le projet, porteur du `.azprose/`) de
  `guests[]` (dossiers consultés mais non gérés) ;
- l'**indexeur** et `.azprose/` **ignorent les invités** (pas d'index, pas de config pour
  eux) ;
- la « cible » des actions projet (nouveau fichier, recherche projet) reste `projectRoot`,
  jamais un invité.

### Menu « open project »
Alimenté par la liste maintenue des projets (`get_projects_list` / `add_project` /
`remove_project`, déjà présents dans `src-tauri/src/lib.rs`), plus une entrée **« nouveau
projet »** :
- créer un **nouveau dossier**, ou
- **« piquer »** un dossier existant du FS et y **initialiser `.azprose/`**.

### Logique de conflit (robuste, multi-OS)
À l'ouverture d'un projet, comparer le dossier demandé au projet courant avec une **fonction
de normalisation de chemins** (séparateurs, casse Windows, chemins absolus) — pas de
`startsWith` sur chaînes brutes :
- demandé **==** courant → ne rien faire ;
- demandé **parent/enfant** du courant → **fermer** le courant, **ouvrir** le demandé
  (évite les conflits FS / index) ;
- **disjoint** → ouvrir dans une **nouvelle fenêtre**.

### Contrôle de fenêtre
- Handlers de fermeture (`onCloseRequested`) + `unregister_project_window` pour **toutes**
  les fenêtres, pas seulement `azprose-project-*`.
- Le dirty-check de fermeture s'appuie sur la **session locale** du projet, jamais sur un
  état partagé.

## Feuille de route (étapes incrémentales)

Chaque étape est livrable et testable seule.

### Étape 1 — Isolation de l'état par fenêtre (corrige le bug sidebar) — ✅ FAIT
- Dossier assigné au boot via l'**URL `?root=`** (`urlRoot`, `src/app.svelte`), avant
  l'init `rootPath`/`folders`/sidebar. `spawnProjectWindow` crée la fenêtre avec cette URL.
- `rootPath` n'est plus dérivé du `localStorage` partagé pour une fenêtre projet.
- Handshake `project-window-ready` / `open-folder` **supprimé**.
- **Critère** : 2ᵉ projet → toolbar **et** sidebar = bon dossier, sans flash. ✅

### Étape 2 — Session par projet (corrige le télescopage)

**2a — Isolation par projet — ✅ FAIT.** Les clés `localStorage` de session/onglets/
dernier-fichier/brouillons sont **scopées par dossier de projet** (`setSessionScope` au
boot, `src/lib/session.ts`). Deux fenêtres/projets ne se télescopent plus. **Synchrone →
anti-perte sur crash préservé** (on ne touche pas au hot-exit). `src/app.svelte` : scope
posé après `rootPath`, `lastFile` passé par `saveLastFile`/`loadLastFile`.
- **Critère** : deux projets ouverts gardent chacun leurs onglets ; fermer/rouvrir restaure
  par projet. ✅

**2b — Copie canonique dans `.azprose/` (portabilité) — ✅ FAIT.** Miroir
`.azprose/session.json` (onglets, onglet actif, dernier fichier) écrit **atomiquement**
(tmp + `rename`, helper Rust `atomic_write`), **débouncé** (400 ms via
`scheduleSessionMirror`/`doSessionMirror`, `src/app.svelte`) en plus du localStorage scopé,
et **flush** au masquage/déchargement, **à la fermeture** (`onCloseRequested` attend
`doSessionMirror` avant `destroy`) et **au crash** (`reportCrash`). Au boot, on récupère
`.azprose/session.json` **uniquement si le localStorage scopé est vide** (projet
déplacé/copié ou nouvelle machine) puis on réamorce le localStorage — sinon le localStorage
scopé reste le **primaire synchrone** (anti-perte). Module wrapper
`src/lib/project-session.ts` ; commandes Rust `read_project_session`/`write_project_session`
(atomiques) ; `write_project_config` passe aussi en écriture atomique.
- **Critère** : un projet copié vers un autre chemin/machine rouvre ses onglets depuis
  `.azprose/session.json` ; aucune régression d'anti-perte sur le même poste. ✅

### Étape 3 — Contrôle de fenêtre — ✅ FAIT
- `onCloseRequested` pour **toutes** les fenêtres (`src/app.svelte`, onMount) ; on prend
  toujours la main (`preventDefault` + `win.destroy()` explicite) → fermeture déterministe.
  Dirty-check sur onglets locaux ; flush + `unregister_project_window` ; tout en `try/catch`
  pour ne **jamais** piéger la fenêtre.
- **Critère** : toute fenêtre se ferme ; confirmation seulement si **ses** onglets sont
  modifiés. ✅

### Étape 4 — Conflit de chemins robuste — ✅ FAIT
- `folderRelation(a, b)` (`src/lib/paths.ts`) : normalisation séparateurs + casse Windows
  (`IS_WINDOWS`), comparaison par segments. Remplace `startsWith` dans
  `handleOpenProjectByPath` (same → rien ; nested → fermer+ouvrir ; disjoint → nouvelle
  fenêtre).
- **Critère** : décisions correctes Linux/Windows (mêmes/parent/enfant/disjoint). ✅

### Étape 5 — Dossiers invités — ✅ FAIT
- Modèle `folders = [projectRoot, ...guests]` : `folders[0]` = projet (porte `.azprose/`,
  config/session), `folders[1..]` = invités. La sidebar les distingue (badge
  `sidebar.guestFolder`, bouton close, `isPrimary` dans `root-folder.svelte`).
- `.azprose/`/config restent basés sur `rootPath` (= `folders[0]`) → un invité **n'altère
  ni la config ni (futur) l'index**.
- **Persistance par projet** : invités stockés scopés (`saveGuests`/`loadGuests`,
  `src/lib/session.ts`), rechargés au boot (`folders = [projectRoot, ...guests]`) → ils
  survivent au reload et **ne télescopent plus** d'une fenêtre à l'autre.
- **Critère** : un invité s'affiche, est consultable, n'altère ni config ni index. ✅

### Étape 6 — Menu projets & création — ✅ FAIT
- `ProjectSelector` (`src/components/files/project-selector.svelte`, pied de sidebar) :
  liste maintenue (`get_projects_list`), ouvrir, retirer, projet courant marqué, +
  « ouvrir un dossier comme projet » (`handleInitProject` → picker OS, qui permet aussi de
  **créer** un dossier, + `add_project` + init `.azprose/` + ouverture).
- **Correctif** : le popover utilisait des variables CSS inexistantes (`--mdv-*`) → illisible ;
  remplacées par les tokens réels (`--surface`/`--border`/`--fg`/`--muted`/`--accent`).
- **Critère** : on lance un projet existant ou on en crée un depuis n'importe quelle fenêtre. ✅

### Étape 7 (plus tard) — Indexeur de recherche
- Tâche de fond en **process enfant** ; index dans `.azprose/index/` ; ignore les invités.
- **Critère** : recherche projet rapide sans bloquer l'UI ; un crash de l'indexeur n'affecte
  pas la fenêtre.

## Backend Rust — commandes existantes réutilisables

| Commande (`src-tauri/src/lib.rs`) | Rôle | Statut cible |
|---|---|---|
| `store_project_folder` / `take_project_folder` | Handoff label→dossier | Conservé ; `take` appelé par l'enfant au boot |
| `register_project_window` / `unregister_project_window` / `find_project_window` | Registre des fenêtres ouvertes | Conservé ; utilisé par la logique de conflit |
| `get_projects_list` / `add_project` / `remove_project` | Liste des projets connus | Conservé ; alimente le menu |
| `read_project_config` / `write_project_config` | `.azprose/config.json` | Étendu : écriture atomique, + session/drafts |

## Principes conservés
- **Compatibilité Windows** : condition essentielle (chemins normalisés, pas d'API Unix-only).
- **1 backend Tauri** : choix assumé ; robustesse via `.azprose/` atomique + process enfants.
- **Feuille de route incrémentale** : chaque étape livrable et testable seule.
