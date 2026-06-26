# Profiling du démarrage — AZprose (Tauri 2 + Svelte 5 + WebKitGTK)

## Contrainte clé : `console.log` n'est pas lisible depuis le terminal

Sous Linux avec WebKitGTK, les `console.log` du webview **ne s'affichent pas dans le terminal**. Ni `stdout`, ni `stderr` du processus Rust ne les retransmet. Les seules options natives sont :

- Le remote inspector WebKit (`WEBKIT_INSPECTOR_SERVER=127.0.0.1:9222`) — complexe à scripter
- Écrire dans un fichier via `@tauri-apps/plugin-fs` — bloqué par la portée du scope Tauri
- **Passer par une commande Rust personnalisée avec `eprintln!`** → c'est ce qui fonctionne

---

## Méthode de profiling : commande Rust `log_perf`

### 1. `src-tauri/src/lib.rs` — ajouter la commande

```rust
#[tauri::command]
fn log_perf(data: String) {
    eprintln!("[az:perf]\n{data}");
}
```

L'enregistrer dans `invoke_handler` :

```rust
.invoke_handler(tauri::generate_handler![
    take_pending_open_files,
    reveal_in_file_manager,
    log_perf,          // ← ajouter
])
```

`eprintln!` écrit sur stderr du processus Rust, qui **est** capturé par le terminal lors d'un `bun run tauri dev`.

### 2. `src/main.ts` — marques de timing

```typescript
performance.mark("az:main-start");   // avant les imports (s'exécute après leur résolution)
import { mount } from "svelte";
import App from "./app.svelte";
import "./styles/globals.css";
performance.mark("az:mount-call");

// ...

mount(App, { target: document.getElementById("root")! });
performance.mark("az:mount-done");
```

> **Note** : en ES modules, les `performance.mark()` déclarés avant les `import` s'exécutent quand même *après* la résolution de tous les imports. La marque `az:main-start` mesure donc le temps cumulé de chargement de tous les modules.

### 3. `src/app.svelte` — envoi du rapport via invoke

Dans `onMount`, dans le `requestAnimationFrame` existant :

```typescript
onMount(() => {
  performance.mark("az:onmount");
  requestAnimationFrame(() => {
    performance.mark("az:first-raf");

    // ... suppression du boot screen ...

    void (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const marks: Record<string, number> = {};
      for (const e of performance.getEntriesByType("mark")) marks[e.name] = Math.round(e.startTime);
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const top = resources
        .map(r => ({ name: r.name.replace(/.*\//, ""), dur: Math.round(r.duration), size: Math.round((r as any).transferSize ?? 0) }))
        .sort((a, b) => b.dur - a.dur)
        .slice(0, 20);
      await invoke("log_perf", { data: JSON.stringify({
        marks,
        nav: { domInteractive: Math.round(nav?.domInteractive ?? 0), domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0) },
        totalResources: resources.length,
        topByDuration: top,
      }, null, 2) });
    })();
  });
});
```

### 4. Lancer et capturer

```bash
lsof -ti:1420 | xargs kill -9 2>/dev/null
LOGFILE="/tmp/azprose-perf.log"
bun run tauri dev >"$LOGFILE" 2>&1 &
sleep 40   # attend la recompilation Rust (~15s) + le chargement du webview
grep -A 200 "\[az:perf\]" "$LOGFILE"
```

Le délai de 40 s est nécessaire car un changement dans `lib.rs` déclenche une recompilation Rust (~15 s). Sans changement Rust, 30 s suffisent.

### 5. Nettoyer après mesure

Retirer les `performance.mark()` de `main.ts` et `app.svelte`, et supprimer `log_perf` + son enregistrement de `lib.rs`.

---

## Résultats comparatifs (juin 2025)

### Avant — `lucide-svelte` non-bundlé (250 ressources dont 203 icônes)

| Événement | Temps |
|---|---|
| `az:main-start` (fin du module loading) | 10 039 ms |
| `az:mount-done` (Svelte monté) | 10 138 ms (+96 ms) |
| `az:first-raf` (premier frame rendu) | 10 268 ms |
| `domInteractive` | 116 ms |
| `domContentLoaded` | 10 151 ms |
| **Total resources** | **250** |
| dont fichiers `.svelte` lucide | 203 × ~130 ms = 25 492 ms cumulés |
| dont fichiers app/lib | 17 × ~175 ms = 3 241 ms cumulés |
| Top ressource | `main.ts` : 1 610 ms |

### Après — `src/lib/icons.ts` inline SVG (136 ressources, 0 icône lucide)

