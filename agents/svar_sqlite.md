# SVAR + SQLite — Socle d'intégration (Calendar, DataGrid, Editor)

> Analyse et plan pour l'intégration des composants SVAR (Calendar, DataGrid, Editor)
> avec une persistance SQLite commune `.azprose/data.db`.
> Date : 2026-07-31

---

## 1. Contexte & Décision

### Décision utilisateur
- La gestion de colles a été **volontairement supprimée** : l'ancien code n'était pas
  satisfaisant. **Aucun recyclage du code legacy** — et surtout pas de code récupéré
  depuis un ancien état git de l'application.
- La stratégie et l'architecture des colles seront **repensées de zéro**, sur de
  nouvelles bases solides.
- **Socle** : intégrer les composants SVAR à SQLite (déjà présent pour le tableur).
- **Priorité immédiate** : l'intégration SVAR/SQLite uniquement. La refonte des colles
  viendra ensuite, sur ce socle.

### Ce que cela implique
- Ne PAS consulter/réutiliser : `colles.rs`, `src/types/colles.ts`, les stores colles,
  les composants `ColloscopeGrid`/`CollesImportDialog`/etc. (états `a903b63^` ou antérieurs).
- Réutiliser en revanche les **patterns actuels de l'app** (tableur SQLite, stores
  calendrier, composants SVAR Calendar déjà en place).
- Le calendrier est le **premier composant SVAR à brancher** sur SQLite (c'est lui qui
  a le seul vrai problème : perte de données locale). C'est le banc d'essai du pattern
  provider → IPC, réutilisable ensuite pour Grid/Editor.

---

## 2. État actuel (base de travail)

### 2.1 Tableur — pattern de référence, déjà en SQLite ✅

`src-tauri/src/spreadsheet_db.rs` — **le modèle d'architecture à généraliser**.

- **Base unique** : `{root}/.azprose/data.db`.
- **Connexion** : `pub struct SpreadsheetDb(pub Mutex<Option<(String, Connection)>>)`
  — guardée, ouverte paresseusement, réinitialisée si `root` change.
- **Helper** : `with_db(state, root, |conn| ...)` — ouvre/init/verrouille puis expose la connexion.
- **Migration** : `PRAGMA user_version` + `init_db()` — actuellement `LATEST_VERSION = 2`.
- **Schéma V1** : 4 tables `spreadsheets`, `spreadsheet_columns`, `spreadsheet_cells`, `spreadsheet_state`.
- **Commandes** : `spreadsheet_create/get/list/rename/delete/save_cells/save_state/save_all/init_db/export_csv`.
- **Enregistrement** : `lib.rs` → `.manage(SpreadsheetDb(Mutex::new(None)))` + `invoke_handler`.
- **Init au boot** : `spreadsheet_init_db` fire-and-forget depuis `app.svelte`.

**Pattern frontend (3 couches) :**
1. `src/spreadsheet/store.ts` — wrappers `invoke()` + `getRootPath()` (un wrapper par commande).
2. `src/spreadsheet/open-tabs.svelte.ts` — état réactif (liste des IDs ouverts).
3. `src/components/spreadsheet/SpreadsheetViewer.svelte` — composant UI.

### 2.2 Calendrier — localStorage aujourd'hui ⚠️

- **Store** : `src/stores/calendar-store.svelte.ts` — `$state`, clé `mdview.calendar.events`,
  sérialisation Date ↔ ISO, migration auto `migrateRecurrence()`.
- **Type** : `CalendarEventData extends CalendarEvent` (index signature `[key: string]: any`)
  + champs typés : `text`, `color`, `calendarId`, `persons`, `rrule`, `exdates`, `location`, `priority`.
- **Persistance manuelle** : `src/lib/calendar-persistence.ts` — export/import iCal via
  `@svar-ui/calendar-ical`, dialogs natifs, skip si 0 événement.
- **RRULE** : `src/calendar/recurrence.ts` — `expandRrule()`, `rruleToLabel()`,
  `configToRrule()`, `migrateRecurrence()` (RFC 5545 via lib `rrule`).
