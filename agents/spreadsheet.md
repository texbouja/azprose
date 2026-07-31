# Analyse et Plan Spreadsheet — SQLite + IPC Tauri

## Décisions utilisateur (2026-07-30)

1. **Parsing import** : garder `@svar-ui/excel-import-store` (frontend). `calamine` (Rust) conservé pour usage futur.
2. **Colonnes** : format natif jspreadsheet (`[{title, width, type, ...}]`).
3. **CSV dans l'éditeur** : toujours en texte simple. Aucun lien avec spreadsheet. Point d'entrée unique = "Importer".
4. **SQLite direct** — pas de phase JSON transitoire.
5. **Pas de bouton Save** — persistence automatique (debounce + tab close).
6. **Lazy imports** via Command Palette (colonne `lazy_type`/`lazy_source`/`lazy_config` en SQLite).
7. **Breadcrumb** dans Tools (avec Calendrier) pour lancer le composant générique.
8. **SQLite aussi pour** colloscope et potentiellement SVAR (datagrid, calendar).

---

## 1. Faisabilité SQLite + Tauri IPC — Analyse approfondie

### ✅ Verdict : architecture saine, pas d'impasse

| Critère | Évaluation |
|---------|-----------|
| **Thread safety** | `Mutex<Option<Connection>>` — pattern déjà utilisé dans le codebase (LspBridgeState, PendingOpenFiles). OK. |
| **Sync vs async** | Commandes sync (`#[tauri::command] fn`) → Tauri 2 les exécute sur un thread pool, pas de blocage UI. |
| **Payload size** | 1000×20 cellules ~500KB JSON. Tauri IPC = mémoire partagée (pas réseau). OK jusqu'à ~10K cellules. |
| **Binary data** | Pas de blob dans SQLite pour les spreadsheets. Le parsing (xlsx) se fait côté frontend via `@svar-ui/excel-import-store`. OK. |
| **Migration** | `PRAGMA user_version` pour le versioning de schéma. |
| **rootPath** | Passé en paramètre de chaque commande (pattern existant dans `lib.rs`). |
| **Scalabilité future** | Une seule connexion SQLite par projet. Peut s'étendre à colloscope, SVAR. |

### Pattern de connexion validé

```rust
use std::sync::Mutex;
use rusqlite::Connection;

pub struct SpreadsheetDb(pub Mutex<Option<(String, Connection)>>);
//                               └── (root_path, connection)

// Helper pour éviter de répéter l'init dans chaque commande
fn with_db<F, R>(state: &State<SpreadsheetDb>, root: &str, f: F) -> Result<R, String>
where F: FnOnce(&Connection) -> Result<R, String>
{
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    
    // Init ou reconnexion si root a changé
    let needs_init = match &*guard {
        Some((r, _)) => r != root,
        None => true,
    };
    if needs_init {
        let db_path = Path::new(root).join(".azprose/spreadsheet.db");
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        conn.execute_batch(SCHEMA_SQL).map_err(|e| e.to_string())?;
        *guard = Some((root.to_string(), conn));
    }
    
    let (_, conn) = guard.as_ref().unwrap();
    f(conn)
    // guard dropped → lock released
}
```

**Points clés :**
- `rusqlite::Connection` implémente `Send` → `Mutex<Connection>` est `Send + Sync` ✓
- Pas de `MutexGuard::map` nécessaire — on garde le guard dans la fonction
- Pas de `tokio::sync::Mutex` — les commandes sync n'ont pas besoin d'être `Send` entre await points
- Pas de pool de connexion — une seule connexion par projet suffit pour un usage mono-utilisateur

### Pourquoi pas `tauri-plugin-sql` ?

Le plugin officiel Tauri expose SQLite directement au frontend via `Database::load("sqlite:path.db")`. C'est plus simple mais :

