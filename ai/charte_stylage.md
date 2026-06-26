# Charte de stylage — AZprose

## Architecture technique

### Principe général

Tout le style de l'application repose sur des **propriétés CSS personnalisées** (`var(--xxx)`). Aucune valeur de couleur, de police ou d'ombre n'est codée en dur dans les règles de composants : elles proviennent toutes d'un token déclaré dans `tokens.css` ou d'un attribut de données posé sur `:root`. Ce mécanisme permet de changer de thème à chaud sans recharge, en ne modifiant qu'un attribut HTML.

---

### 1. Tokens CSS (`src/styles/tokens.css`)

Fichier central. Il déclare **deux couches de variables** sur `:root` :

**Couche globale** (une seule fois, sans sélecteur de thème) :
- Polices UI et mono : `--font-ui`, `--font-mono`
- Rayons : `--radius-sm / -md / -lg`
- Hauteurs de chrome : `--titlebar-h`, `--breadcrumb-h`, `--statusbar-h`
- Animation : `--easing`, `--dur-fast`, `--dur-base`
- Couleurs syntaxe de repli (overridées par chaque thème)

**Couche thème** (sélecteur `:root[data-theme="…"]`) — chaque thème surcharge exactement les mêmes tokens :

| Token | Rôle |
|---|---|
| `--bg` / `--bg-rgb` | fond principal (+ forme RGB pour les transparences) |
| `--fg` | texte principal |
| `--muted` | texte secondaire, labels, icônes inactives |
| `--border` | séparateurs, contours |
| `--accent` | couleur signature du thème |
| `--surface` | fond légèrement distinct (panneaux, popovers) |
| `--surface-hover` | état survol des surfaces |
| `--shadow-soft` | ombre douce précalculée (2 couches) |
| `--color-error` | rouge d'erreur calibré par thème |
| `--backdrop` | fond semi-transparent des modals |
| `--shadow-color` | triplet RGB pour `rgba(var(--shadow-color), N)` |
| `--syntax-*` | 8 rôles syntaxiques (keyword, string, number…) |
| `color-scheme` | `light` ou `dark` (active les ajustements natifs du WebView) |

Les thèmes clairs définissent `--shadow-color` avec les composants RGB du `--fg` (ombres colorées), les thèmes sombres avec `0, 0, 0` (ombres noires). Les semi-transparences s'écrivent `rgba(var(--shadow-color), N)` — un seul motif pour les deux polarités.

Thèmes disponibles : `latte` · `mono` · `mono-dark` · `frappe` · `macchiato` · `mocha` · `matcha` · `kanagawa` · `ayu` · `rose-pine` · `claude` · `codex` · `gemini` · `cursor`. Les alias `light` et `dark` pointent respectivement sur `latte` et `mocha`.

---

### 2. CSS statique des composants (`src/styles/`)

Chargé une fois au démarrage via `src/app.css`. Organisé par domaine :

```
styles/
  globals.css          — reset, body, boutons, scrollbars, sélection, print
  tokens.css           — (voir §1)
  chrome/
    titlebar.css
    breadcrumb.css
    statusbar.css
  editor/
    prose.css          — typographie avancée des widgets HTML ProseMark
    tabs.css
  files/
    sidebar.css
  overlays/
    overlay.css        — backdrop + conteneur modal générique
    settings.css       — panneau paramètres (nav, sliders, grille titres, textarea CSS)
    palette.css / help.css / welcome.css / about.css / drop.css
  shared/
    menu.css / kbd.css / toast.css / transparency.css
  pdf/
    pdf.css
```

**Règle absolue** : aucune valeur codée en dur dans ces fichiers. Couleurs → `var(--token)`. Semi-transparences → `color-mix(in srgb, var(--token) N%, transparent)` ou `rgba(var(--shadow-color), N)`. Ombres → `var(--shadow-soft)` ou construction avec `--shadow-color`.

---

### 3. Variables ProseMark (pont tokens → éditeur)

