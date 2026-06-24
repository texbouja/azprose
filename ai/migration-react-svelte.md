# Migration React → Svelte 5 — AZprose

> Rapport d'analyse établi sur la base du code source actuel (juin 2026).  
> Objectif : évaluer la faisabilité, quantifier l'effort et proposer un plan de migration  
> depuis l'architecture actuelle Vite/React vers Vite/Svelte 5 avec Runes.

---

## 1. Motivations

Le MANIFEST.md indique explicitement que React n'était qu'un « dernier recours ». Les griefs
concrets après implémentation :

- **Verbosité du state management** : chaque donnée réactive nécessite `useState` +
  `useCallback` + `useRef` (pour les closure stale) + `useEffect`. Dans `app.tsx` (995 lignes),
  cette mécanique représente environ 40 % du code.
- **Overhead conceptuel des hooks** : `useSelectionSyncText` (220 lignes),
  `useSyncScroll` (80 lignes) et `useFileSession` (150+ lignes) sont complexes
  *précisément parce que* React impose des gardes (echo counter, cancelled flag, ref sync)
  qui n'existent pas avec un système de réactivité fine-grained.
- **Taille du bundle** : React + ReactDOM ≈ 45 KB gzippé, Svelte ≈ 0 (compilé, pas de runtime).
- **Cohérence avec le MANIFEST** : la stack cible était Tauri + TypeScript vanilla ou Svelte.

---

## 2. Inventaire de l'existant

### 2.1 Composants (30+)

| Groupe | Fichiers | Complexité |
|--------|----------|------------|
| Chrome | TitleBar, Breadcrumb, StatusBar, Logo, ThemeButton | Moyenne |
| Éditeur | Editor (CodeMirror), ProseMarkEditor, OpenTabs, ImageViewer, PdfViewer | Haute |
| Fichiers | Sidebar, FileTree, FolderNode, Favorites, RootFolder, EditableRow, ContextMenu, SidebarSearch | Haute |
| Overlays | CommandPalette, HelpOverlay, AboutOverlay, WelcomeOverlay, Toast, DropOverlay | Moyenne |
| Primitives | Button, Icon, Overlay, TooltipRoot, Popover, Kbd, Shortcut | Faible |
| ~~Supprimé~~ | ~~DiagramViewer~~ (Mermaid — couplé à markdown-it) | — |

### 2.2 Hooks customs (15)

| Hook | Lignes | Rôle |
|------|--------|------|
| `useFileSession` | ~150 | Buffer actif, onglets, statut de sauvegarde, conflits disque |
| `useFileOps` | ~200 | CRUD fichiers + undo stack (20 ops) |
| `useSelectionSyncText` | ~220 | Sync bidirectionnelle de sélection éditeur ↔ preview |
| `useSyncScroll` | ~80 | Scroll proportionnel bidirectionnel avec echo counter |
| `useShortcuts` | ~105 | Lexer de raccourcis clavier (mod/shift/alt/bare keys) |
| `useScrollMemory` | ~50 | Mémorisation scroll par chemin de fichier |
| `useFileWatcher` | ~70 | Poll mtime toutes les 2s, pause on blur |
| `useContextMenu` | ~40 | Position + cible du menu contextuel |
| `useOverlays` | ~30 | État des 4 modals |
| `useNotifications` | ~40 | 4 types de toasts avec auto-dismiss |
| `useUpdateFlow` | ~60 | Tauri updater plugin |
| `usePersistedState` | ~30 | localStorage avec sérialisation JSON |
| `useDebouncedValue` | ~15 | Debounce générique |
| `useSelectionSync` | — | Sync sélection éditeur/preview |
| `useScrollMemory` | ~50 | Scroll par path |

### 2.3 Dépendances tierces — compatibilité Svelte

