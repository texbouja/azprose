# Intégration Typst dans AZprose

> ⛔ **OBSOLÈTE / ABANDONNÉ.** Cette feuille de route décrit l'idée d'utiliser Typst
> comme moteur de rendu des maths Markdown (preview/présentation). Approche **abandonnée**.
> MathJax reste l'unique moteur de maths côté Markdown.
> La direction actuelle est l'**éditeur Typst** (`.typ`, live preview SVG + export PDF) :
> voir [`editeur_typst.md`](editeur_typst.md). Document conservé pour archive uniquement.

> Feuille de route — juin 2026

## Principes directeurs

| Couche | Moteur |
|---|---|
| **Prose** (édition WYSIWYG) | MathJax — inchangé |
| **Preview** (MarkdownPreview) | Rust crate `typst_render` via IPC |
| **Presentation** (SlideDeck) | Rust crate `typst_render` via IPC + pagination Rust |
| **Export PDF** | Rust crate `typst_export_pdf` via IPC |

MathJax reste le moteur *éditorial* dans ProseMarkEditor. Typst devient le moteur de *rendu* pour la visualisation et l'export.

**Pas de WASM** — le crate Rust natif est plus performant (compilation native vs WASM) et ne nécessite aucun téléchargement navigateur. **Pas de `markdown-it-typst`** (wrapper WASM encombrant, déconseillé par son auteur pour le navigateur).

---

## Pipeline hybride (retenue)

```
Source markdown + preamble LaTeX
    │
    ├─► Prose : markdown-it + MathJax (inchangé)
    │
    └─► Preview / Presentation :
          │
          ├─1. Rendu markdown → HTML par markdown-it
          │   (math en <span class="math">\(...\)</span>)
          │
          ├─2. Extraire toutes les formules du HTML
          │   → liste de strings LaTeX
          │
          ├─3. tex2typst(tex) → Typst
          │   (conversion LaTeX → Typst, côté frontend)
          │
          ├─4. invoke("typst_render", { source: typstInline })
          │   → SVG (chaque formule individuellement)
          │
          ├─5. Injecter les SVGs dans le DOM
          │   (remplacer les spans math)
          │
          └─6. Preamble : tex2typst(preamble) → préfixé
              à chaque appel typst_render
```

Le résultat est du HTML standard avec des SVGs Typst pour les formules. Le layout (headings, listes, code, images) reste géré par markdown-it + CSS.

Export PDF :
```
Source → markdown-it → HTML (non applicable)

→ Solution : tex2typst(preamble + body) → document Typst complet
  → invoke("typst_export_pdf") → fichier .pdf
```

Pour l'export PDF, on ne peut pas passer par l'HTML. On produit un document Typst complet :
- Preamble Typst (issu de `tex2typst(preamble)`)
- Contenu : chaque slide/bloc converti en section Typst

---

## tex2typst — conversion LaTeX → Typst

- **npm** : `tex2typst` (déjà installé en `^0.6.2`)
- **Rôle** : convertir le preamble LaTeX de l'utilisateur et les formules `$...$` / `$$...$$` en syntaxe Typst
- **Poids** : < 20 KB compressé
- **API** : `tex2typst(tex, { wrapUnknownCommands: true })`

### Preamble utilisateur

Stocké dans `mathJaxPreamble` store (localStorage). Au moment du rendu Typst :

```typescript
const latexPreamble = mathJaxPreamble.current;       // LaTeX, écrit par l'utilisateur
const typstPreamble = tex2typst(latexPreamble, {
  isPreamble: true,
  wrapUnknownCommands: true,
});
// typstPreamble exemple :
// #let textbf(body) = { text(weight: "bold", body) }
// #let mathbb(body) = { math.class("bb", body) }
// #let vect(body) = { math.bold(body) }
```

**Stockage unique, conversion automatique.** L'utilisateur n'a rien à changer.

### Ce que `tex2typst` couvre

| LaTeX | Typst |
|---|---|
| `\frac{a}{b}` | `(a)/(b)` ou `frac(a, b)` |
| `\sum_{i=1}^n` | `sum_(i=1)^n` |
| `\alpha \beta \gamma` | `alpha beta gamma` |
| `\operatorname{argmax}` | `"argmax"` |
| `\mathbf{x}` | `bold(x)` |
| `\mathcal{L}` | `math.class("cal", L)` |
| `\newcommand{\vect}[1]{\boldsymbol{#1}}` | `#let vect(body) = {$bold(body)$}` |

### Limites

- `\usepackage` ignoré (pas de packages LaTeX en Typst)
- `\newtheorem` ignoré (à faire avec `#figure` Typst manuellement)
- Commandes inconnues → passées en l'état (avec warning)

