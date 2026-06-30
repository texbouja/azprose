# Audit & plan d'action — Gestion des thèmes AZprose

> Juin 2026. Réponse au cahier de charge [`charte_graphique.md`](charte_graphique.md) :
> renforcer la gestion des thèmes (UI thémable, architecture CSS robuste, sans
> redondance, séparation sémantique/style stricte).

## Constat clé

Le socle est **déjà solide** — contrairement à l'impression de « tout refaire ». Un
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

### Étape 2 — Polices/espacements séparés des couleurs
- [ ] Modèle de config typographie par composant (CodeMirror/Preview/ProseMark) : famille,
  taille, interligne, alignement. Polices UI verrouillées.
- [ ] UI de config (modal) + persistance (projet `.azprose/config.json`).
- **Critère** : changer la police d'un composant n'affecte ni l'UI ni les autres ; les thèmes
  ne touchent qu'aux couleurs.

### Étape 3 — Liste d'ajout curatée + aperçu HTML
- [ ] Remplacer « tous les thèmes Shiki » par une **liste fixe** d'addons proposables.
- [ ] Modal « Add Theme » avec **carte d'aperçu HTML** par thème (hors BUILTIN).
- **Critère** : on ne peut ajouter que des thèmes de la liste préparée ; chaque option montre
  un aperçu fidèle.

### Étape 4 — Thème par projet + crafted dans `.azprose/` (+ parité & sync boot)
- [ ] Commandes Rust (ou adaptation) : lire/écrire/supprimer dans `<projet>/.azprose/themes/` ;
  liste des crafted + `themeMode` dans `.azprose/config.json`.
- [ ] **Chargement synchrone au boot du projet** (même chaîne que `?root=`) : injecter le CSS
  crafted **avant** d'appliquer `data-theme` → corrige le bug de parité crafted (aperçu/clic/
  persistance) et supprime le flash.
- [ ] Migrer les crafted existants (app data global) vers `.azprose/themes/`.
- **Critère** : chaque projet rouvre **son** thème (builtin ou crafted) sans flash ; un crafted
  vit dans `.azprose/themes/` (éditable à la main) ; hover/clic identiques builtin ↔ crafted ;
  trash = retrait menu **et** fichier.

### Étape 5 — Terminal dans la chaîne thème (Shiki)
- [ ] Brancher la (ré)application du thème xterm sur la couche thème : au boot **après** le
  thème, et à chaque changement/aperçu (`previewTheme`/`setThemeMode`).
- [ ] Objet thème xterm dérivé des tokens (`--bg`/`--fg`/`--accent`/sélection) + 16 couleurs
  **ANSI** issues du thème Shiki.
- **Critère** : le terminal suit le thème UI en live (y compris à l'aperçu au survol), sans
  réglage propre.

### Étape 6 — Boot complet + nettoyage CSS
- [ ] `index.html` : couvrir la couleur de fond de tous les thèmes (builtins + addons).
- [ ] Terminer la migration `--mdv-*` → `--*` (3 fichiers) ; auditer les couleurs en dur.
- **Critère** : zéro flash au boot quel que soit le thème ; plus aucune `var(--mdv-…)`.

## Hors périmètre (noté dans la charte, chantier distinct)

**Export Markdown → PDF.** La charte évoque 3 pistes (rendu HTML+CSS custom ; moteur Typst +
`cmarker`/`mitex` ; pdflatex + package `markdown`), moteur possiblement configurable. À traiter
séparément (cf. mémoire « PDF export » : `window.print()` jugé insuffisant). Ne pas mélanger
avec le chantier thèmes.