Le composant `ProseMarkEditor` vit dans `.mdv-editor`. `app.css` pose sur ce sélecteur toutes les variables `--pm-*` attendues par ProseMark, en les faisant pointer sur les tokens du thème actif :

```css
.mdv-editor {
  --pm-link-color:            var(--accent);
  --pm-latex-math-error-color: var(--color-error);
  --pm-syntax-keyword:         var(--syntax-keyword);
  /* … */
}
```

Cela isole ProseMark du système de thèmes : il ne voit que ses propres variables, AZprose gère la liaison en amont.

---

### 4. CSS dynamique injecté à chaud

Trois balises `<style>` sont injectées dans `<head>` par `ProseMarkEditor.svelte` (via des `$effect` Svelte 5) et mises à jour à chaque changement de paramètre sans rechargement. Elles sont créées une seule fois puis réutilisées par ID.

#### `#mdv-prose-layout-css` — mise en page du mode actif

Généré par `resolveProseLayoutCss(style)` (mode écriture) ou `resolvePresLayoutCss(style)` (mode présentation), selon la prop `readOnly` du composant. Les deux modes ne peuvent pas coexister (une seule instance de `ProseMarkEditor` est montée à la fois), donc ils partagent sans conflit la même balise.

Mode écriture :
```css
.cm-editor .cm-scroller { padding: 28px 36px 96px; line-height: <lineHeight>; }
.cm-editor .cm-content  { font-size: <fontSize>px; max-width: <maxWidth>px; }
```

Mode présentation :
```css
.cm-editor .cm-scroller { padding: 32px 48px 64px; line-height: <presLineHeight>; }
.cm-editor .cm-content  { font-size: <presFontSize>px; max-width: <presMaxWidth>px; }
```

#### `#mdv-prose-content-css` — typographie du contenu rendu