| Aspect | `rusqlite` direct | `tauri-plugin-sql` |
|--------|-------------------|---------------------|
| Contrôle | Total (schéma, migrations, transactions) | Limitée aux API du plugin |
| Sécurité | Requêtes paramétrées côté Rust | Requêtes SQL depuis le frontend (risque injection) |
| Multiple DBs | Parfait (HashMap<root, Connection>) | Limité à une DB |
| Migration | `PRAGMA user_version` + scripts | Plugin migrations (limité) |
| Données binaires | Contrôle total | Support basique |

**Conclusion : `rusqlite` direct** — plus de contrôle, pas de dépendance plugin, pattern déjà validé.

---

## 2. Schéma SQLite

### Choix : base unique `.azprose/data.db`

Avantages d'une base unique :
- Connexion unique (un seul `Mutex<Connection>`)
- Migrations coordonnées
- Requêtes inter-tables possibles (ex: lier un spreadsheet à un colloscope)
- Namespacing par préfixe de table : `spreadsheet_*`, `colles_*`, `svar_*`

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA user_version = 1;

-- ── Spreadsheets ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS spreadsheets (
    id TEXT PRIMARY KEY,                          -- UUID v4
    name TEXT NOT NULL,                           -- nom d'affichage
    original_path TEXT,                           -- chemin source importé
    lazy_type TEXT,                               -- NULL | 'colloscope' | 'auto-import' | ...
    lazy_source TEXT,                             -- path ou commande pour re-import
    lazy_config TEXT,                             -- JSON config pour composant lazy
    imported_at TEXT NOT NULL,                    -- ISO-8601
    updated_at TEXT NOT NULL                      -- ISO-8601
);

CREATE TABLE IF NOT EXISTS spreadsheet_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spreadsheet_id TEXT NOT NULL REFERENCES spreadsheets(id) ON DELETE CASCADE,
    col_index INTEGER NOT NULL,                   -- 0-based
    title TEXT NOT NULL DEFAULT '',                -- A, B, C... ou header importé
    width INTEGER DEFAULT 120,
    type TEXT DEFAULT 'text',                     -- type jspreadsheet natif
    options TEXT,                                 -- JSON options jspreadsheet (dropdown, etc.)
    UNIQUE(spreadsheet_id, col_index)
);

CREATE TABLE IF NOT EXISTS spreadsheet_cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spreadsheet_id TEXT NOT NULL REFERENCES spreadsheets(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    col_index INTEGER NOT NULL,
    value TEXT DEFAULT '',                         -- valeur brute (formules stockées en texte)
    style TEXT DEFAULT '',                         -- CSS string jspreadsheet
    UNIQUE(spreadsheet_id, row_index, col_index)
);

CREATE TABLE IF NOT EXISTS spreadsheet_state (
    spreadsheet_id TEXT PRIMARY KEY REFERENCES spreadsheets(id) ON DELETE CASCADE,
    hidden_columns TEXT DEFAULT '[]',              -- JSON array
    hidden_rows TEXT DEFAULT '[]',                 -- JSON array
    frozen_columns INTEGER DEFAULT 0,
    frozen_rows INTEGER DEFAULT 0,
    sort_column INTEGER,
    sort_order TEXT                                -- 'asc' | 'desc'
);

CREATE INDEX IF NOT EXISTS idx_cells_lookup 
    ON spreadsheet_cells(spreadsheet_id, row_index, col_index);
CREATE INDEX IF NOT EXISTS idx_columns_order 
    ON spreadsheet_columns(spreadsheet_id, col_index);

-- ── Extensions futures ──────────────────────────────────────
-- Colloscope : colles_* tables
-- SVAR DataGrid : svar_grid_* tables
-- SVAR Calendar : svar_calendar_* tables
```

### Stratégie de migration

```rust
const SCHEMA_V1: &str = "CREATE TABLE ..."; // tout le schéma ci-dessus
const SCHEMA_V2: &str = "ALTER TABLE spreadsheets ADD COLUMN ...";

