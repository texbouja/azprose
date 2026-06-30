# Audit — Gestion de projets AZprose

> Juin 2026. Audit de la base « projet/fenêtre/session ». Remplace les conclusions
> erronées de [`audit_2026-06.md`](audit_2026-06.md) sur ce domaine.

## Résumé exécutif

🔴 **La gestion de projets n'est pas réellement multi-session.** Toutes les fenêtres
partagent le même stockage navigateur (`localStorage`), et le dossier d'un nouveau projet
est assigné **trop tard** (après le premier rendu). Les deux bugs signalés par l'utilisateur
en découlent directement, ainsi qu'un télescopage silencieux des réglages, onglets et
brouillons entre projets.

Ce n'est **pas** un problème « mono-process » au sens où l'utilisateur le craignait : le
défaut est l'**absence d'isolation par fenêtre**, pas le nombre de process. (Voir
[`projet_gestion.md`](projet_gestion.md) pour la cible.)

## Méthode

Lecture directe du code (pas de supposition) :
- Flux fenêtres/handshake et init : `src/app.svelte`
- Stockage persistant : `src/stores/persisted.svelte.ts`, `src/lib/storage.ts`
- Session/onglets/brouillons : `src/lib/session.ts`
- Sidebar (arbre FS) : `src/components/files/sidebar.svelte`
- Commandes projet backend : `src-tauri/src/lib.rs`

## Cause racine

**Tout l'état par-projet vit dans un `localStorage` à clés fixes, partagé par toutes les
fenêtres.** Sous Tauri, les `WebviewWindow` d'une même application partagent le même
data-dir webview → **le même `localStorage`**. Or les clés sont fixes et globales :

- `persistedState(key, …)` lit/écrit `localStorage` avec des clés constantes
  (`src/stores/persisted.svelte.ts`) : `mdview.folders`, `mdview.lastFile`,
  `mdview.sidebar.open`, tailles d'écriture… (`src/lib/storage.ts`).
- Session (liste d'onglets) et brouillons : clés fixes `SESSION_KEY` et `DRAFT_PREFIX + path`
  (`src/lib/session.ts`).

Deux fenêtres de projet écrivent donc dans **les mêmes cases**. Il n'existe aucune
séparation par projet.

Aggravant : le dossier d'une nouvelle fenêtre n'est pas connu à l'ouverture. Il est
transmis **après coup** par un **handshake d'événements asynchrone** :
- côté enfant (`src/app.svelte`, ~l.277-287) : la fenêtre écoute `azprose:open-folder:<label>`,
  puis émet `azprose:project-window-ready` ;
- côté parent (`src/app.svelte`, ~l.650-669) : à la réception, `take_project_folder(label)`
  puis émission de `azprose:open-folder:<label>`.

Pendant ce temps, l'enfant a déjà démarré avec un mauvais dossier lu dans le `localStorage`
partagé.

## Bugs détaillés

### 1. 🔴 La sidebar affiche le mauvais projet (bug signalé)

Au démarrage, `rootPath = folders.current[0]` (`src/app.svelte:108`) lit `mdview.folders`
dans le `localStorage` **partagé** → c'est le **projet de l'autre fenêtre**. La sidebar
charge donc cet arbre immédiatement. Le bon dossier n'arrive qu'ensuite via le handshake,
qui corrige `rootPath` (d'où la **toolbar correcte**) — mais l'arbre de la sidebar a déjà
été chargé pour le mauvais projet. D'où le symptôme exact : **toolbar = bon dossier,
sidebar = arbre du premier projet**.

### 2. 🔴 Contrôle de fenêtre fragile (« refuse de se fermer »)

- Les handlers de fermeture (`onCloseRequested`) et de désenregistrement
  (`unregister_project_window`) ne sont posés que pour les fenêtres `azprose-project-*`
  (`src/app.svelte:278, 289`). Les autres fenêtres n'ont pas ce contrôle.
- Le test « onglets modifiés » à la fermeture s'appuie sur la **session partagée** : une
  fenêtre peut voir comme « non sauvegardés » les onglets **d'une autre** fenêtre, et
  redemander confirmation à tort (ou se bloquer).

### 3. 🟠 Télescopage des réglages / session / brouillons / dernier fichier

Réglages d'affichage, état de la sidebar, dernier fichier ouvert, liste d'onglets et
brouillons partagent des clés globales. Ouvrir un second projet écrase silencieusement
l'état du premier. Aucune fenêtre n'a un état réellement à elle.

### 4. 🟠 Comparaison de chemins fragile (Windows)

La logique de conflit (dossier demandé enfant/parent du projet courant) utilise
`folder.startsWith(rootPath + "/")` (`src/app.svelte`). Cassant sous Windows
(séparateurs `\`, casse non significative, lecteurs `C:`). Déjà noté comme friction.

### 5. 🟡 Handshake inutilement indirect et sujet aux courses

Chaque fenêtre installe un écouteur global `azprose:project-window-ready` et tente
`take_project_folder` — course entre fenêtres, indirection superflue. L'enfant pourrait
appeler **lui-même** `take_project_folder(myLabel)` à son démarrage (le handoff est déjà
stocké côté Rust avant la création de la fenêtre), sans aucun échange d'événements.

## Pourquoi l'audit précédent se trompait

[`audit_2026-06.md`](audit_2026-06.md) concluait « gestion de projets : conforme à la doc
et complète, pas de bug bloquant ». Il s'était arrêté à l'**existence** des commandes Rust
et du flux de fenêtres (présents), sans tester le **comportement multi-fenêtres réel** ni
remarquer que tout l'état projet repose sur un `localStorage` partagé à clés fixes. La
conformité « surface » masquait un défaut d'architecture.

## Tableau récapitulatif

| # | Bug | Cause | Impact | Sévérité |
|---|-----|-------|--------|----------|
| 1 | Sidebar = mauvais projet | `rootPath` lu dans localStorage partagé au boot, dossier réel assigné après rendu | Bug visible, projet inutilisable | 🔴 |
| 2 | Fenêtre « refuse de se fermer » / peu de contrôle | Handlers seulement sur `azprose-project-*` ; dirty-check sur session partagée | Fenêtres non maîtrisables | 🔴 |
| 3 | Télescopage réglages/session/brouillons | Clés `localStorage` fixes et globales | Perte d'état silencieuse entre projets | 🟠 |
| 4 | Conflit de chemins faux sous Windows | `startsWith` sur chaînes brutes | Mauvaise décision ouvrir/fermer | 🟠 |
| 5 | Handshake race-prone | Échange d'événements au lieu d'un `take` direct au boot | Fragilité, complexité | 🟡 |

## Conclusion

Le correctif n'est pas « ajouter des process » mais **isoler l'état par fenêtre** et
**assigner le dossier dès la création** — en rangeant l'état projet dans `.azprose/`
(modèle vault Obsidian). Architecture cible et feuille de route :
[`projet_gestion.md`](projet_gestion.md).
