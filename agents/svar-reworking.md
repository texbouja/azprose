# SVAR Calendar Reworking — Synthèse & Plan d'action

## Synthèse de la recherche

### 1. SVAR Calendar — Architecture interne

SVAR Calendar (`@svar-ui/svelte-calendar` v2.6) est un composant Svelte 5 réactif. Points clés :

- **Store interne** : le Calendar maintient un store avec `events[]`, `filters{}`, `state` (date, view). Toute mutation passe par des **actions** typées (`add-event`, `update-event`, `delete-event`, `filter-events`, etc.)
- **Pas de storage natif** : le composant est purement réactif. Il prend un tableau `events` et le rend. La persistance est à la charge de l'applicatif via `api.setNext(provider)` ou des event handlers.
- **Event chain** : `api.setNext(provider)` attache un handler à la fin de la chaîne d'actions. Le store traite d'abord, puis le provider transmet au backend. `api.intercept()` intercepte AVANT le store, `api.on()` observe APRÈS.
- **CalendarPanel** (sidebar) : filtre via `filter-events` avec tag `"calendar-panel"`. Quand tout est coché → `filter: null` (clear). Quand un seul est coqué → seuls les événements de ce groupe sont visibles. **C'est le comportement par défaut qui cause le problème de "disparition totale".**

### 2. Recurring Events — Ce que SVAR PRO fait

**SVAR PRO** (pas le free) inclut un moteur RRULE interne dans le store :
- Le prop `recurring={true}` remplace `EventsStore` par `RecurringEventsStore`
- Les master events ont un champ `rrule` (string iCal RFC 5545)
- Le store génère des **instances virtuelles** (IDs éphémères `"42:2026-03-09"`)
- Supporte `exdates[]` (dates exclues), exception events (`masterEventId` + `originalDate`)
- Édition à portée : `mode: "single"` | `"following"` | whole series
- **C'est une feature PRO payante** — pas accessible sans licence

