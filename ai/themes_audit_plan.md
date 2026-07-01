# Audit & plan d'action — Gestion des thèmes AZprose (en cours d'implementation)

> Juin 2026. Réponse au cahier de charge [`charte_graphique.md`](charte_graphique.md) :
> renforcer la gestion des thèmes (UI thémable, architecture CSS robuste, sans
> redondance, séparation sémantique/style stricte).

## Constat clé

Le socle est **déjà solideLis** — contrairement à l'impression de « tout refaire ». Un
générateur dérive déjà les variables UI depuis les thèmes **Shiki**, le hover/clic façon
VS Code existe, CodeMirror consomme les mêmes tokens, les icônes sont inline, la section
« crafted » et les icônes sun/moon/check/trash sont en place. **C'est un refactor de
consolidation, pas un rewrite.** L'effort porte sur : supprimer la double source de vérité,
curer la liste d'ajout + aperçu, ranger les thèmes par projet, couvrir le boot, thémer le
terminal, finir une migration CSS, et séparer proprement couleurs / polices / espacements.

## Audit de l'existant (ce qui marche déjà)

| Élément | Fichier | État |
|---|---|---|
| **Générateur Shiki → variables UI** (`--bg`,`--fg`,`--accent`,`--syntax-*`, ombres, erreur…) | `src/lib/theme-generator.ts` | ✅ dérive bg/fg/accent/erreur/syntaxe d'un thème Shiki et produit le bloc `:root[data-theme="…"]` |
| **Modèle de thèmes** (BUILTIN, groupes, addons, hints) | `src/lib/theme.ts` | ✅ BUILTIN = neutral+catppuccin+gruvbox (12) ; addons préinstallés = matcha/kanagawa/rose-pine/ayu |
| **Hover = aperçu / clic = validation** (VS Code) | `theme.ts` (`previewTheme`/`setThemeMode`), `ThemeButton.svelte` | ✅ en place, y compris pour crafted |
| **Menu thèmes** (groupes pliables, crafted, sun/moon, check actif, trash crafted) | `src/components/chrome/ThemeButton.svelte` | ✅ présent |
| **CodeMirror homogène avec l'UI** | `src/lib/editor-languages.ts` | ✅ utilise `var(--syntax-*)`, `var(--fg)`, `var(--accent)`, `var(--muted)` |
| **Icônes inline** (Lucide → SVG strings) | `src/lib/icons.ts` | ✅ déjà fait (lucide-svelte retiré) |
| **Transparence + réglages d'écriture** (taille police, interligne) séparés du thème | `ThemeButton.svelte`, `theme.ts` | ✅ séparés des couleurs |
| **Stockage custom themes** (Rust) | `src-tauri/src/lib.rs` (`install/list/remove_custom_theme`, `custom_themes_dir`) | ⚠️ en **app data dir global**, pas par projet |
| **Boot screen** coloré avant tout CSS | `index.html` (map `BG[t]`) | ⚠️ couvre quelques thèmes, pas tous |

## Écarts vs charte (le « renforcement » à faire)

1. **Double source de vérité (redondance majeure).** `src/styles/tokens.css` code **à la
   main** 18 thèmes × ~19 variables, alors que `theme-generator.ts` sait dériver les **mêmes**
   variables depuis Shiki. → Générer les builtins (idéalement **au build**, ou via un script
   → `tokens.css` / un **JSON unique de thèmes**) au lieu de les maintenir à la main.

2. **« Add Theme » : liste curatée non-extensible + aperçu HTML.** Aujourd'hui
   `getAvailableThemes()` expose **tous** les thèmes Shiki (liste infinie) et le modal n'affiche
   que nom+type. La charte veut une **liste préparée fixe** (les addons) et un **aperçu du rendu
   HTML** de chaque thème ajoutable (hors BUILTIN).

3. **Stockage par projet.** Custom themes en app data dir global → les ranger dans
   **`.azprose/themes/<nom>.css`** + liste dans **`.azprose/config.json`** (éditable par
   utilisateurs avancés). Nécessite d'adapter les commandes Rust pour prendre la racine projet.

4. **Boot (`index.html`) — couvrir tous les thèmes**, même non « installés », pour éviter un
   flash de couleur au démarrage (la map `BG[t]` doit inclure builtins + addons).