---

## Backend Rust — typst_engine

Module `src-tauri/src/typst_engine/mod.rs` (déjà implémenté).

### Architecture

```rust
// RenderWorld minimal — mono-source, pas d'accès fichier
struct RenderWorld {
    source: String,
    fonts: FontStore,
}
impl World for RenderWorld {
    fn source(&self, _: FileId) -> Result<&str> { Ok(&self.source) }
    fn font(&self, id: SmolStr) -> Result<FontRef> { self.fonts.get(id) }
    fn file(&self, _: FileId) -> FileResult { Err(FileError::AccessDenied) }
    // ...
}
```

### Commandes Tauri

```rust
#[tauri::command]
#[cfg(feature = "typst")]
fn typst_render(source: String) -> Result<String, String> {
    // Compile + retourne le SVG de la première page
    // (formule individuelle = 1 page width:auto height:auto)
    let world = RenderWorld::new(&source);
    let doc = typst::compile(&world).map_err(|e| diagnostics_to_string(&e))?;
    let svg = typst_svg::svg(&doc.pages[0]);
    Ok(svg)
}

#[tauri::command]
#[cfg(feature = "typst")]
fn typst_export_pdf(source: String, path: String) -> Result<(), String> {
    let world = RenderWorld::new(&source);
    let doc = typst::compile(&world).map_err(|e| e.to_string())?;
    let pdf = typst_pdf::pdf(&doc, &PdfOptions::default());
    std::fs::write(&path, pdf).map_err(|e| e.to_string())?;
    Ok(())
}

// Pour la pagination SlideDeck
#[tauri::command]
#[cfg(feature = "typst")]
fn typst_page_count(source: String) -> Result<usize, String> {
    let world = RenderWorld::new(&source);
    let doc = typst::compile(&world).map_err(|e| e.to_string())?;
    Ok(doc.pages.len())
}
```

### Feature flag

```toml
[features]
typst = [
  "dep:typst", "dep:typst-svg", "dep:typst-pdf",
  "dep:typst-layout", "dep:typst-kit",
]
```

Sans `--features typst`, le module et les commandes sont exclus du binaire.

---

## Cache LRU (formules compilées)

Les Preview/Presentation peuvent compiler des dizaines de formules à chaque rendu. Les formules inchangées entre deux rendus doivent être servies depuis un cache.

### Côté frontend

```typescript
class TypstCache {
  private cache = new Map<string, { svg: string; ts: number }>();
  private max = 500;

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    entry.ts = Date.now(); // LRU bump
    return entry.svg;
  }

  set(key: string, svg: string): void {
    if (this.cache.size >= this.max) {
      // Évincer le plus vieux
      let oldest = Infinity, oldestKey = "";
      for (const [k, v] of this.cache) {
        if (v.ts < oldest) { oldest = v.ts; oldestKey = k; }
      }
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { svg, ts: Date.now() });
  }
}
```

La clé est le hash de la formule après `tex2typst`.

### Côté Rust (optionnel)

Pour les sessions longues, on peut ajouter un `Mutex<HashMap<u64, String>>` dans l'état Tauri avec un nombre max d'entrées. Le hash est passé depuis le frontend. Utile si le cache frontend est perdu (reload).

---

## Gestion des erreurs