**Notre moteur actuel** (`src/calendar/recurrence.ts`) :
- Format custom `RecurrenceConfig` (pas des strings RRULE)
- Expansion manuelle dans `SvarCalendarPanel.svelte` via `$derived`
- IDs générés : `${source.id}__r${index}`
- **Non fonctionnel** — probable source de bugs (selon l'utilisateur)
- Pas de support exdates, pas de support single/following, pas de split

### 3. Calendriers Sidebar — Problèmes identifiés

**Problème 1 — Noms incohérents** : les noms de calendriers sont les matières du colloscope (`Mathématiques`, `Physique`, etc.). Pour un prof de maths, ça n'a pas de sens comme catégories de calendrier.

**Problème 2 — Disparition totale** : quand un seul calendrier est décoché, les événements qui n'ont PAS de `calendarId` correspondant disparaissent. Le filtre est `event => active[event[accessor]]` — si l'event n'a pas le champ ou si sa valeur n'est pas dans `active`, il est exclu.

**Problème 3 — Pas de personnalisation** : pas moyen d'ajouter/supprimer des calendriers depuis l'UI.

### 4. Storage — Ce qu'on sait

**SVAR n'offre aucun storage**. Les options sont :
- `RestDataProvider` : REST endpoints (GET/POST/PUT/DELETE `/events`)
- Event handlers manuels : `onaddevent`, `onupdateevent`, `ondeleteevent`
- `api.on()` : observer les mutations après traitement

**Notre situation** :
- `calendar-store.svelte.ts` : in-memory pur, `load()` est no-op
- `ical.ts` : parser/generator complet (RRULE, X-COLOR, X-CALENDAR-ID, ATTENDEE)
- Rust commands `read_calendar` / `write_calendar` existent dans `lib.rs`
- Une tentative précédente de storage complet a échoué et été reverti
- **Le storage sera traité dans une session dédiée**

### 5. DataGrid ↔ Calendar — Le pont Filter

**Pas de pont natif** DataGrid ↔ Calendar dans SVAR. Le pont est `@svar-ui/svelte-filter` :
- `FilterBar`, `FilterQuery`, `FilterBuilder` produisent des requêtes structurées
- `createFilter(value, {}, fields)` retourne `(event) => boolean`
- Ce prédicat est passé à `api.exec("filter-events", { filter })` sur le Calendar
- Le ColloscopePanel utilise déjà `FilterBar` pour filtrer par classe/colleur
- **Pattern** : même store partagé + même filtre appliqué aux deux composants

### 6. Champs Custom (Calendar, Priority, Location, Participants)

**Pattern SVAR** : `registerEditorItem(name, Component)` + `getEditorItems()` spread + items custom :
```ts
const editorItems = [
  ...getEditorItems(),  // text, start, end
  { comp: "richselect", key: "calendarId", label: "Calendar", options: [...] },
  { comp: "richselect", key: "priority", label: "Priority", options: [...] },
  { comp: "input", key: "location", label: "Lieu" },
];
<Editor {api} items={editorItems} />
```

**Notre implémentation actuelle** : on utilise déjà ce pattern pour `RecurrenceEditor` et `PersonCombo`.

### 7. Library `rrule` (npm)

**rrule v2.8.1** — BSD-3-Clause, 2.5M downloads/week, TypeScript inclus :
- `RRule` : constructeur avec options (`freq`, `dtstart`, `until`, `count`, `byweekday`, `interval`, etc.)
- `RRuleSet` : combinaison de règles + rdates + exdates + exrules
- `rrulestr()` : parser de strings RFC 5545
- `rule.between(after, before)` : occurrences dans un range
- `rule.all()` : toutes les occurrences
- `rule.toString()` : sérialisation iCal
- `datetime(y, m, d, h, min)` helper UTC
- **⚠️ Attention UTC** : les dates retournées sont en "UTC local" — il faut interpréter les `getUTCHours()` comme l'heure locale

---

## Plan d'action

### Phase 1 : Recurring layer avec `rrule` ⚡ IMMÉDIAT

**Objectif** : Remplacer notre moteur maison par la library `rrule`, aligné au format SVAR.

#### 1.1 Installer `rrule`
```bash
npm install rrule
```

#### 1.2 Réécrire `src/calendar/recurrence.ts`

**Nouveau type de stockage** — stocker la string RRULE sur l'event (comme SVAR PRO) :
```ts
// AVANT (notre format custom)
interface RecurrenceConfig {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  byDay?: string[];
  count?: number;
  until?: string;
}

// APRÈS (format SVAR-compatible)
// L'event porte直接 un champ `rrule: string` (RFC 5545)
// ex: "FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=1"
// ex: "FREQ=MONTHLY;BYMONTHDAY=15;COUNT=10"
```

**Nouvelles fonctions** :
```ts
import { RRule, RRuleSet } from "rrule";

// Générer les occurrences pour un range
function expandRrule(
  rruleStr: string,
  dtstart: Date,
  rangeStart: Date,
  rangeEnd: Date,
  exdates?: Date[],
): Date[];

// Convertir notre RecurrenceConfig → string RRULE (migration)
function configToRrule(config: RecurrenceConfig, dtstart: Date): string;

// Générer un label humain à partir d'un RRule
function rruleToLabel(rruleStr: string, locale?: string): string;

// Créer un RRuleSet avec exdates
function createRruleSet(rruleStr: string, dtstart: Date, exdates?: Date[]): RRuleSet;
```

#### 1.3 Mettre à jour `CalendarEventData` dans `ical.ts`

```ts
interface CalendarEventData {
  id: string;
  text: string;
  start: Date;
  end: Date;
  color?: string;
  calendarId?: string;
  persons?: string[];
  rrule?: string;          // ← remplace `recurrence`
  exdates?: Date[];        // ← nouveau : dates exclues
  masterEventId?: string;  // ← nouveau : exception event
  originalDate?: Date;     // ← nouveau : pour exception events
  allDay?: boolean;
  location?: string;       // ← nouveau
  priority?: string;       // ← nouveau
}
```

#### 1.4 Réécrire l'expansion dans `SvarCalendarPanel.svelte`

Remplacer le `$derived` qui utilise `expandRecurring()` par une version qui utilise `rrule` :
```ts
const expandedUserEvents = $derived.by(() => {
  const rangeStart = ...;
  const rangeEnd = ...;
  const result = [];
  
  for (const ev of store.events) {
    if (ev.rrule) {
      const dates = expandRrule(ev.rrule, ev.start, rangeStart, rangeEnd, ev.exdates);
      for (const d of dates) {
        const end = new Date(d.getTime() + (ev.end.getTime() - ev.start.getTime()));
        result.push({
          ...ev,
          id: `${ev.id}__${d.getTime()}`,  // ID stable basé sur le timestamp
          start: d,
          end,
        });
      }
    } else {
      result.push(ev);
    }
  }
  return result;
});
```

#### 1.5 Réécrire `RecurrenceEditor.svelte`

Le composant génère maintenant une string RRULE au lieu d'un `RecurrenceConfig` :
- Switch on/off → ajoute/retire le champ `rrule` de l'event
- Counter interval + Combo freq → modifie la string
- Day picker (weekly) → ajoute `BYDAY=MO,WE,...`
- End condition → ajoute `COUNT=N` ou `UNTIL=YYYYMMDD`

**Utiliser RRule de la lib `rrule` pour valider et sérialiser** :
```ts
import { RRule } from "rrule";

function buildRrule(opts: { freq: string; interval: number; byDay?: string[]; count?: number; until?: string }): string {
  const freqMap = { daily: RRule.DAILY, weekly: RRule.WEEKLY, monthly: RRule.MONTHLY, yearly: RRule.YEARLY };
  const dayMap = { MO: RRule.MO, TU: RRule.TU, WE: RRule.WE, TH: RRule.TH, FR: RRule.FR, SA: RRule.SA, SU: RRule.SU };
  
  const rule = new RRule({
    freq: freqMap[opts.freq],
    interval: opts.interval,
    byweekday: opts.byDay?.map(d => dayMap[d]),
    count: opts.count,
    until: opts.until ? new Date(opts.until + "T23:59:59") : undefined,
    dtstart: new Date(Date.UTC(2000, 0, 1)),  // placeholder
  });
  
  // Extraire juste la partie RRULE (sans DTSTART)
  return rule.toString().split("\n").find(l => l.startsWith("RRULE:"))?.slice(6) ?? "";
}
```

#### 1.6 Migration des données existantes

Fonction de migration pour les events qui ont encore `recurrence` :
```ts
function migrateRecurrence(event: any): void {
  if (event.recurrence && !event.rrule) {
    event.rrule = configToRrule(event.recurrence, event.start);
    delete event.recurrence;
  }
}
```

Appeler au chargement dans `calendar-store.load()`.

#### 1.7 Supprimer l'ancien moteur

Supprimer `src/calendar/recurrence.ts` (ou le garder comme utilitaire de migration).
Supprimer l'import de `expandRecurring` dans `SvarCalendarPanel.svelte`.

#### 1.8 iCal round-trip

`ical.ts` gère déjà RRULE en import/export. Vérifier que `parseRRule()` et `toRRule()` utilisent correctement le format.

---

### Phase 2 : Calendriers Sidebar cohérents

**Objectif** : Noms sensibles pour un prof de prépa, couleurs cohérentes, ajout depuis l'UI.

#### 2.1 Définir les catégories de calendriers

```ts
// src/lib/calendar-categories.ts
export interface CalendarCategory {
  id: string;
  label: string;
  css: string;
  color: string;
  active: boolean;
  builtIn: boolean;  // pas supprimable
}

export const DEFAULT_CALENDARS: CalendarCategory[] = [
  { id: "cours",   label: "Cours",     css: "cal-cours",   color: "#4a90d9", active: true,  builtIn: true },
  { id: "td",      label: "TD et Prep", css: "cal-td",      color: "#e6a94c", active: true,  builtIn: true },
  { id: "devoirs", label: "Devoirs et Colles", css: "cal-devoirs", color: "#72b886", active: true,  builtIn: true },
  { id: "perso",   label: "Personnel", css: "cal-perso",   color: "#b496e6", active: true,  builtIn: true },
];
```

#### 2.2 Stocker les calendriers user dans le calendar store

```ts
// calendar-store.svelte.ts
interface CalendarStore {
  events: CalendarEventData[];
  calendars: CalendarCategory[];
  // ...
}
```

Les calendriers sont persistés dans `.azprose/calendar/calendars.json`.

#### 2.3 Corriger le filtre CalendarPanel

**Bug actuel** : les événements sans `calendarId` disparaissent quand un seul calendrier est coché.

**Fix** : quand un event n'a pas de `calendarId`, le considérer comme appartenant au premier calendrier actif par défaut (ou à `"perso"`).

```ts
// Dans le filtrage
function filterByCalendars(activeIds: Set<string>) {
  return (event) => {
    const calId = event.calendarId || "perso";  // fallback
    return activeIds.has(calId);
  };
}
```

#### 2.4 Mapping colloscope → catégories

Les événements colloscope映射 vers les catégories :
- Colles → `devoirs`
- Cours (si ajouté) → `cours`
- TD/Prep → `td`

```ts
// Dans colles-events.ts, ajouter :
function colleCalendarId(matiere: string): string {
  // Les colles vont dans "Devoirs et Colles"
  return "devoirs";
}
```

#### 2.5 UI d'ajout de calendrier

Dans le toolbar du Calendar, ajouter un bouton "+" qui ouvre un petit formulaire :
- Nom du calendrier
- Couleur (picker ou prédéfinies)
- Le nouveau calendrier est ajouté à `calendars[]` et persisté

Utiliser `registerEditorItem` ou un composant custom dans le toolbar.

#### 2.6 CSS par calendrier

```css
/* Catppuccin-based colors */
.cal-cours   { --cal-color: #4a90d9; }
.cal-td      { --cal-color: #e6a94c; }
.cal-devoirs { --cal-color: #72b886; }
.cal-perso   { --cal-color: #b496e6; }

/* Application */
.cal-cours.wx-box-event,
.cal-cours.wx-bar-event,
.cal-cours.wx-event {
  background-color: var(--cal-color);
}

.cal-cours.wx-calendar-name {
  background-color: var(--cal-color);
  color: white;
}
```

---

### Phase 3 : Champs custom + Editor integration

**Objectif** : Ajouter Location, Priority, activer l'Editor avec collaboration.

#### 3.1 Étendre `CalendarEventData`

```ts
interface CalendarEventData {
  // ... existant ...
  location?: string;
  priority?: "high" | "medium" | "low" | null;
}
```

#### 3.2 Enregistrer les items d'éditeur

```ts
// Dans SvarCalendarPanel.svelte
import { Input, RichSelect } from "@svar-ui/svelte-core";

registerEditorItem("richselect", RichSelect);

const editorItems = [
  ...getEditorItems(),
  { comp: "input", key: "location", label: "Lieu" },
  {
    comp: "richselect", key: "priority", label: "Priorité",
    options: [
      { id: "high", label: "Haute" },
      { id: "medium", label: "Moyenne" },
      { id: "low", label: "Basse" },
    ],
  },
  { comp: RecurrenceEditor as any, key: "rrule", label: "Récurrence" },
  { comp: PersonCombo as any, key: "persons", label: "Assigné à" },
];
```

#### 3.3 Couleur par priorité via `eventCss`

```ts
function eventCss(ctx) {
  const p = ctx.event.priority;
  if (p === "high") return "priority-high";
  if (p === "medium") return "priority-medium";
  if (p === "low") return "priority-low";
  return "";
}
```

#### 3.4 Collaboration Editor ↔ Calendar

L'Editor SVAR already handle ça nativement :
- `Editor` monté avec le même `api` que `Calendar`
- `onchange({ key, value })` → met à jour l'event en temps réel
- `autoSave={false}` + `bottomBar` pour un flux Save explicite
- `api.getReactiveState().editorData` → store réactif de l'event sélectionné

**Notre implémentation** : l'Editor est déjà monté dans `SvarCalendarPanel.svelte`. Il suffit d'étendre `editorItems` avec les nouveaux champs.

---

### Phase 4 : Storage (Session dédiée)

**Objectif** : Persistance fiable des événements calendar.

#### 4.1 Architecture

```
Calendar store (reactive) ←→ CalendarEventData[]
        ↓ on change
   Debounce 500ms
        ↓
   serialize (JSON ou iCal)
        ↓
   Rust write_calendar() (atomic write)
        ↓
   .azprose/calendar/events.json
```

#### 4.2 Format de stockage

**JSON** (plus simple, plus flexible) :
```json
{
  "version": 2,
  "events": [
    {
      "id": "evt-1",
      "text": "Réunion",
      "start": "2026-09-15T10:00:00",
      "end": "2026-09-15T11:00:00",
      "calendarId": "perso",
      "priority": "high",
      "location": "Salle A101",
      "persons": ["M. Boujaida"],
      "rrule": "FREQ=WEEKLY;BYDAY=MO",
      "exdates": ["2026-10-15T10:00:00"],
      "allDay": false
    }
  ],
  "calendars": [
    { "id": "cours", "label": "Cours", "color": "#4a90d9", "active": true }
  ]
}
```

**Pourquoi JSON plutôt que iCal** :
- iCal ne supporte pas nos champs custom (location, priority, persons) sans extensions `X-`
- JSON est plus naturel pour Svelte réactif
- `ical.ts` reste utile pour l'import/export externe

#### 4.3 Leçons apprises (pour la session storage)

1. **Ne jamais faire de write synchrone** — toujours debouncer
2. **Atomic write** — écrire dans un fichier temp, puis rename (Rust le fait déjà)
3. **Pas de read au mount du store** — lazy load quand le CalendarPanel s'ouvre
4. **Migration versionnée** — numberer le format, migrer automatiquement
5. **Pas de conflit** — app mono-utilisateur, pas besoin de CRDT ou merge
6. **Les événements colles sont CALCULÉS** — pas stockés dans le calendar JSON, générés depuis le colloscope store
7. **Sérialisation Date** — `toISOString()` pour l'écriture, `new Date()` pour la lecture
8. **RRULE est déjà sérialisé** — string iCal, pas besoin de conversion

---

### Phase 5 : DataGrid → Calendar (Filter bridge)

**Objectif** : Intégrer les données du colloscope dans le Calendar via Filter.

#### 5.1 Pattern

```
ColloscopePanel (DataGrid) ←→ calendar-store ←→ SvarCalendarPanel (Calendar)
        ↓                            ↓
   FilterBar                      CalendarPanel (sidebar)
   classe/colleur                 cats/cours/td/devoirs/perso
```

#### 5.2 Export colloscope → calendar

Déjà implémenté dans `ColloscopePanel.exportToCalendar()`. Amélioration :
- Les events colles ont `calendarId: "devoirs"` (catégorie fixe)
- Les events colles ont `color` basé sur `MATIERE_COLORS`
- Les events colles sont **read-only** dans le Calendar (pas éditable directement)

#### 5.3 Filter interne

Le `FilterBar` du `ColloscopePanel` filtre la grille. Pour étendre au Calendar :
- Même store partagé `calendar-store`
- Le CalendarPanel sidebar filtre par catégorie
- Le FilterBar du ColloscopePanel filtre par classe/colleur (uniquement pour la grille)

---

### Phase 6 : Settings — User profile

**Objectif** : Config utilisateur pour les données extraites.

#### 6.1 Nouveau module dans SettingsOverlay

Section "Général" → module "Profil utilisateur" :
- Nom complet (text input)
- Email (text input)
- Rôle (combo : Professeur, Colleur, Admin)

#### 6.2 Store

```ts
// src/stores/user-profile.svelte.ts
interface UserProfile {
  name: string;
  email: string;
  role: string;
}
```

Stocké dans `.azprose/config.json` sous `userProfile`.

#### 6.3 Utilisation

- `PersonCombo` : le nom de l'utilisateur est pré-sélectionné
- Export iCal : `ATTENDEE;CN=<name>:mailto:<email>`
- futur : auto-génération daily notes avec le nom de l'utilisateur

---

## Ordre d'exécution

```
Phase 1 (rrule)     ← IMMÉDIAT — fondation pour tout le reste
    ↓
Phase 3 (champs)    ← Rapide, améliore l'UX immédiatement
    ↓
Phase 2 (sidebar)   ← Coherence visuelle, couleurs
    ↓
Phase 6 (settings)  ← Petit, indépendant
    ↓
Phase 5 (filter)    ← Intégration DataGrid↔Calendar
    ↓
Phase 4 (storage)   ← Session dédiée, complexe
```

## Dépendances

| Package | Version | Usage | Install |
|---------|---------|-------|---------|
| `rrule` | ^2.8.1 | Moteur RFC 5545 | `npm i rrule` |

Pas de nouvelles dépendances SVAR — tout est dans `@svar-ui/svelte-calendar` v2.6.

## Fichiers modifiés

| Fichier | Action |
|---------|--------|
| `src/calendar/recurrence.ts` | **Réécrit** — wrapper `rrule` |
| `src/lib/ical.ts` | **Étendu** — `CalendarEventData` + champs |
| `src/components/colles/SvarCalendarPanel.svelte` | **Réécrit** — expansion rrule, editor items, eventCss |
| `src/components/colles/RecurrenceEditor.svelte` | **Réécrit** — génère strings RRULE |
| `src/stores/calendar-store.svelte.ts` | **Étendu** — calendars, storage interface |
| `src/lib/colles-events.ts` | **Modifié** — calendarId → "devoirs" |
| `src/components/overlays/SettingsOverlay.svelte` | **Étendu** — module profil user |
| `src/styles/svar-theme.css` | **Étendu** — couleurs calendriers |