5. **Terminal thémé** (différé précédemment). Intégrer le thème xterm dans l'architecture :
   palette dérivée des tokens (`--bg`/`--fg`/`--accent`) + couleurs ANSI issues du thème Shiki.

6. **Fin de migration `--mdv-*` → `--*`.** Reliquat dans 3 fichiers
   (`ThemeButton.svelte`, plus les variables polices/prose `--mdv-writing-*`/`--mdv-prose-*`)
   avec fallbacks `var(--mdv-x, var(--x))`. À uniformiser.

7. **Thèmes = couleurs uniquement ; polices par composant.** La charte veut des **polices
   configurables par composant** (CodeMirror / Preview / ProseMark…) dans le modal de config,
   les polices **UI non modifiables**, et espacements/alignements réglables. Actuellement seuls
   taille d'écriture + interligne sont réglables (globaux) → manque la **famille de police par
   composant**.

8. **Séparation sémantique/style à durcir.** 24 fichiers CSS dans `src/styles/` + styles
   inline de composants → vérifier l'absence de couleurs en dur, ne garder que des `var(--…)`,
   et réserver les `--syntax-*` au rendu de code.

9. **Parité crafted cassée (bug signalé).** Le hover/aperçu et le clic ne fonctionnent en
   pratique **que pour les BUILTIN**, pas pour les thèmes crafted ajoutés. Le câblage existe
   (`ThemeButton.svelte` : `onmouseenter`/`onclick` sur la section crafted), donc cause
   probable = **timing boot** : `theme.ts` applique `data-theme` **synchroniquement** au
   démarrage (`apply(readMode())`, l.226) alors que le CSS crafted est injecté **après**
   (`ensureCustomThemesLoaded`, async, `app.svelte` onMount). Un thème crafted persisté arrive
   donc sans son CSS → tombe sur les défauts `:root`. Les addons (matcha/kanagawa/rose-pine/ayu)
   « marchent » seulement parce qu'ils sont codés en dur dans `tokens.css`. À corriger pour
   parité **aperçu + validation + persistance** crafted ↔ builtin.

10. **Thème par projet (consolidation avec la gestion de projet).** La refonte projet (URL
    `?root=`, état scopé, `.azprose/`) doit porter aussi le **thème** : chaque projet a le sien.
    Le `themeMode` est **déjà** écrit dans `.azprose/config.json` (`doConfigSync`/`loadConfig`,
    `app.svelte`), mais il faut le charger **synchroniquement au boot du projet** (comme le
    dossier via `?root=`) pour éviter tout flash, et y associer les thèmes crafted du projet
    (`.azprose/themes/`). Aujourd'hui les crafted sont en app data **global** → incohérent avec
    le modèle vault Obsidian.

## Architecture cible

- **Source unique** : un script de build (ou un JSON unique `themes.json`) génère, depuis les
  thèmes Shiki, le CSS des tokens de **tous les builtins** → `tokens.css` devient **généré**,
  plus maintenu à la main. Le générateur runtime (`theme-generator.ts`) reste pour les thèmes
  crafted ajoutés par l'utilisateur (même logique, factorisée).
- **Runtime inchangé sur l'UX** : hover = `previewTheme`, clic = `setThemeMode` ; `data-theme`
  sur `<html>`.
- **Builtins permanents** vs **crafted** : crafted = sous-ensemble **curaté** d'addons,
  ajoutés via modal à aperçu HTML, stockés en `.azprose/themes/` + listés dans
  `.azprose/config.json`.
- **Couleurs vs typographie** : les thèmes ne portent **que** des couleurs ; un bloc de
  config distinct gère police (par composant) / taille / interligne / alignement.
- **Thème par projet** : le thème (mode + crafted) appartient au projet et se charge
  **synchroniquement au boot** dans la même chaîne que le dossier (`?root=`), avant le 1er
  rendu → pas de flash, et corrige la parité crafted. Crafted dans `.azprose/themes/`,
  mode dans `.azprose/config.json`.
- **Terminal dans la chaîne thème** : la couche thème **précède** le terminal ; au boot et à
  chaque changement/aperçu de thème, on (ré)applique l'objet thème xterm dérivé des tokens +
  ANSI Shiki. Le terminal n'a pas son propre réglage, il **suit** le thème.
- **Boot** : `index.html` couvre la couleur de fond de **tous** les thèmes.

## Plan d'action (ToDo — état mis à jour au fil de l'eau)