Généré par `resolveProseContentCss(style)`. Injecte les règles qui ne sont **pas** surchargeables par le mode (elles s'appliquent toujours, quelle que soit la vue) :

```css
/* Headings */
.cm-html-widget h1 { font-size: <h1Size>em; text-align: <h1Align>; font-family: <h1Font>; margin: <mt>em 0 <mb>em; }
.cm-html-widget h2 { … }
.cm-html-widget h3 { … }

/* Ordered lists */
.cm-html-widget ol      { list-style-type: <olLevel1>; }
.cm-html-widget ol ol   { list-style-type: <olLevel2>; }
.cm-html-widget ol ol ol { list-style-type: <olLevel3>; }
```

#### `#mdv-prose-custom-css` — CSS libre de l'utilisateur

Contenu brut de la zone de texte CSS libre, sélectionné selon le mode :
- mode écriture → champ `customCss` de `ProseStyle`
- mode présentation → champ `presCss`

**Ordre de cascade délibéré** : `layout-css` → `content-css` → `custom-css`. Le CSS personnalisé a donc toujours la priorité sur les paramètres structurés — une règle identique dans la zone libre écrase n'importe quel slider ou sélecteur de l'interface.

---

### 5. Polices de l'éditeur prose

La police de rendu du texte Markdown est distincte de la police UI. Elle est définie à l'exécution via `hostEl.style.setProperty("--font", ...)` sur le nœud hôte du composant, en résolvant la clé stockée en stack CSS complète (fonction `resolveFontFamily`) :

| Clé | Stack résolue |
|---|---|
| `fira-sans` | `'Fira Sans', …` |
| `inter` | `'Inter', …` |
| `system` | `-apple-system, BlinkMacSystemFont, …` |
| `custom` | `'<nom saisi>', -apple-system, …` (fallback automatique si nom invalide) |

La police mono suit le même mécanisme via `--pm-code-font` (fonction `resolveMonoFont`).

---

### 6. Mode transparence

L'attribut `data-transparency="on"` sur `:root` active `transparency.css`, qui passe en `background: transparent !important` tous les éléments de chrome (titlebar, breadcrumb, statusbar, sidebar, onglets, éditeur). Le fond de l'application (`body`) est lui aussi rendu transparent, laissant le vibrancy natif (NSVisualEffectView / Acrylic) traverser l'ensemble. Les popovers conservent `--surface` pour rester lisibles.

---

### 7. Mode impression

`globals.css` contient deux déclencheurs d'impression complémentaires :

- **`body.mdv-print`** — classe ajoutée programmatiquement avant `window.print()`. Masque tous les éléments de chrome et étend le contenu en pleine page sur fond blanc. Nécessaire car WKWebView (Tauri) snapshote la disposition du DOM en direct plutôt qu'à l'événement `@media print`.
- **`@media print`** — règles standard pour les environnements qui honorent correctement ce media. Gère la pagination (`@page`) avec numérotation centrée en bas, sans en-têtes/pieds de page navigateur.

Le style de contenu en mode impression est actuellement partagé avec le mode normal (couleurs du thème remplacées par noir sur blanc). Une charte graphique spécifique à l'établissement est prévue en extension.

---

## Utilisateur

### Ce que l'utilisateur peut modifier

#### Paramètres › Normal (mode écriture)

| Paramètre | Contrôle | Plage |
|---|---|---|
| Police principale | Sélecteur | Fira Sans · Inter · Système · Personnalisée… |
| Nom de police personnalisée | Champ texte | Nom exact d'une police installée dans l'OS |
| Police monospace | Sélecteur | Fira Code · JetBrains Mono · Système |
| Taille de police | Curseur | 12 – 24 px (pas : 1 px) |
| Interligne | Curseur | 1,30 – 2,20 (pas : 0,05) |
| Largeur de colonne | Curseur | 500 – 1 200 px (pas : 10 px) |
| H1 — taille / alignement / police / espaces | Grille | 0,5 – 5 em · G/C/D · 5 familles · 0 – 5 em |
| H2 — idem | Grille | — |
| H3 — idem | Grille | — |
| Listes numérotées niveau 1 | Sélecteur | Numérique · Alpha · Romain min/maj |
| Listes numérotées niveau 2 | Sélecteur | idem |
| Listes numérotées niveau 3 | Sélecteur | idem |
| CSS personnalisé | Zone de texte libre | Toutes règles CSS valides (priorité max.) |

#### Paramètres › Présentation (mode SlideDeck)

| Paramètre | Contrôle | Plage | Portée |
|---|---|---|---|
| Police principale | Sélecteur | Fira Sans · Inter · Système · Personnalisée… | partagée |
| Nom de police personnalisée | Champ texte | Nom exact d'une police OS | partagée |
| Police monospace | Sélecteur | Fira Code · JetBrains Mono · Système | partagée |
| Taille de police | Curseur | 12 – 32 px (pas : 1 px) | présentation |
| Interligne | Curseur | 1,30 – 2,20 (pas : 0,05) | présentation |
| Largeur de colonne | Curseur | 500 – 1 400 px (pas : 10 px) | présentation |
| H1/H2/H3 — taille, alignement, police, espaces | Grille | idem Normal | partagée |
| Listes numérotées niveau 1/2/3 | Sélecteur | idem Normal | partagée |
| CSS personnalisé | Zone de texte libre | Toutes règles CSS valides (priorité max.) | présentation |

**Partagée** : la même valeur est utilisée en mode Normal et en mode Présentation. Modifier dans l'un des deux panneaux affecte les deux vues.
**Présentation** : valeur indépendante, sans impact sur le mode Normal.

#### Paramètres › MathJax

- **Packages actifs** — grille de cases à cocher (extensions physics, boldsymbol, etc.)
- **Macros LaTeX globales** — zone de texte libre (`\newcommand`, `\DeclareMathOperator`…) appliquée avant chaque rendu de formule

#### Chrome de l'application

- **Thème** — sélecteur dans la barre de statut ; 14 thèmes nommés + 2 alias `light` / `dark`
- **Transparence** — toggle ; active le vibrancy natif sur toute la fenêtre

#### À venir

- **Mode impression / charte établissement** — fichier CSS séparé, non lié aux thèmes runtime, permettant d'appliquer la charte graphique de l'établissement (couleurs institutionnelles, logo, polices maison) lors de l'export PDF ou de l'impression papier