- **`load(_rootPath)` est un no-op** — tout est dans localStorage, rien sur disque.
- **iCal round-trip vérifié** : RRULE, EXDATE, X-LOCATION, X-PRIORITY passent sans perte.

### 2.3 Composants SVAR Calendar déjà intégrés
- `src/components/calendar/` : `SvarCalendarPanel`, `CalendarPanel` (legacy),
  `RecurrenceEditor`, `CalendarIdEditor`, `PersonCombo`, `PriorityEditor`, lazy loaders.
- `SvarCalendarPanel` utilise l'API imperative `createCalendar` (@event-calendar/core)
  avec EventBus (`api`), rrule expansion, catégories sémantiques fixes
  (Cours / TD / Devoirs / Perso).

### 2.4 Packages SVAR installés (node_modules)

| Package | Usage prévu |
|---|---|
| `svelte-calendar` + `calendar-store`/`calendar-provider`/`calendar-ical`/`calendar-locales` | Calendrier (déjà utilisé) |
| `svelte-grid` + `grid-store`/`grid-data-provider`/`grid-locales` | DataGrid (futur : colles) |
| `svelte-editor` (+ `editor-locales`) | Éditeur de formulaires structurés (futur : fiches) |
| `svelte-filter` (+ `filter-store`/`filter-locales`) | Filtres datagrid (futur) |
| `svelte-excel-import` / `svelte-export-popup` | Import/export (futur) |
| `svelte-kanban`, `svelte-comments`, `svelte-layout`, `svelte-menu`, `svelte-tasklist`, `svelte-toolbar`, `svelte-uploader` | Non prioritaires |

---

## 3. Leçons du passé (sans recyclage de code)

### 3.1 Calendar — le storage iCal a été tenté puis abandonné
- Tentative d'une couche de persistance iCal (Rust + frontend) **créée puis reverted**.
- Raisons : bugs dans l'implémentation initiale du calendrier ; et le **iCal n'est pas un
  bon format de stockage primaire** (RRULE non géré, perte des champs custom).
- **Verdict** : iCal = format d'**échange** (import/export utilisateur) uniquement.
  Le stockage primaire doit être SQLite, **table par table**, champs custom en JSON.

### 3.2 Les colles ont été supprimées par décision, pas par contrainte technique
- Le code legacy a été jugé non satisfaisant et retiré. Il ne doit pas revenir.
- Les colles seront **reconstruites de zéro**, plus tard, sur le socle SVAR/SQLite.

### 3.3 Ce qui reste valable (patterns actuels, pas legacy)
- `with_db` / `Mutex<Connection>` / migrations `user_version` (tableur — actif).
- Provider SVAR branché sur IPC (voir §4.4 — documenté par SVAR lui-même).
- 1 calendrier max par projet ; IDS rrule `baseId__timestamp` à stripper avant lookup.

---

## 4. Architecture cible — socle SVAR/SQLite

### 4.1 Principe

**Une seule base** `{root}/.azprose/data.db` pour tout le stockage structuré.
Un module `db.rs` partagé gère connexion + migrations ; les modules métier définissent
leurs tables + commandes. Le calendrier est le **premier module** à intégrer ; DataGrid
et Editor suivront avec le même squelette.

```
src-tauri/src/
├── lib.rs            # .manage(Db state) + invoke_handler (toutes les commandes)
├── db.rs             # (NOUVEAU) connexion unique + SCHEMA + migrations user_version
├── spreadsheet_db.rs # existant — tables spreadsheets* → migré vers db.rs
└── calendar_db.rs    # (NOUVEAU) table calendar_events + commandes
```

### 4.2 Schéma — extension `user_version` 2 → 3

```sql
-- ===== Calendar (SVAR Calendar) =====
CREATE TABLE IF NOT EXISTS calendar_events (
    id          TEXT PRIMARY KEY,          -- id SVAR (UUID)
    text        TEXT NOT NULL,
    start       TEXT NOT NULL,             -- ISO 8601
    end         TEXT NOT NULL,             -- ISO 8601
    all_day     INTEGER NOT NULL DEFAULT 0,
    calendar_id TEXT DEFAULT 'perso',      -- 4 catégories fixes
    color       TEXT DEFAULT '',
    data        TEXT NOT NULL DEFAULT '{}' -- JSONB: persons, rrule, exdates,
                                           -- location, priority + champs custom
);
```

