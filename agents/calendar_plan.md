# Plan d'action — Refactorisation calendrier + colles

## Analyse de faisabilité

### Ce qui est faisable immédiatement (réutilisation directe)

| Composant actuel | Réutilisable ? | Action |
|---|---|---|
| `ColleCalendar.svelte` | ✅ Oui | Migrer dans JournalView, adapter les props |
| `ColloscopeGrid.svelte` | ✅ Oui | Extraire du sidebar → commande palette → ViewPanel |
| `ColleView.svelte` | ⚠️ Partiellement | Le header (tabs, filtres) disparaît. Grid/Calendar → ViewPanel |
| `calendar-widget.svelte` | ❌ Remplacer | Remplacer par @event-calendar (plus complet) |
| `virtual-tree.svelte` | ✅ Oui | Conservé tel quel dans la sidebar |
| `journal-store.svelte.ts` | ⚠️ Étendre | Ajouter getEventsForDate(), createNoteWithColles() |
| `colloscope.svelte.ts` | ✅ Oui | Conservé, stockage déplacé vers `.azprose/data/` |
| `eleves.svelte.ts` | ✅ Oui | Étendre avec champ email, stockage vers `.azprose/data/` |

### Ce qui nécessite un nouveau développement

| Fonction | Complexité | Dépendances |
|---|---|---|
| Calendrier sidebar (lecture seule) | Moyenne | @event-calendar (déjà installé) |
| Calendrier ViewPanel (édition complète) | **Élevée** | @event-calendar + récurrence |
| Calendrier natif `.azprose/calendar/` | Moyenne | JSON schema propre |
| Spreadsheet élèves (ViewPanel) | Moyenne | jspreadsheet-ce (déjà installé) |
| Auto-génération `## Colles` dans daily notes | Moyenne | journal-store + colloscope store |
| Blocs `colle` YAML → HTML | Moyenne | markdown-it plugin ou post-render |
| Commandes palette | Faible | commands.ts + handlers |
| Import élèves (CSV/XLSX) | Faible | Rust parser existant + frontend |

### Points bloquants / risques

1. **Récurrence événements** — @event-calendar supporte `rrule` via plugin `@event-calendar/rrule` (optionnel, pas installé). Sinon, générer les occurrences manuellement dans `buildEvents()` comme on le fait déjà pour les colles.

2. **Stockage calendrier** — @event-calendar n'a pas de format d'export natif. Il faut un schéma JSON propriétaire. Les événements du colloscope sont **dérivés** (calculés depuis le JSON colloscope + date de démarrage), pas stockés indépendamment. Seuls les événements manuels (rappels, notes) doivent être persistés.