| Bibliothèque | Lien React | Migration |
|---|---|---|
| `@tauri-apps/*` | Aucun | ✅ Compatible tel quel |
| `codemirror` / `@codemirror/*` | Aucun | ✅ Compatible tel quel |
| `@prosemark/*` | **Aucun** (extensions CodeMirror pures) | ✅ Compatible tel quel |
| `pdfjs-dist` | Aucun | ✅ Compatible tel quel |
| `mathjax` | Aucun | ✅ Compatible tel quel |
| `i18next` | Wrapper React (`react-i18next` absent) | ✅ Usage direct déjà en place |
| `lucide-react` | **Lié React** | 🔄 → `lucide-svelte` (drop-in) |
| `@fontsource/*` | Aucun | ✅ Compatible tel quel |
| ~~`markdown-it`~~ | — | 🗑 **Supprimé** — remplacé par ProseMark |
| ~~`mermaid`~~ | — | 🗑 **Supprimé** — couplé à la couche markdown-it |

**Conclusion clé** : aucune bibliothèque métier (CodeMirror, ProseMark, PDF.js, Tauri) n'est
couplée à React. Seule `lucide-react` nécessite un remplacement trivial.

> **Note sur markdown-it et Mermaid** : `markdown-it` a déjà été remplacé par ProseMark dans
> l'implémentation courante. `mermaid` était branché sur la couche markdown-it et n'a pas
> d'équivalent dans ProseMark. Le support des diagrammes est donc suspendu en attendant
> un support natif côté ProseMark. `DiagramViewer` et toute la glue Mermaid/PlantUML sont
> **à supprimer** lors de la migration, sans équivalent à réécrire.

---

## 3. Analyse de la complexité de migration

### 3.1 Ce qui est trivial

**Pattern → Svelte 5 Runes équivalent :**

```
// React
const [count, setCount] = useState(0);
useEffect(() => { document.title = count }, [count]);
const inc = useCallback(() => setCount(c => c + 1), []);

// Svelte 5
let count = $state(0);
$effect(() => { document.title = count });
const inc = () => count++;
```

Chaque `useState` devient `$state`. Chaque `useEffect` devient `$effect`.
Chaque `useMemo` devient `$derived`. Les `useCallback` disparaissent
(les fonctions en Svelte ne recréent pas de closure à chaque render).
Les `useRef` pour valeurs mutables deviennent de simples variables de module/composant.

**Composants concernés (effort < 1h chacun) :**

- Tous les primitives (Button, Icon, Kbd, Shortcut, Overlay, Popover)
- TitleBar, StatusBar, Logo, ThemeButton
- Toast, DropOverlay, HelpOverlay, AboutOverlay, WelcomeOverlay
- ImageViewer
- ~~DiagramViewer~~ → **supprimé** (Mermaid/PlantUML sans couche de rendu)

### 3.2 Ce qui demande de la réflexion

#### `OpenTabs` — drag-reorder Pointer API

Le drag est implémenté avec `onPointerDown` / `onPointerMove` / `onPointerUp` et
une suppression du clic post-drag. La logique est identique en Svelte mais utilise
les directives d'événements (`on:pointerdown`) au lieu des props JSX. ~2h.

#### `FolderNode` — DnD fichiers

Même logique MIME type custom (`application/x-azprose-path`), vérification
de descendance pour éviter le drop dans un sous-dossier. Pattern identique,
syntaxe différente. ~2h.

#### `Sidebar` — drag resize + sub-state

Le resize de la sidebar via Pointer capture est simple à traduire.
La complexité vient des nombreuses props passées aux fils : à refactorer
en stores Svelte partagés plutôt qu'en prop drilling. ~3h.

#### `CommandPalette` — recherche + navigation clavier

`useMemo` pour le filtrage, navigation ArrowUp/Down, focus management avec rAF.
Tout traduit directement en `$derived` + gestionnaires d'événements. ~2h.

#### `FileTree` / `FolderNode` — arbre récursif

Le rendu récursif fonctionne avec `<svelte:self>`. Plus propre qu'en React. ~3h.

#### `TooltipRoot` — tooltip global