**Conventions de conception**
- Champs custom → **colonne `data` JSONB**. C'est exactement ce que fait le provider
  SVAR : tout `JSON.stringify` sauf `start`/`end`/`exdates` → Dates ISO.
  **Round-trip sans perte, zéro migration de schéma à l'ajout d'un champ.**
- `start`/`end` restent des colonnes ISO (requêtes SQL par plage de dates possibles).
- Tables futures (colles, grid, fiches) : même style — colonnes typées pour les champs
  pivot/filtres, `data` JSONB pour le reste. **Aucune décision colles maintenant.**

### 4.3 Module Rust partagé — `db.rs`

```rust
pub struct Db(pub Mutex<Option<(String, Connection)>>);

pub fn with_db<F, R>(state: &State<Db>, root: &str, f: F) -> Result<R, String>
where F: FnOnce(&mut Connection) -> Result<R, String> { ... }
// → corps identique à with_db() actuel, mais sur `Db` et schéma complet
```

- `lib.rs` : `.manage(SpreadsheetDb(Mutex::new(None)))` → `.manage(Db(Mutex::new(None)))`.
- Commandes `spreadsheet_*` : passer de `State<SpreadsheetDb>` à `State<Db>` (changement
  de type uniquement).
- `init_db()` : migration par `user_version` : v2 → + tables calendar (SCHEMA_V2).

### 4.4 Commandes Tauri — Calendar

```rust
calendar_events_get(root) -> Vec<CalendarEventRow>
calendar_events_save(root, events: String /* JSON array */)  // upsert transactionnel
calendar_events_delete(root, id: String)
```

Écritures en transaction (`conn.transaction()`), date `updated_at` maintenue.

### 4.5 Frontend — provider SVAR sur IPC (le cœur de l'intégration)

**Mécanisme SVAR** (documenté « Saving to Server ») :

> Le calendrier émet des **actions typées** (`add-event`, `update-event`, `delete-event`)
> sur son store. On branche un **data provider** via `api.setNext(provider)` à l'init.
> Le calendrier ne sait pas qu'un backend existe — le provider décide.
> `update-event` est **debouncé 500 ms** par le provider.
> `getData()` charge les événements au démarrage (les dates ISO sont re-parsées en `Date`).

→ **Pas de `RestDataProvider` HTTP.** Un provider custom qui appelle `invoke()` :

```ts
// src/lib/svar-calendar-provider.ts
import { invoke } from "@tauri-apps/api/core";
import { getRootPath } from "@/stores/root-path.svelte";

export class TauriCalendarProvider {
  async getData(): Promise<CalendarEventData[]> {
    const root = getRootPath();
    return invoke("calendar_events_get", { root });
  }

  async setNext(action: { action: string; event?: any; id?: string }) {
    const root = getRootPath();
    switch (action.action) {
      case "add-event":
      case "update-event":
        await invoke("calendar_events_save", {
          root, events: JSON.stringify([action.event]),
        });
        break;
      case "delete-event":
        await invoke("calendar_events_delete", { root, id: action.id });
        break;
    }
  }
}
```

**Branchement dans `SvarCalendarPanel.svelte` :**
- `init` → `api.setNext(provider)` (une fois).
- `getData()` au mount → `events` initiaux.
- Le même squelette de provider sera dupliqué pour DataGrid (actions `add`/`update`/`delete`)
  et Editor (`onsave` → upsert).

**Store `calendar-store.svelte.ts` :**
- Garde son API (`events`, `set`, `replaceAll`, `clearAll`, `load`).
- `load(rootPath)` devient **réel** : lecture SQLite.
- `set`/`replaceAll` persistent (appel `calendar_events_save`).
- **Migration localStorage → SQLite** : au premier run, upsert des événements existants
  dans SQLite. La clé localStorage n'est supprimée qu'après validation.

---

## 5. Plan d'action — phasé

### Phase 0 — Refactor DB commune (sans changement de comportement)
1. Créer `src-tauri/src/db.rs` : déplacer `with_db`, `init_db`, `SCHEMA_V1` depuis
   `spreadsheet_db.rs` ; renommer `SpreadsheetDb` → `Db`.