3. **Génération `## Colles`** — Le contenu doit être généré au moment de la création de la note. Or le colloscope est cyclique (les dates ne sont pas fixées à l'avance). Il faut une **date de référence** (première semaine du cycle) pour calculer quelles colles tombent quel jour.

4. **Typage des élèves** — Le champ `email` manque dans le type `Eleve`. À ajouter.

---

## Architecture cible

```
Sidebar                          ViewPanel
┌─────────────────────┐    ┌──────────────────────────────┐
│ ActivityBar          │    │ Colloscope Grid (édition)    │
│ [📁] [📅]           │    │ Spreadsheet Élèves (édition) │
│                     │    │ Calendrier (édition complète) │
│ VirtualTree (notes) │    │ Fiches de colle              │
│ ─────────────────── │    └──────────────────────────────┘
│ Calendar (lecture)  │
│ [Éditer] → ViewPanel│
└─────────────────────┘
```

- **Sidebar** : VirtualTree + @event-calendar en lecture seule (monthGrid, pas de toolbar d'édition)
- **ViewPanel** : Grid colloscope, spreadsheet élèves, calendrier éditable
- **Commandes palette** : `colles: gestion du colloscope`, `colles: importer`, `colles: liste des élèves`, `colles: importer élèves`
- **Plus de boutons Colles** dans l'activity bar (Table2 retiré)

---

## Plan d'action

### Phase 1 — Migration calendrier sidebar (2-3h)

**Objectif** : Remplacer `calendar-widget.svelte` (HTML pur) par @event-calendar en lecture seule.

1. **Modifier `JournalView.svelte`** :
   - Remplacer `<CalendarWidget>` par `<JournalCalendar>` (nouveau composant)
   - `JournalCalendar` : @event-calendar avec `dayGridMonth` UNIQUEMENT (pas de toolbar d'édition)
   - Props : `noteDates`, `collesEvents`, `onSelectDate`
   - `dateClick` → créer/ouvrir daily note (comportement actuel)
   - `eventClick` → si event colle → ouvrir la daily note correspondante

2. **Créer `JournalCalendar.svelte`** :
   - Import : `Calendar`, `DayGrid`, `Interaction` (pas de `TimeGrid` en sidebar)
   - Options : `headerToolbar: false` ou minimal (`prev,next,today`)
   - Events : fusionner `noteDates` (dots) + `collesEvents` (colles)
   - Hauteur compacte pour sidebar

3. **Alimenter les événements colles** :
   - `journal-store.svelte.ts` : ajouter `getCollesEvents(rootPath)` qui interroge le colloscope store
   - Nécessite une **date de démarrage** du cycle (stockée dans colloscope ou calculée)
   - Construire les événements comme dans `ColleCalendar.buildEvents()` mais avec des dates réelles

4. **Supprimer `calendar-widget.svelte`** (remplacé)

5. **Supprimer `"colles"` de `SidebarView` type** — l'activité bar n'a plus que `files` et `journal`

### Phase 2 — Colloscope Grid → ViewPanel (1-2h)

**Objectif** : La grille n'est plus dans la sidebar, elle s'ouvre dans le ViewPanel.

1. **Créer `ColloscopePanel.svelte`** :
   - Wrapper pour `ColloscopeGrid.svelte` (réutilisé tel quel)
   - Ajouter header avec titre + bouton fermer
   - S'ouvre via `onSelectFile` avec un path factice (ou un type dédié)

2. **Commande palette `colles: gestion du colloscope`** :
   - Ouvre le ViewPanel avec `ColloscopePanel`
   - Si aucun colloscope chargé → message "Importer d'abord un colloscope"

3. **Commande palette `colles: importer colloscope`** :
   - Ouvre le file picker CSV/XLSX
   - Appelle le parser Rust
   - Charge les stores
   - Ouvre automatiquement `ColloscopePanel` dans ViewPanel

4. **Modifier `sidebar-container.svelte`** :
   - Retirer `<ColleView />` du template
   - Retirer l'import de `ColleView`

### Phase 3 — Spreadsheet élèves (2-3h)

**Objectif** : Gestion des élèves avec groupe, classe, email.

1. **Étendre type `Eleve`** dans `types/colles.ts` :
   ```typescript
   export interface Eleve {
     id: string;
     nom: string;
     prenom: string;
     classe: string;
     groupe: string;
     email: string; // ← nouveau
   }
   ```

2. **Créer `ElevesSpreadsheet.svelte`** :
   - jspreadsheet CE avec colonnes : Nom, Prénom, Classe, Groupe, Email
   - Éditable, auto-save on change
   - Filtres par classe

3. **Créer `ElevesPanel.svelte`** :
   - Wrapper pour `ElevesSpreadsheet` + header
   - S'ouvre via commande palette

4. **Commandes palette** :
   - `colles: liste des élèves` → ouvre `ElevesPanel` dans ViewPanel
   - `colles: importer élèves` → file picker CSV/XLSX → charge `eleves` store

5. **Rust : commande `parse_eleves_csv`** (si nécessaire) :
   - Format : `Nom,Prénom,Classe,Groupe,Email`
   - Réutilise le parser CSV existant comme base

### Phase 4 — Calendrier éditable ViewPanel (4-6h)

**Objectif** : Calendrier complet avec édition dans le ViewPanel.

1. **Créer `CalendarEditor.svelte`** :
   - @event-calendar avec plugins DayGrid + Interaction + TimeGrid
   - Toolbar complète : month/week/day views
   - `editable: true`, `selectable: true`
   - Drag & drop, resize d'événements

2. **Événements cycliques** :
   - Les colles sont cycliques (10 semaines par cycle)
   - Stocker : ` startDate` (début du cycle) + `cycleLength` (nombre de semaines)
   - `buildEvents()` génère les occurrences réelles en boucle sur N cycles
   - Pas besoin de rrule — la boucle dans le store suffit

3. **Persistance calendrier** :
   - Fichier : `.azprose/calendar/events.json`
   - Format :
     ```json
     {
       "events": [
         {
           "id": "manual-1",
           "title": "Réunion",
           "start": "2025-10-15T10:00:00",
           "end": "2025-10-15T11:00:00",
           "color": "#4a90d9",
           "type": "manual"
         }
       ],
       "colles": {
         "startDate": "2025-09-15",
         "cycleLength": 10
       }
     }
     ```
   - Les événements colles sont **calculés** depuis le colloscope + startDate, pas stockés
   - Seuls les événements manuels (type: "manual") sont persistés

4. **Bouton "Éditer" dans sidebar** :
   - Dans `JournalCalendar`, bouton discret qui ouvre `CalendarEditor` dans ViewPanel
   - Transmet les événements actuels au composant d'édition

### Phase 5 — Auto-génération `## Colles` + blocs YAML (3-4h)

**Objectif** : Les daily notes contiennent automatiquement la section Colles.

1. **Modifier `journal-store.createNote()`** :
   - Après `## Travaux en classe`, ajouter `## Colles` si des colles tombent ce jour
   - Interroger le colloscope pour la date → lister les créneaux + groupes
   - Générer un bloc `colle` par élève :

     ````markdown
     ## Colles

     ```colle
     date: 2025-10-15
     eleve: NOM Prénom
     groupe: G3
     classe: MP*1
     matiere: Mathématiques
     colleur: M. Boujaida
     salle: A101
     horaire: 8h-10h
     note:
     - 
     - 
     - 
     ```
     ````

2. **Créer plugin markdown-it `colle-block`** :
   - Détecte les blocs ` ```colle `
   - Parse le YAML (format simple clé: valeur)
   - Génère un HTML structuré : tableau ou definition list
   - Le champ `note` reste vide (l'enseignant le remplit)

3. **CSS pour les blocs colle** :
   - Style cohérent avec les callouts existants
   - Couleur par matière (réutiliser `MATIERE_COLORS`)

4. **Transfert des notes** :
   - Les notes de colle remplies dans les daily notes → synchronisées vers le JSON des fiches
   - Ou lecture seule : les notes restent dans le markdown

### Phase 6 — Nettoyage (1h)

1. Supprimer `ColleView.svelte` (remplacé par ViewPanel)
2. Supprimer `ColleCalendar.svelte` (remplacé par `JournalCalendar`)
3. Retirer `"colles"` de `SidebarView`
4. Retirer l'icône `Table2` de l'activity bar
5. Mettre à jour `AGENTS.md`
6. Mettre à jour les i18n

---

## Ordre de exécution recommandé

```
Phase 1 (sidebar calendar)  ← priorité, impact immédiat
    ↓
Phase 2 (grid → ViewPanel)  ← nettoyage sidebar
    ↓
Phase 3 (spreadsheet élèves) ← données manquantes
    ↓
Phase 4 (calendrier éditable) ← complexe, fait en dernier
    ↓
Phase 5 (auto-génération)   ← dépend de Phase 4 pour les dates
    ↓
Phase 6 (nettoyage)          ← final
```

## Dépendances npm existantes

- `@event-calendar/core` ✅ installé
- `@event-calendar/day-grid` ✅ installé
- `@event-calendar/interaction` ✅ installé
- `@event-calendar/time-grid` ✅ installé
- `jspreadsheet-ce` ✅ installé
- `jsuites` ✅ installé

Pas de nouvelles dépendances nécessaires pour les Phases 1-3.
Phase 4 : `@event-calendar/rrule` optionnel si récurrence avancée (sinon boucle dans le store).