### Étape 1 — Source unique des builtins (anti-redondance) — ✅ FAIT
- [x] **Source unique** : `src/styles/themes.json` (16 thèmes builtin, valeurs actuelles
  curées, hand-editable). Structure CSS hors thèmes dans `src/styles/tokens.base.css`
  (placeholder `/* @THEMES@ */`).
- [x] **Génération offline statique** (hors build app) : `scripts/build-themes.mjs`
  (`npm run themes`) régénère `src/styles/tokens.css` depuis le json + la base. tokens.css
  porte un en-tête « GENERATED ». **Rendu identique** vérifié (diff = uniquement des
  commentaires inline `/* palette */`, valeurs strictement égales) ; régénération idempotente.
- [x] **Dériveur crafted renforcé** : `theme-generator.ts` puise désormais
  surface/border/hover/muted dans la **map `colors` VS Code** du thème Shiki (opaques
  seulement), `blendHex` en repli → corrige les incohérences des thèmes purement dérivés.
- **Critère** : aucun token builtin écrit à la main (source = json) ; rendu identique. ✅
- **Reste lié** (→ Étape 3) : catalogue crafted **curaté** (retirer les thèmes Shiki sans
  ressources `colors` suffisantes) généré en statique ; le dériveur renforcé est prêt pour ça.
  NB : les crafted **déjà installés** gardent leur ancien CSS jusqu'à réinstallation.