2. `lib.rs` : `.manage(Db(...))`, imports, `invoke_handler`.
3. Adapter les 10 commandes `spreadsheet_*` (changement de type `State`).
4. `cargo check` + test manuel : ouvrir/éditer un CSV → tout persiste.

### Phase 1 — Calendar → SQLite (première intégration SVAR/SQLite)
1. `src-tauri/src/calendar_db.rs` : table `calendar_events`, commandes
   `calendar_events_get/save/delete`.
2. `src/lib/svar-calendar-provider.ts` : `getData()` + `setNext()`.
3. `SvarCalendarPanel.svelte` : brancher le provider (`api.setNext` + `getData` au mount).
4. `calendar-store.svelte.ts` : `load()` réel + persistance des mutations.
5. Migration localStorage → SQLite (upsert, clé conservée temporairement).
6. Garder `calendar-persistence.ts` (iCal) pour l'import/export utilisateur.
7. Tests : add/update/delete + rrule + drag/resize → relancer l'app → tout est là ;
   débrancher localStorage → rien ne change.

### Phase 2 — Généraliser le squelette aux autres composants SVAR
1. **DataGrid** : même pattern provider pour un composant Grid (chargement + CRUD).
2. **Editor** : `autoSave`/`onsave` → upsert SQLite (fiche = enregistrement structuré).
3. **Filter** : filtres côté frontend (données déjà en mémoire) — pas de requêtes dynamiques
   en V1.

### Phase 3 — (futur, hors périmètre actuel) Colles repensées de zéro
- Sur le socle des Phases 0-2 : nouveaux modèles de données, nouveaux écrans, nouveaux
  imports. **Aucune référence au code legacy.**
- Décision de design complète à venir (schéma, parcours, UX).

---

## 6. Risques & mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| **`Mutex<Connection>` + async** → deadlock si guard sur un await | Basse | Commandes **sync** (`fn`), Tauri les exécute sur thread pool. `with_db` strictement sync (pattern actuel). |
| **Perte de données localStorage pendant migration** | Basse | Ne pas supprimer la clé avant validation. Migration idempotente (upsert par id). |
| **Debounce SVAR (500 ms) + fermeture fenêtre** → perte des dernières actions | Moyenne | Flush au `beforeunload`/tab close (pattern `csv/flush.ts`). |
| **Champs custom non sérialisés par le provider** | Basse | Colonne `data` JSONB : tout `JSON.stringify` sauf dates ISO (comportement SVAR documenté). Test round-trip rrule/priority/persons. |
| **Régression tableur pendant refactor `SpreadsheetDb` → `Db`** | Moyenne | Phase 0 isolée, test CSV manuel avant toute autre étape. |
| **Récurrence : édition "single/following"** envoie `mode` + `originalDate` au provider | Moyenne | Storer le payload SVAR brut dans `data` ; split comme aujourd'hui via `expandRrule`. |
| **IDS : store = événement de base, UI = occurrences `baseId__timestamp`** | Moyenne | Stripper le suffixe avant lookup (pattern existant). Ne pas persister les occurrences. |
| **Concurrence multi-projets** | Faible | Une connexion par `root`, revalidée si `root` change. |

---

## 7. Références

- **Docs SVAR** (structure `/svelte/...`) :
  - Calendar « Saving to Server » (provider, actions, debounce) :
    https://docs.svar.dev/svelte/calendar/advanced-features/saving-to-server/
  - Grid « Loading data from the server » :
    https://docs.svar.dev/svelte/grid/guides/loading_data/
  - Editor « Data handling » (autoSave/onsave/validation) :
    https://docs.svar.dev/svelte/editor/guides/data-handling/
- **Patterns actuels (non legacy)** : `src-tauri/src/spreadsheet_db.rs`,
  `src/spreadsheet/store.ts`, `src/spreadsheet/open-tabs.svelte.ts`,
  `src/components/spreadsheet/SpreadsheetViewer.svelte`,
  `src/stores/calendar-store.svelte.ts`, `src/lib/calendar-persistence.ts`,
  `src/calendar/recurrence.ts`.