Observer global sur `[data-tooltip]` avec `MutationObserver`. Aucun lien React,
c'est déjà du DOM impératif. Se traduit en action Svelte ou en `$effect` avec
cleanup. ~1h.

### 3.3 Ce qui est réellement complexe

#### `useFileSession` (150+ lignes)

Le plus critique. Gère :
- Buffer actif (`source`, `savedContent`, `activePath`)
- Multi-onglets (`tabs[]`, snapshot au changement d'onglet)
- Statut de sauvegarde (`saving`, `dirty`, `saved`, `idle`)
- Détection de conflits disque (fichier modifié externalement)
- Fichiers récents

**Approche Svelte** : convertir en **store module** (`fileSession.svelte.ts`) exposant
un objet réactif `$state` (Svelte 5 class-based store ou store Rune).
Le hook React devient une classe avec `$state` interne et des méthodes.

```typescript
// fileSession.svelte.ts
class FileSession {
  source = $state('');
  savedContent = $state('');
  activePath = $state<string | null>(null);
  tabs = $state<FileTab[]>([]);
  saveStatus = $state<SaveStatus>('idle');
  
  async openFile(path: string) { ... }
  async saveFile() { ... }
  // etc.
}

export const fileSession = new FileSession();
```

Chaque composant importe directement `fileSession` plutôt que de recevoir 15 props.
**C'est en fait une amélioration** : le prop-drilling disparaît.

**Effort estimé** : 6–8h (logique identique, refactoring architectural).

#### `useFileOps` (200+ lignes) — undo stack

Undo stack implémenté avec une pile LIFO + listener clavier `⌘⌥Z`.
En Svelte, le listener global devient un `$effect` avec cleanup.
La pile est un `$state<Op[]>`. ~4h.

#### `useSelectionSyncText` (220 lignes)

La logique la plus dense : sync de sélection bidirectionnelle entre éditeur CodeMirror
et preview HTML, avec `stripMarkdown()`, recherche par `data-sline/data-eline`,
déambiguation d'homophones.

Toute la logique est du DOM impératif + CodeMirror API — aucun lien React hormis
les hooks qui servent de cycle de vie. Se traduit directement avec `$effect`. ~4h.

#### `useSyncScroll` (80 lignes) — echo counter

Pattern subtil pour éviter la boucle de feedback (A scroll → B scroll → A scroll…).
Utilise un compteur d'écho et du rAF. Identique en Svelte. ~2h.

#### `useShortcuts` (105 lignes) — lexer clavier

Lexer custom pour les raccourcis (`mod+k`, `mod+ctrl+f`, bare keys).
Aucun lien React, c'est de la logique pure. Copier-coller avec adaptation du cycle
de vie. ~1h.

---

## 4. Analyse comparative — gain réel

### 4.1 Réduction de code

| Pattern | React | Svelte 5 | Réduction |
|---|---|---|---|
| State simple | `const [x, setX] = useState(v)` | `let x = $state(v)` | −60 % |
| Effet | `useEffect(() => {...}, [deps])` | `$effect(() => {...})` | −40 % |
| Valeur dérivée | `const r = useMemo(() => f(x), [x])` | `const r = $derived(f(x))` | −50 % |
| Ref mutable | `const r = useRef(v); r.current = v` | `let r = v` | −70 % |
| Callback stable | `useCallback(() => fn(), [deps])` | `() => fn()` | −100 % |
| Éviter stale closure | `useRef(fn); useEffect(() => { ref.current = fn }, [fn])` | Pas nécessaire | −100 % |

**Estimation globale** : −35 à −45 % de lignes sur la couche state/effets.

### 4.2 Performance

- **Bundle** : Svelte est compilé, pas de runtime framework (0 KB vs ~45 KB React gzippé).
  Dans une app Tauri où le webview est local, c'est surtout un gain au démarrage (~80 ms).
- **Réactivité fine-grained** : Svelte ne re-rend que les DOM nodes concernés,
  pas l'arbre de composants. Critique pour le `FileTree` récursif et les overlays.
- **Mémoire** : moins d'objets alloués par cycle (pas de virtual DOM diff).

### 4.3 Maintenabilité

- Disparition du prop-drilling : `useFileSession` devient un store global importable n'importe où.
- Disparition des patterns défensifs React (cancelled flag, echo counter via ref, stale closure guards).
- Code plus lisible : un fichier `.svelte` contient script + template + style, pas de JSX.

---

## 5. Risques et points d'attention

### 5.1 ProseMark — à investiguer

`@prosemark/core`, `@prosemark/latex`, `@prosemark/paste-rich-text`, `@prosemark/render-html`
sont utilisés comme des extensions CodeMirror pures (pas de JSX dans les imports visibles).
**Mais** : ces packages sont peu documentés. Avant de migrer, vérifier leur `package.json`
pour confirmer l'absence de dépendance `react` dans leurs propres `dependencies`.

```bash
cat node_modules/@prosemark/core/package.json | grep -A5 '"dependencies"'
```

Si une dépendance React cachée existe, elle doit être isolée derrière un composant
wrapper et pourrait bloquer la migration de `ProseMarkEditor`.

### 5.2 Svelte 4 vs Svelte 5

**Recommandation : Svelte 5 avec Runes.**

Svelte 5 (stable depuis oct. 2024) introduit les Runes (`$state`, `$derived`, `$effect`)
qui mappent directement aux hooks React — réduisant la courbe d'apprentissage.
Svelte 4 aurait nécessité l'architecture stores + `$:` réactif, plus éloignée des patterns
actuels. Svelte 5 Runes sont la bonne cible.

### 5.3 i18n — adapter l'usage

L'app utilise `i18next` directement (pas `react-i18next`). L'adaptation est simple :
créer un store Svelte qui expose `t()` et `language`.

```typescript
// i18n.svelte.ts
import i18next from 'i18next';
let language = $state('en');
export const t = (key: string) => i18next.t(key);
export { language };
```

### 5.4 CSS — aucun changement requis

Le design system (tokens.css, variables CSS, classes BEM `mdv-*`) est entièrement
indépendant de React. **Tout le CSS existant est réutilisable sans modification.**

### 5.5 Tauri — aucun changement requis

Tous les appels Tauri (`readFile`, `listen`, `invoke`, etc.) sont framework-agnostics.
Les event listeners Tauri deviennent des `$effect` avec cleanup (`return unlisten`).

---

## 6. Plan de migration recommandé

### Phase 0 — Préparation (1 journée)

1. Vérifier l'absence de dépendances React dans `@prosemark/*`.
2. Créer une branche `feat/svelte-migration`.
3. Initialiser un projet Tauri + Vite + Svelte 5 en parallèle.
4. Copier `src-tauri/`, `public/`, `src/styles/`, `src/locales/`, `src/lib/`, `src/assets/`.
5. Remplacer `lucide-react` par `lucide-svelte`.

### Phase 1 — Primitives et design system (1–2 jours)

Migrer dans l'ordre (pas de dépendances entre eux) :

- `Button`, `Icon`, `Kbd`, `Shortcut`
- `Overlay`, `Popover`, `TooltipRoot`
- `Toast`, `DropOverlay`
- Design system vérifié et fonctionnel

**Critère de fin** : les composants s'affichent avec les bons styles.

### Phase 2 — Stores globaux (2 jours)

Convertir les hooks d'état global en stores Svelte 5 :

```
usePersistedState → persistedState.svelte.ts
useOverlays       → overlays.svelte.ts
useNotifications  → notifications.svelte.ts
useContextMenu    → contextMenu.svelte.ts
useUpdateFlow     → updateFlow.svelte.ts
useShortcuts      → shortcuts.svelte.ts
```

Ces stores sont simples (< 50 lignes chacun) et servent de fondation à tout le reste.

### Phase 3 — Gestion de fichiers (3–4 jours)

```
useFileSession → fileSession.svelte.ts  (critique, à tester en isolation)
useFileOps     → fileOps.svelte.ts
useFileWatcher → fileWatcher.svelte.ts
```

Puis migrer les composants qui en dépendent :

- `Sidebar`, `RootFolder`, `FileTree`, `FolderNode`, `Favorites`
- `EditableRow`, `SidebarSearch`, `ContextMenu`

**Critère de fin** : ouvrir, créer, renommer, déplacer des fichiers fonctionne.

### Phase 4 — Chrome (1–2 jours)

- `TitleBar`, `Breadcrumb`, `StatusBar`, `Logo`, `ThemeButton`
- `OpenTabs` (drag-reorder Pointer API)

**Critère de fin** : navigation entre onglets, titre, statut de sauvegarde fonctionnels.

### Phase 5 — Éditeur (2–3 jours)

- `Editor` (CodeMirror — le plus simple, wrapper DOM pur)
- `ProseMarkEditor` (CodeMirror + extensions ProseMark — après validation Phase 0)
- `ImageViewer`
- `PdfViewer` (pdfjs-dist — framework-agnostic)
- `useScrollMemory`, `useSyncScroll`, `useSelectionSyncText`
- ~~`DiagramViewer`~~ — **non migré**, supprimé avec `mermaid` et `plantuml-encoder` (PlantUML)

### Phase 6 — Overlays et assemblage final (2 jours)

- `CommandPalette`, `HelpOverlay`, `AboutOverlay`, `WelcomeOverlay`
- Assemblage dans `App.svelte` (remplace `app.tsx`)
- Tests end-to-end de tous les flux utilisateur

---

## 7. Estimation de l'effort total

| Phase | Effort |
|-------|--------|
| 0 — Préparation | 1 jour |
| 1 — Primitives | 1–2 jours |
| 2 — Stores globaux | 2 jours |
| 3 — Gestion de fichiers | 3–4 jours |
| 4 — Chrome | 1–2 jours |
| 5 — Éditeur | 2–3 jours |
| 6 — Assemblage + tests | 2 jours |
| **Total** | **12–16 jours** |

Avec une courbe d'apprentissage Svelte 5 incluse (~2 jours), compter **3 à 4 semaines**
en développement solo non-exclusif.

---

## 8. Alternative : rester sur React et réduire la complexité

Si la migration est jugée trop coûteuse à court terme, les douleurs identifiées peuvent
être atténuées **sans changer de framework** :

1. **Zustand** à la place du prop-drilling : remplacer `useFileSession` par un store Zustand
   élimine les 15 props passées en cascade depuis `app.tsx`.
2. **Jotai** pour l'état atomique des overlays et notifications.
3. Décomposer `app.tsx` en composants plus petits avec états locaux.

Mais cela reste du React, et le overhead conceptuel des hooks persist.

---

## 9. Verdict

La migration est **techniquement propre et faisable**. Le facteur décisif est que **100 %
des bibliothèques métier sont framework-agnostic** (Tauri, CodeMirror, ProseMark, PDF.js,
MathJax, Mermaid, i18next). Il n'y a aucun lock-in React sur la couche fonctionnelle.

Ce qui migre c'est uniquement la **plomberie réactive** (hooks → runes) et la **syntaxe
des templates** (JSX → `.svelte`). Le code métier, la logique Tauri, le design system
CSS — tout est réutilisable à l'identique.

Le risque principal est `@prosemark/*` : vérifier les dépendances transitives avant de
s'engager. Si ProseMark embarque React, le composant `ProseMarkEditor` devra être isolé
dans un Web Component ou un `<iframe>` — ce qui est gérable mais ajoute ~2 jours.

**Recommandation** : migrer. L'effort est concentré sur 3–4 semaines, le résultat est
un codebase plus court, plus rapide et aligné avec l'intention initiale du MANIFEST.

---

*Généré avec Claude Sonnet 4.6 — juin 2026*