### Échec `tex2typst`
- `tex2typst` est synchrone et local — échec quasi impossible
- Si une commande est inconnue, `wrapUnknownCommands: true` la préserve
- Fallback : la formule est passée telle quelle à Typst (qui échouera → géré par l'étape suivante)

### Échec `typst_render` (IPC)
- Retourne `Err(String)` avec le message de diagnostic
- Le composant affiche la formule dans un `<code>` rouge avec l'erreur en tooltip
- Pas de crash, pas de blank screen

```svelte
{#if error}
  <span class="typst-error" title={error}>
    {originalLatex}
  </span>
{/if}
```

### Timeout
- `invoke("typst_render")` avec un timeout de 5 secondes
- Si timeout → formules non rendues marquées "⏳" + retry button

---

## Phases d'implémentation détaillées

### Phase 1 — Base Rust ✅ (fait)

Fichiers : `src-tauri/src/typst_engine/mod.rs`, `src-tauri/src/lib.rs`

- `RenderWorld`, `FontStore`
- `typst_render` (SVG page unique)
- Enregistrement conditionnel des commandes dans `invoke_handler`
- `cargo check --features typst` OK

### Phase 2 — Export PDF ✅ (fait)

Fichiers : `src-tauri/src/typst_engine/mod.rs`

- `typst_export_pdf(source, path)`
- `typst_pdf::pdf()` avec options par défaut
- `fs::write` du résultat

### Phase 3 — tex2typst frontend ✅ (fait)

Fichiers : `package.json`, `src/lib/markdown-render.ts`

- `bun add tex2typst@^0.6.2`
- Type `MathEngine = "mathjax" | "typst"`
- `renderMarkdown()` accepte `mathEngine` param
- `tex2typst(content)` quand `mathEngine === "typst"`

### Phase 4 — Preview hybride ✅ (structure faite, logique de compilation à compléter)

Fichiers : `src/components/preview/MarkdownPreview.svelte`, `src/components/preview/LazyMarkdownPreview.svelte`

**Actuel :** prop `mathEngine`, MathJax chargé dynamiquement seulement si `mathEngine === "mathjax"`.

**À compléter :** quand `mathEngine === "typst"` :
1. Extraire les formules du HTML rendu (sélecteur `.math`, `\(...\)` / `\[...\]`)
2. Pour chaque formule unique → `tex2typst()` → cache lookup → si miss → `invoke("typst_render")` → stocker dans cache
3. Remplacer les `.math` spans par des `<span class="typst-rendered">${svg}</span>`
4. Gérer le preamble : `tex2typst(preamble)` préfixé à chaque appel

**Détail extraction :**
```typescript
function extractMath(html: string): string[] {
  // markdown-it + math plugin produit <span class="math">\(...\)</span>
  // ou $$...$$ en display math
  const regex = /<span class="math">\\(([^)]*)\\)<\/span>/g;
  const formulas: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    formulas.push(match[1]);
  }
  return formulas;
}
```

### Phase 5 — Presentation hybride ✅ (structure faite)

Fichiers : `src/components/editor/SlideDeck.svelte`

**Actuel :** prop `mathEngine`, `hydrate()` charge MathJax dynamiquement si `mathEngine === "mathjax"`, skip si `"typst"`.

**À compléter :** même logique d'extraction/injection que Phase 4, mais appliquée à la slide courante seulement.

### Phase 6 — Coupures auto SlideDeck

Fichiers : `src/components/editor/SlideDeck.svelte`, `src-tauri/src/typst_engine/mod.rs`

#### Nouvelle commande Rust

Cette commande évalue si le contenu d'une slide déborde :

```rust
#[tauri::command]
#[cfg(feature = "typst")]
fn typst_check_page_break(source: String) -> Result<PageBreakInfo, String> {
    let world = RenderWorld::new(&source);
    let doc = typst::compile(&world).map_err(|e| e.to_string())?;

    // Analyser les sauts de page
    // Retourner les positions de coupure potentielles
    Ok(PageBreakInfo {
        page_count: doc.pages.len(),
        // Indice : fin naturelle du contenu dans la page
        // (basé sur le nœud le plus bas de chaque page)
        break_positions: compute_breaks(&doc),
    })
}
```

#### Logique frontend

```typescript
// Au chargement d'une slide
if (mathEngine === "typst") {
  const info = await invoke<PageBreakInfo>("typst_check_page_break", {
    source: typstSource
  });
  if (info.page_count > 1) {
    // Option 1 : insérer --- automatiquement (modifie le document)
    // Option 2 : afficher un indicateur visuel
    showBreakIndicator(info.break_positions);
  }
}
```

Deux modes (paramétrable dans les settings SlideDeck) :
- **Mode suggestion** : barre orange en bas de la slide + message "⤵ contenu déborde"
- **Mode auto** : insert `---` au point de coupure optimal (déduit de l'arbre Typst)

#### Règle de priorité
- Les `---` manuels écrits par l'utilisateur sont toujours respectés
- La détection auto ne s'applique qu'entre les séparateurs manuels
- `\pagebreak` LaTeX (converti en `#pagebreak()` par `tex2typst`) est conservé

### Phase 7 — Prose inchangé

Aucun fichier à modifier. Vérifier que `ProseMarkEditor.svelte` conserve son import `mathjax/tex-svg.js` et son appel `MathJax.typesetPromise()`.

---

## Détail des appels IPC pour chaque formule

Pour minimiser les IPC, on regroupe les formules par session :

```typescript
async function renderMathBatch(latexFormulas: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (const latex of latexFormulas) {
    const cacheKey = hash(latex);
    const cached = typstCache.get(cacheKey);
    if (cached) {
      results.set(latex, cached);
      continue;
    }

    const typstSource = preambleTypst + "\n$ " + tex2typst(latex) + " $";
    try {
      const svg = await invoke<string>("typst_render", { source: typstSource });
      typstCache.set(cacheKey, svg);
      results.set(latex, svg);
    } catch (err) {
      results.set(latex, `<span class="typst-error">${escapeHtml(latex)}</span>`);
    }
  }

  return results;
}
```

### Optimisations possibles
- **Batch** : envoyer toutes les formules en un seul IPC sous forme de array (commande `typst_render_batch`)
- **Debounce** : ne pas relancer le rendu à chaque frappe, attendre 300ms d'inactivité
- **Limit preview** : ne rendre que les formules visibles dans le viewport

---

## Images dans le flux hybride

Les images markdown `![alt](path)` sont rendues en `<img>` par markdown-it. En mode `mathEngine === "typst"` :
- Les images locales sont résolues par `resolveLocalImages()` (déjà existant dans la codebase)
- Les SVGs Typst injectés côtoient les `<img>` HTML sans conflit
- Les images dans l'export PDF sont un problème séparé (le document complet Typst doit référencer des chemins absolus — peut nécessiter un `FileId` réel dans `RenderWorld`)

Pour l'export PDF uniquement : activer un `RenderWorld` avec accès fichier limité au dossier du document.

---

## Syntax highlighting (Shiki)

Le code markdown est déjà traité par Shiki (actuellement côté frontend dans `markdown-render.ts`). En mode hybride :
- Les fenced code blocks sont rendus en HTML par Shiki (inchangé)
- Les SVGs Typst pour les maths sont injectés autour

---

## Tests

| Phase | Test | Commande |
|---|---|---|
| 1 | `cargo check --features typst` | ✅ OK |
| 1 | `cargo check` (sans feature) | ✅ OK |
| 2 | `cargo build --features typst` | ✅ OK |
| 3 | `import { tex2typst } from "tex2typst"` tourne dans WebView | ✅ OK |
| 4 | Rendu d'un markdown avec `$E=mc^2$` → SVG injecté | À faire manuellement |
| 5 | SlideDeck rend une slide avec formules | À faire manuellement |
| 6 | Slide débordante → indicateur de coupure | À faire |
| 7 | ProseMarkEditor toujours opérationnel | Vérifier |

### Tests automatisés (Phase 6+)

```typescript
// bun test : src/lib/__tests__/typst-cache.test.ts
describe("TypstCache", () => {
  it("retourne null pour clé inconnue", () => {
    const cache = new TypstCache();
    expect(cache.get("nonexistent")).toBeNull();
  });
  it("stocke et retourne une valeur", () => {
    const cache = new TypstCache();
    cache.set("a", "<svg>...</svg>");
    expect(cache.get("a")).toBe("<svg>...</svg>");
  });
  it("évince les plus vieux quand le cache est plein", () => {
    const cache = new TypstCache(2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3"); // 'a' évincé
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("2");
  });
});
```

---

## Résumé des fichiers modifiés par phase

| Phase | Fichiers |
|---|---|
| 1 | `src-tauri/Cargo.toml`, `src-tauri/src/typst_engine/mod.rs` (créé), `src-tauri/src/lib.rs` |
| 2 | `src-tauri/src/typst_engine/mod.rs` (ajout commande) |
| 3 | `package.json`, `src/lib/markdown-render.ts` |
| 4 | `src/components/preview/MarkdownPreview.svelte`, `src/lib/markdown-render.ts` |
| 5 | `src/components/editor/SlideDeck.svelte` |
| 6 | `src/components/editor/SlideDeck.svelte`, `src-tauri/src/typst_engine/mod.rs` |
| 7 | Aucun |

---

## État courant (master 703c303)

- ✅ Phase 1 : typst_engine, commands, feature flag
- ✅ Phase 2 : typst_export_pdf
- ✅ Phase 3 : tex2typst (bun add), MathEngine type, param renderMarkdown
- ✅ Phase 4 (structure) : MarkdownPreview + LazyMarkdownPreview — prop mathEngine
- ✅ Phase 5 (structure) : SlideDeck — prop mathEngine, hydrate adapté
- ⬜ Phase 4 (logique) : extraction + IPC + injection SVG
- ⬜ Phase 5 (logique) : idem pour SlideDeck
- ⬜ Phase 6 : pagination automatique
- ✅ Phase 7 : Prose inchangé

## Risques

| Risque | Sévérité | Mitigation |
|---|---|---|
| **tex2typst ne couvre pas tous les cas** | Moyenne | Tester sur preambles réels ; `wrapUnknownCommands: true` |
| **Taille binaire Rust** | Moyenne | Feature flag ; build conditionnel |
| **Latence compilation par formule (~5-50 ms)** | Faible | Cache LRU + debounce + viewport-only |
| **Divergence visuelle Prose ↔ Preview** | Faible | Différences mineures acceptables |
| **Formule trop grande pour <span> SVG** | Faible | CSS overflow: visible sur le span |
| **Images dans export PDF** | Moyenne | RenderWorld avec accès fichier au dossier du document |