### Étape 2 — Polices/espacements séparés des couleurs — ✅ FAIT
- [x] **Modèle 2 groupes** (`src/lib/typography.ts`) : **Markdown** (prose rendu ProseMark +
  Preview) = famille/taille/interligne/**alignement** ; **Texte brut/Code** (éditeur source
  CodeMirror, tous formats bruts), **section séparée** = famille/taille/interligne + **toggle
  numéros de lignes**, pas d'alignement. Presets de polices open-source/système + **champ libre
  CSS** (datalist). Polices UI verrouillées.
- [x] **Câblage CSS** : `getTypographyVars` pose `--font-prose`/`--font-mono` (si police
  choisie), `--mdv-prose-*`/`--mdv-writing-*` (tailles/interlignes indépendants par groupe) et
  `--mdv-prose-align`. `preview.css` (`.mdv-prose`) et `.cm-html-widget` câblés sur ces vars +
  `text-align`. `Editor.svelte` : `lineNumbers` via Compartment reconfigurable à chaud.
- [x] **UI** : section « display » du menu thème restructurée en 2 sous-groupes (snippets
  `choiceSlider`/`fontField`) ; transparence conservée au-dessus.
- [x] **Persistance projet** : objet `typography` unique dans `.azprose/config.json`
  (`ProjectConfig.typography`), défaut global en `localStorage` (`STORAGE_KEYS.typography`),
  patch réactif `onTypographyChange`. i18n `typo.*` ×4 locales.
- **Critère** : changer la police d'un composant n'affecte ni l'UI ni les autres ; les thèmes
  ne touchent qu'aux couleurs. ✅ (build Vite OK, svelte-check sans régression)

### Étape 3 — Liste d'ajout curatée + aperçu HTML — ✅ FAIT
- [x] **Générateur refactoré** : `deriveThemeTokens` (tokens + flag `complete` = la map
  `colors` fournit surface ET border) et `tokensToCSS`/types sortis dans `src/lib/theme-css.ts`
  (léger, sans Shiki). `generateThemeCSS` s'appuie dessus.
- [x] **Catalogue statique curaté** : `scripts/gen-catalog.mjs` (`npm run catalog`, bun)
  scanne les thèmes Shiki, **écarte les incohérents** (10 rejetés : map `colors` incomplète OU
  **contraste fg/bg < 4.0** — garde de cohérence) + les sources BUILTIN/addons, et bake les
  tokens dans `src/lib/crafted-catalog.json` (**43 thèmes**). Le dériveur force aussi des
  surface/border **distinctes du fond** (blend si la source = bg) → panneaux visibles.
  `npm run catalog` logge les rejetés.
- [x] **Picker à aperçu HTML** (`ThemeButton.svelte`) : charge le catalogue **en lazy** (aucun
  Shiki au runtime → plus léger), grille de **cartes d'aperçu** rendues depuis les tokens du
  thème ; ajout = `tokensToCSS` → install + inject. Liste **fixe non-extensible**.
- **Critère** : on n'ajoute que des thèmes curés (complets) ; chaque carte montre un aperçu
  fidèle ; runtime ne charge plus Shiki. ✅
- **Reste** (→ Étape 4) : les addons préinstallés (matcha/kanagawa/rose-pine/ayu) restent en
  dur dans `themes.json` ; à consolider avec le stockage par projet ; les crafted déjà
  installés gardent leur ancien CSS jusqu'à réinstallation.

### Étape 4 — Thème par projet + crafted dans `.azprose/` (+ parité & sync boot) — ✅ FAIT
- [x] **Commandes Rust scopées projet** (`src-tauri/src/lib.rs`) :
  `install_project_theme`/`remove_project_theme`/`list_project_theme**s**` opèrent dans
  `<projet>/.azprose/themes/<nom>.css` (écriture **atomique** via `atomic_write`). `themeMode`
  reste dans `.azprose/config.json` (déjà géré par `loadConfig`/`doConfigSync`).
- [x] **Migration non destructive** : au **premier accès** d'un projet (dossier
  `.azprose/themes/` absent), `list_project_themes` crée le dossier et **copie** les crafted
  legacy de l'app-data global dedans. Gardé sur l'inexistence du dossier → trasher un thème ne
  ressuscite jamais les legacy.
- [x] **Chargement crafted-first au boot du projet** (`src/app.svelte`, `loadConfig`) : on
  **injecte le CSS crafted du projet AVANT** d'appliquer `themeMode` → parité builtin ↔ crafted
  (plus de fallback `:root`). Garde-fou : si le projet n'a pas de `themeMode` et que le défaut
  global pointe un crafted **absent** du projet, repli sur un builtin (`latte`).
- [x] **Splash gaté sur le thème** : le voile de boot (`#boot`) ne s'efface que lorsque
  `themeBootDone` est posé (CSS crafted injecté + `themeMode` appliqué), avec garde-fou 2 s →
  **zéro flash**, crafted correct au premier rendu.
- [x] **Câblage** : `theme.projectRoot` (store `src/stores/theme.svelte.ts`) posé par
  `app.svelte` au boot/changement de racine ; `ThemeButton` liste/installe/supprime via ce root
  (re-list réactif). Trash = `removeThemeCSS` + `remove_project_theme` (menu **et** fichier).
- **Critère** : chaque projet rouvre **son** thème (builtin ou crafted) sans flash ; un crafted
  vit dans `.azprose/themes/` (éditable à la main) ; hover/clic identiques builtin ↔ crafted ;
  trash = retrait menu **et** fichier. ✅

### Étape 5 — Terminal dans la chaîne thème (Shiki) — ✅ FAIT
- [x] **Module de dérivation** (`src/lib/terminal-theme.ts`) : `readXtermTheme()` lit les CSS
  vars courantes (`--bg`/`--fg`/`--accent`/`--muted`/`--syntax-*`), mappe les tokens Shiki
  sur les 16 couleurs ANSI (keyword→red, string→green, type→yellow, function→blue,
  constant→magenta, operator→cyan) + variantes bright par éclaircissement.
- [x] **Réactivité** (`Terminal.svelte`) : `MutationObserver` sur `data-theme` du `<html>`
  remplace l'ancien `cssVar()` statique ; `term.options.theme` ré-appliqué à chaque
  changement (hover preview + click commit).
- **Critère** : le terminal suit le thème UI en live (y compris à l'aperçu au survol), sans
  réglage propre. ✅

### Étape 6 — Boot complet + nettoyage CSS
- [x] `index.html` : couvrir la couleur de fond de tous les thèmes (builtins + crafts, soit 79 entrées BG + 26 light).
- [x] Migration `--mdv-*` → `--*` achevée dans `src/` (6 fichiers : `app.css`, `preview.css`,
  `writing-display.ts`, `typography.ts`, `editor-languages.ts`, `ThemeButton.svelte`).
- **Critère** : zéro flash au boot quel que soit le thème ; plus aucune `var(--mdv-…)` dans `src/`. ✅

## Hors périmètre (noté dans la charte, chantier distinct)

**Export Markdown → PDF.** La charte évoque 3 pistes (rendu HTML+CSS custom ; moteur Typst +
`cmarker`/`mitex` ; pdflatex + package `markdown`), moteur possiblement configurable. À traiter
séparément (cf. mémoire « PDF export » : `window.print()` jugé insuffisant). Ne pas mélanger
avec le chantier thèmes.