fn init_db(conn: &Connection) -> Result<(), String> {
    let version: i32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap_or(0);
    
    if version < 1 { conn.execute_batch(SCHEMA_V1).map_err(|e| e.to_string())?; }
    if version < 2 { conn.execute_batch(SCHEMA_V2).map_err(|e| e.to_string())?; }
    // etc.
    
    conn.pragma_update(None, "user_version", &LATEST_VERSION)
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

---

## 3. Architecture Auto-Save (pas de bouton Save)

### Stratégie

```
┌──────────────────────────────────────────────────────────┐
│  SpreadsheetViewer.svelte                                 │
│                                                            │
│  onchange(col, row, value) ──────────────────────────────┐ │
│    └─ debounce(500ms) → invoke("save_cells", {changes})  │ │
│                                                            │ │
│  Column resize → debounce(200ms)                          │ │
│    └─ invoke("save_state", {columnWidths, ...})           │ │
│                                                            │ │
│  Hide/Show → immediate                                    │ │
│    └─ invoke("save_state", {hiddenColumns, ...})          │ │
│                                                            │ │
│  onDestroy (tab close) ───────────────────────────────────┐ │
│    └─ invoke("save_all", {fullData, fullState}) ────────────│ │
│    └─ attente résolution avant fermeture                  │ │
└─────────────────────────────────────────────────────────┘ │
                                                             │
                    ┌─────────────────────────────────────────┘
                    ▼
┌──────────────────────────────────────────────────────────┐
│  Rust / spreadsheet_db.rs                                 │
│                                                            │
│  save_cells(id, changes: [{row, col, value, style}])     │
│    └─ BEGIN TRANSACTION                                   │
│    └─ INSERT OR REPLACE INTO spreadsheet_cells ...        │
│    └─ COMMIT                                              │
│                                                            │
│  save_state(id, state)                                    │
│    └─ INSERT OR REPLACE INTO spreadsheet_state ...        │
│                                                            │
│  save_all(id, data, columns, state)                       │
│    └─ BEGIN TRANSACTION                                   │
│    └─ DELETE FROM spreadsheet_cells WHERE id = ?          │
│    └─ INSERT INTO spreadsheet_cells ... (bulk)            │
│    └─ UPDATE spreadsheets SET updated_at = ?              │
│    └─ INSERT OR REPLACE INTO spreadsheet_state ...        │
│    └─ COMMIT                                              │
└──────────────────────────────────────────────────────────┘
```

### Détail : `save_cells` vs `save_all`

| Opération | Déclencheur | Contenu | Performance |
|-----------|------------|---------|-------------|
| `save_cells` | Cell edit (debounce 500ms) | Changements incrémentaux | Rapide (quelques lignes) |
| `save_state` | Resize/hide/sort | État UI | Rapide (1 ligne) |
| `save_all` | Tab close (onDestroy) | Tout le dataset | Lent (DELETE+INSERT massif) mais rare |

**Pourquoi `save_all` au tab close ?** Pour garantir que les styles et largeurs de colonnes (qui changent moins fréquemment) sont bien persistés. `save_cells` ne sauvegarde que les valeurs. `save_all` fait un sync complet.

### Implémentation frontend

```typescript
// src/spreadsheet/store.ts
import { invoke } from "@tauri-apps/api/core";
import { getRootPath } from "@/stores/root-path.svelte";

export async function spreadsheetGet(id: string): Promise<SpreadsheetData> {
  const root = getRootPath()!;
  return invoke("spreadsheet_get", { root, id });
}

export async function saveCells(id: string, changes: CellChange[]): Promise<void> {
  const root = getRootPath()!;
  await invoke("spreadsheet_save_cells", { root, id, changes: JSON.stringify(changes) });
}

export async function saveState(id: string, state: Partial<SpreadsheetState>): Promise<void> {
  const root = getRootPath()!;
  await invoke("spreadsheet_save_state", { root, id, state: JSON.stringify(state) });
}

export async function saveAll(id: string, data: CellData[], columns: ColumnDef[], state: SpreadsheetState): Promise<void> {
  const root = getRootPath()!;
  await invoke("spreadsheet_save_all", {
    root, id,
    data: JSON.stringify(data),
    columns: JSON.stringify(columns),
    state: JSON.stringify(state),
  });
}

export async function spreadsheetCreate(name: string, columns: ColumnDef[], data: string[][]): Promise<string> {
  const root = getRootPath()!;
  return invoke("spreadsheet_create", {
    root, name,
    columns: JSON.stringify(columns),
    data: JSON.stringify(data),
  });
}

export async function spreadsheetList(): Promise<SpreadsheetMeta[]> {
  const root = getRootPath()!;
  return invoke("spreadsheet_list", { root });
}

export async function spreadsheetDelete(id: string): Promise<void> {
  const root = getRootPath()!;
  await invoke("spreadsheet_delete", { root, id });
}

export async function spreadsheetExportCsv(id: string, path: string): Promise<void> {
  const root = getRootPath()!;
  await invoke("spreadsheet_export_csv", { root, id, path });
}
```

---

## 4. Composants et Structure des Fichiers

### Plan du dossier

```
src/
├── spreadsheet/                        # Frontend logic (NOUVEAU)
│   ├── index.ts                        # Barrel
│   ├── types.ts                        # SpreadsheetData, CellChange, etc.
│   └── store.ts                        # IPC calls (ci-dessus)
│
├── lib/
│   └── spreadsheet/
│       └── import.ts                   # importFileToMatrix (inchangé, garde @svar-ui)
│       └── index.ts                    # barrel (inchangé)
│
├── components/
│   └── spreadsheet/
│       ├── Spreadsheet.svelte          # Base jspreadsheet (EXISTE, à garder)
│       ├── SpreadsheetViewer.svelte    # Main viewer (NOUVEAU)
│       ├── LazySpreadsheetViewer.svelte # Lazy wrapper (NOUVEAU)
│       └── dialogs/
│           ├── ImportDialog.svelte     # Import dialog (NOUVEAU)
│           ├── OpenDialog.svelte       # Open dialog "expose les .azprose/spreadsheet/*" (NOUVEAU)
│           └── ExportDialog.svelte     # Export dialog (NOUVEAU - optionnel)
│
├── csv/                                # À SUPPRIMER après migration
│   ├── cache.ts                        # → supprimer
│   ├── flush.ts                        # → supprimer
│   └── spreadsheet.ts                  # → garder detectDelimiter/dataToCSV dans lib/
│
└── components/
    └── csv/                            # À SUPPRIMER
        └── CsvSpreadsheet.svelte       # → supprimer
        └── LazyCsvSpreadsheet.svelte   # → supprimer

src-tauri/src/
├── lib.rs                              # + déclaration des commandes spreadsheet
├── spreadsheet_db.rs                   # NOUVEAU : schéma + CRUD + export
```

### `SpreadsheetViewer.svelte` — comportement

```svelte
<script lang="ts">
  let { spreadsheetId }: { spreadsheetId: string } = $props();

  let loading = $state(true);
  let data: string[][] = $state([]);
  let columns: ColumnDef[] = $state([]);
  let spreadsheetRef: Spreadsheet;

  // Load from SQLite
  $effect(() => {
    const id = spreadsheetId;
    if (!id) return;

    loading = true;
    spreadsheetGet(id).then((result) => {
      data = result.data;
      columns = result.columns;
      loading = false;

      // Restore UI state (hidden cols/rows, frozen, sort)
      tick().then(() => {
        restoreState(result.state);
      });
    });
  });

  // Auto-save on cell change
  function handleCellChange(colIndex: number, rowIndex: number, value: any, oldValue: any) {
    if (value === oldValue) return;
    debouncedSaveCells({ row: rowIndex, col: colIndex, value: String(value ?? "") });
  }

  // Full save on tab close
  onDestroy(() => {
    saveAll(spreadsheetId, getFullData(), getFullColumns(), getFullState());
  });
</script>

<Spreadsheet
  bind:this={spreadsheetRef}
  {data}
  {columns}
  onchange={handleCellChange}
  toolbar={buildToolbar}
  class="spreadsheet-viewer"
  worksheetOptions={{ filters: true, columnSorting: true, textOverflow: false }}
/>
```

### Toolbar

```typescript
function buildToolbar(defaultToolbar: any, _instance: JspreadsheetInstance[]) {
  return {
    ...defaultToolbar,
    title: false,
    items: [
      // Boutons par défaut (undo/redo/bold/italic/...)
      ...defaultToolbar.items.map((item: any) => {
        // Override "save" → disabled (auto-save)
        if (item.content === "save") return { ...item, title: "Auto-save" };
        return item;
      }),
      { type: "divisor" },
      { content: "file_open",   title: "Importer",   onclick: handleImport },
      { content: "folder_open", title: "Ouvrir",     onclick: handleOpen },
      { content: "save_alt",    title: "Exporter",   onclick: handleExport },
      { type: "divisor" },
      { content: "visibility",  title: "Show all",   onclick: handleShowAll },
    ],
  };
}
```

---

## 5. Menu/Fonctions détaillées

### Importer

1. `pickXlsx()` (dialogue Tauri) → sélection fichier `.xlsx | .csv`
2. `importFileToMatrix({ path })` via `@svar-ui/excel-import-store` → `{ name, headers, rows }[]`
3. Choisir une feuille (si xlsx multi-sheet, sinon auto)
4. Convertir `headers` → `columns: [{title, width: 120, type: 'text'}]`
5. `spreadsheetCreate(name, columns, rows)` → SQLite → returns UUID
6. Ouvrir onglet avec `kind: "spreadsheet"`, `spreadsheetId: UUID`
7. **Pas de lazy treatment** — import complet immédiat

### Ouvrir

1. `spreadsheetList()` → `{ id, name, imported_at, lazy_type }[]`
2. Dialogue `OpenDialog.svelte` :
   - Liste des spreadsheets importés (nom, date, lazy_type badge)
   - Si `lazy_type === null` → simple ouverture (load depuis SQLite)
   - Si `lazy_type !== null` → "traitement special lazy" :
     - Enregistrer dans SQLite le lien avec le composant lazy (`lazy_source`, `lazy_config`)
     - Au lieu de charger les cellules depuis `spreadsheet_cells`, le frontend instancie un composant spécialisé (ex: colloscope lazy loader) qui :
       1. Lit `lazy_source` → re-importe les données
       2. Applique `lazy_config` (filtres, vue, etc.)
       3. Affiche dans un SVAR DataGrid/Calendar au lieu de jspreadsheet
3. La sélection ouvre l'onglet avec `kind: "spreadsheet"` + `spreadsheetId`

### Exporter

1. Récupérer les données actuelles : `spreadsheetRef.getApi()[0].getData(true)`
2. Dialogue `ExportDialog.svelte` :
   - Format : CSV (immédiat) | XLSX (futur)
   - `dialogSave({ filters: [{ name: "CSV", extensions: ["csv"] }] })`
3. `invoke("spreadsheet_export_csv", { root, id, path })` :
   - Rust lit depuis SQLite → écrit le fichier CSV
   - (Ou alors : sérialisation côté frontend → `writeTextFile`)
4. **Choix : export côté frontend** (plus simple, jspreadsheet a déjà les données) :
   ```typescript
   const csv = dataToCSV(sheet.getData(true), ",");
   await writeTextFile(path, csv);
   ```
   Pas besoin de commande Rust dédiée.

### Breadcrumb "Spreadsheet" dans Tools

```typescript
// Dans le menu Tools (à côté de Calendrier)
{
  id: "spreadsheet",
  label: "Nouveau spreadsheet",
  icon: "table_chart",
  action: () => {
    // Créer un spreadsheet vierge ou ouvrir le dialogue Import
    handleImport();
  }
}
```

La barre de breadcrumb (en haut de l'interface) aura un bouton `+ Spreadsheet` qui lance directement le composant générique.

---

## 6. Extension à colloscope et SVAR

### Architecture multi-feature

```rust
// src-tauri/src/data_db.rs (future)
pub struct DataDb(pub Mutex<Option<(String, Connection)>>);
// .azprose/data.db — base unique pour toutes les données structurées

// Tables par feature :
// spreadsheets -> préfixe spreadsheet_
// colloscope   -> préfixe colles_
// svar         -> préfixe svar_
```

### Colloscope dans SQLite

À terme, remplacer les fichiers JSON actuels (`.azprose/colles/colloscope.json`, `eleves.json`, `fiches/*.json`) par des tables SQLite :

```sql
CREATE TABLE colles_creneaux (
    id TEXT PRIMARY KEY,
    jour TEXT NOT NULL,
    matiere TEXT NOT NULL,
    colleur TEXT NOT NULL,
    classe TEXT NOT NULL,
    salle TEXT,
    horaire TEXT NOT NULL
);

CREATE TABLE colles_semaines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_debut TEXT NOT NULL  -- ISO-8601
);

CREATE TABLE colles_planning (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creneau_id TEXT NOT NULL REFERENCES colles_creneaux(id),
    semaine_index INTEGER NOT NULL,
    groupe TEXT NOT NULL,
    UNIQUE(creneau_id, semaine_index)
);

CREATE TABLE colles_eleves (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    classe TEXT NOT NULL,
    groupe TEXT NOT NULL
);

CREATE TABLE colles_fiches (
    id TEXT PRIMARY KEY,
    creneau_id TEXT NOT NULL REFERENCES colles_creneaux(id),
    semaine_index INTEGER NOT NULL,
    eleve_id TEXT NOT NULL REFERENCES colles_eleves(id),
    note REAL,
    commentaire TEXT,
    UNIQUE(creneau_id, semaine_index, eleve_id)
);
```

Avantages par rapport aux JSON :
- Requêtes : "tous les élèves d'un groupe", "fiches d'un colleur", etc.
- Intégrité référentielle (FOREIGN KEY)
- Transactions atomiques
- Pas de corruption possible (WAL mode)

### SVAR DataProvider custom

Cf `agents/svar+sqlite.md` pour le pattern complet. En résumé :
```typescript
class TauriSvarProvider {
  async getData(): Promise<any[]> {
    return invoke("svar_grid_get", { root, gridId });
  }
  async setNext(actionData: { action: string; obj: any }): Promise<void> {
    await invoke("svar_grid_save", { root, action: actionData.action, item: actionData.obj });
  }
}
```

---

## 7. Plan d'implémentation

### Phase 3A — Base Rust + SQLite (1 day)

1. **Ajouter `rusqlite`** dans `Cargo.toml` :
   ```toml
   rusqlite = { version = "0.31", features = ["bundled"] }
   ```
2. **Créer `src-tauri/src/spreadsheet_db.rs`** :
   - Schéma complet (`SCHEMA_V1`)
   - `init_db(conn)` + `PRAGMA user_version` migration
   - CRUD : `get`, `create`, `save_cells`, `save_state`, `save_all`, `delete`, `list`
   - `export_csv` : lit depuis SQLite, écrit fichier CSV via `atomic_write`
   - Types Serde : `SpreadsheetData`, `SpreadsheetMeta`, `CellChange`, etc.
3. **Déclarer commandes dans `lib.rs`** :
   ```rust
   mod spreadsheet_db;
   // State
   .manage(SpreadsheetDb(Mutex::new(None)))
   // Commands
   spreadsheet_db::spreadsheet_create,
   spreadsheet_db::spreadsheet_get,
   spreadsheet_db::spreadsheet_list,
   spreadsheet_db::spreadsheet_rename,
   spreadsheet_db::spreadsheet_delete,
   spreadsheet_db::spreadsheet_save_cells,
   spreadsheet_db::spreadsheet_save_state,
   spreadsheet_db::spreadsheet_save_all,
   spreadsheet_db::spreadsheet_export_csv,
   ```

### Phase 3B — Frontend components (1 day)

1. **Créer `src/spreadsheet/types.ts`** — interfaces TypeScript
2. **Créer `src/spreadsheet/store.ts`** — fonctions IPC (`spreadsheetGet`, `saveCells`, etc.)
3. **Créer `src/spreadsheet/index.ts`** — barrel
4. **Créer `src/components/spreadsheet/SpreadsheetViewer.svelte`** :
   - Charge depuis SQLite via `spreadsheetGet(id)`
   - Auto-save debounced
   - Toolbar : Importer / Ouvrir / Exporter / Show all
   - Save complet au tab close
5. **Créer `src/components/spreadsheet/LazySpreadsheetViewer.svelte`**
6. **Créer `src/components/spreadsheet/dialogs/ImportDialog.svelte`**
7. **Créer `src/components/spreadsheet/dialogs/OpenDialog.svelte`**
8. **Router dans `ContentRenderer.svelte`** :
   - `tab.kind === "spreadsheet"` → `LazySpreadsheetViewer {spreadsheetId}`
9. **Ajouter `Tab.kind === "spreadsheet"`** dans les types (panel-store)

### Phase 3C — Import + Export UI (0.5 day)

1. **Bouton "Importer"** dans toolbar → `pickXlsx()` + `importFileToMatrix()` + `spreadsheetCreate()`
2. **Bouton "Ouvrir"** → `spreadsheetList()` → `OpenDialog.svelte`
3. **Bouton "Exporter"** → `dialogSave()` + `dataToCSV()` + `writeTextFile()`
4. **Breadcrumb "Spreadsheet"** dans Tools group (avec Calendrier)
5. **Command Palette** : "Spreadsheet: Importer", "Spreadsheet: Nouveau", "Spreadsheet: Ouvrir"

### Phase 3D — Nettoyage (0.5 day)

1. **Supprimer `src/csv/`** (sauf `spreadsheet.ts` à déplacer dans `src/lib/`)
2. **Supprimer `src/components/csv/`**
3. **Supprimer `CsvSpreadsheet` + `LazyCsvSpreadsheet` de ContentRenderer**
4. **Vérifier imports** — aucun résidu de l'ancien système
5. **Supprimer `.azprose/csv-cache/`** (format obsolète)

---

## 8. Risques et Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|------------|--------|------------|
| `rusqlite` incompatible avec Tauri 2 | Faible | Bloquant | Test POC avant implémentation complète. `Mutex<Connection>` est un pattern standard. |
| Payload JSON trop gros (>1MB) pour IPC | Moyenne | Performance | Pour les très gros spreadsheets (>5000 lignes), paginer ou streamer. Dans l'usage notebook/colle, rare. |
| Corruption SQLite en cas de crash | Faible | Perte données | WAL mode + atomic_write pour l'export. Les cell edits sont en transaction. |
| Migration de schéma entre versions | Moyenne | Blocage | `PRAGMA user_version` + migrations séquentielles. Testé en dev. |
| Conflit entre features (spreadsheet vs colloscope) sur la même DB | Faible | Mineur | Namespacing par préfixe de table. Chaque feature écrit dans ses propres tables. |

---

## 9. Leçons d'OpenCode Desktop

OpenCode Desktop (premières versions Tauri + SQLite) a montré :

1. **SQLite IPC est fiable** : `invoke("query", { sql, params })` fonctionne très bien, pas de race condition (Tauri sérialise les appels).
2. **Pas besoin d'ORM** : `rusqlite` avec des strings SQL brutes est plus simple que `sqlx` pour une app mono-utilisateur.
3. **Stockage fichier + SQLite coexistent bien** : le JSON (`config.json`, `session.json`) pour les docs utilisateur, SQLite pour les données structurées (index, metadata, spreadsheets).
4. **Connection pool pas nécessaire** : une seule connexion SQLite par projet suffit (pas de concurrence réelle).
5. **WAL mode recommandé** : meilleures performances en lecture/écriture concurrente, même avec une seule connexion.