| Événement | Temps |
|---|---|
| `az:main-start` (fin du module loading) | 2 389 ms |
| `az:mount-done` (Svelte monté) | 2 465 ms (+76 ms) |
| `az:first-raf` (premier frame rendu) | 2 676 ms |
| `domInteractive` | 117 ms |
| `domContentLoaded` | 2 481 ms |
| **Total resources** | **136** |
| dont fichiers `.svelte` lucide | **0** |
| Top ressource | `globals.css` : 1 858 ms |

### Gain

| Métrique | Avant | Après | Gain |
|---|---|---|---|
| Premier frame rendu | 10 268 ms | 2 676 ms | **−7 592 ms (−74 %)** |
| `domContentLoaded` | 10 151 ms | 2 481 ms | **−7 670 ms (−76 %)** |
| Nombre de ressources | 250 | 136 | −114 fichiers |
| Fichiers lucide chargés | 203 | 0 | −203 |

---

## Nouveaux goulots d'étranglement (top 20 après migration)

| Durée | Fichier | Catégorie |
|---|---|---|
| 1 858 ms | `globals.css` | CSS global |
| 1 305 ms | `app.svelte` | Composant racine |
| 659 ms | `app.css` | CSS app |
| 566 ms | `zh.json` | Locale |
| 565 ms | `pt-BR.json` | Locale |
| 564 ms | `ko.json` | Locale |
| 564 ms | `ja.json` | Locale |
| 559 ms | `command-search.ts` | Lib |
| 559 ms | `csv.ts` | Lib |
| 559 ms | `platform.ts` | Lib |
| 558 ms | `commands.ts` | Lib |
| 553 ms | `ImageViewer.svelte` | Composant |
| 553 ms | `files.ts` | Lib |
| 553 ms | `editor-languages.ts` | Lib |
| 553 ms | `it.json` | Locale |
| 552 ms | `es.json` | Locale |
| 549 ms | `de.json` | Locale |
| 549 ms | `fr.json` | Locale |
| 549 ms | `en.json` | Locale |
| 549 ms | `storage.ts` | Lib |

Les ressources chargent maintenant **en parallèle** (plus de cascade en série) — le temps mur est dominé par le fichier le plus lent (~1 858 ms), pas par la somme. Les 9 locales (~550 ms chacune) se chargent simultanément.

### Pistes d'optimisation restantes

| Cible | Gain potentiel | Complexité |
|---|---|---|
| Lazy-load des locales non-actives | ~−500 ms si seule la locale active est chargée au boot | Moyenne |
| `globals.css` — split ou inlining critique | Variable | Faible |
| Lazy-load `ImageViewer`, `PdfViewer` | Négligeable en dev (déjà lazy en prod via `LazyPdfViewer`) | Faible |
| `commands.ts` — chargement différé | ~−550 ms si chargé à la première ouverture de la palette | Moyenne |

---

## Cause racine (rappel)

La configuration suivante dans `vite.config.ts` empêchait Vite de pré-bundler lucide-svelte :

```typescript
optimizeDeps: { exclude: ["lucide-svelte"] }
ssr: { noExternal: ["lucide-svelte"] }
```

Sans pré-bundling, Vite servait chaque icône comme fichier HTTP séparé. Le barrel `index.ts` de lucide déclenchait le chargement de **toutes** les icônes disponibles (pas seulement celles utilisées), créant une cascade de 203 requêtes à ~130 ms chacune dans WebKitGTK.


L'exclusion était nécessaire car le pré-bundler esbuild de Vite ne passe pas par le plugin Svelte et ne peut pas appliquer `runes: false` aux icônes Svelte 4. En production (Rollup), ce problème n'existait pas.

**Fix** : remplacement de tous les imports `lucide-svelte` par `src/lib/icons.ts` qui exporte les paths SVG comme strings TypeScript — pattern tiré de `markamd/src/components/editor/diagram-viewer.tsx`.

---

## Pièges rencontrés pendant le profiling

| Problème | Cause | Solution |
|---|---|---|
| `console.log` invisible | WebKitGTK ne route pas les logs webview vers le terminal | Commande Rust + `eprintln!` |
| `writeTextFile("/tmp/...")` silencieux | La portée `fs:scope` Tauri ne couvre pas `/tmp` | Passer par `invoke` |
| `writeTextFile("~/.claude/...")` aussi ignoré | Même problème de scope pour les chemins absolus inattendus | Passer par `invoke` |
| Port 1420 déjà utilisé | L'ancien binaire `azprose` reste en vie après `kill` du process bun | `lsof -ti:1420 \| xargs kill -9` avant de relancer |
| Délai trop court (25 s) | Recompilation Rust non terminée, webview pas encore chargé | Utiliser 40 s si `lib.rs` a changé, 30 s sinon |
| Les `performance.mark()` avant `import` ne mesurent pas le boot seul | Les `import` ES module sont hoistés et résolus avant toute instruction | Normal — la marque mesure quand même le module loading waterfall |
