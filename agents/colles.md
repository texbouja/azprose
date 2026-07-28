# Plan d'intégration — Gestion des Colles

## Contexte

Application destinée à des profs de prépa (MP/PC/PS) pour gérer :
- Un colloscope (grille semaine × créneau avec rotation de groupes)
- Des fiches de colle (fiches individuelles par semaine/élève)
- Un emploi du temps du prof
- Une banque d'exercices par matière

Données source : fichier Excel (`Colloscope.xlsx`) contenant 6 sheets :
- `Coloscope`, `MP*1`, `MP*2`, `MP1`, `MP2` — vues par classe
- `AFF MP` — vue flat
- `Feuil1`, `Feuil3`, `Groupes` — liste élèves (NOM, PRENOM, CLASSE, GROUPE)

## Phase 1 — Modèle de données et stores

### Types (`src/types/colles.ts`)
```ts
type Creneau = {
  id: string
  matiere: string
  colleur: string
  jour: string        // "Lundi", "Mardi", etc.
  horaire: string     // "12h-13h"
  salle: string
  classe: string      // "MP*1", "MP2", etc.
}

type Semaine = {
  date: string        // "2025-09-15"
  label: string       // "S1", "S2", etc.
}

type Colloscope = {
  semaines: Semaine[]
  creneaux: Creneau[]
  // assignations[creneauId][semaineIndex] = "G1" | "G2" | ... | null
  assignations: Record<string, (string | null)[]>
}

type Eleve = {
  id: string
  nom: string
  prenom: string
  classe: string
  groupe: string
}

type Fiche = {
  id: string
  matiere: string
  colleur: string
  classe: string
  groupe: string
  eleve: string
  semaine: number
  creneau: string
  programme: string
  notes: Record<string, number>  // rubrique → note
  note: number
}
```

### Stores
- `src/stores/colloscope.svelte.ts` — state réactif du colloscope (CRUD créneaux, assignations)
- `src/stores/eleves.svelte.ts` — liste élèves, lookup par groupe/classe
- `src/stores/fiches.svelte.ts` — génération + stockage des fiches

### Persistance
- `.azprose/colles/colloscope.json`
- `.azprose/colles/eleves.json`
- `.azprose/colles/fiches/` — un fichier par fiche

## Phase 2 — Import Excel

### Parser xlsx → store
- Utiliser `xlsx` (SheetJS) ou `openpyxl` via Tauri command pour parser le fichier
- Extraire les headers de semaines (row 6/12, colonnes G+)
- Pour chaque ligne de créneau (row 7+), mapper colonnes → assignations
- Détecter la classe depuis le header de section (row 6: "MP1", row 43: "MP*2", etc.)
- Ignorer les lignes vides ou sans colleur

### Interface import
- Bouton "Import Colloscope" dans les settings
- File picker (`@tauri-apps/plugin-dialog`) pour sélectionner le xlsx
- Preview avant import (nombre de créneaux, semaines, élèves détectés)
- Validation : warn si créneaux chevauchants, groupes incohérents

## Phase 3 — Colloscope grid (jspreadsheet)

### Composant `ColloscopeGrid.svelte`
- jspreadsheet CE avec `filters: true`
- Colonnes fixes : Matière, Colleur, Jour, Horaire, Salle
- Colonnes dynamiques : une par semaine (S1..S20)
- Cellules = groupe (G1-G8), éditable via dropdown
- Coloration par matière (fond coloré)
- Toolbar : Ajouter créneau, Supprimer, Dupliquer
- Context menu : masquer/afficher colonnes (semaines)

### Sélection prof
- Filtre par classe (MP*1, MP*2, MP1, MP2)
- Filtre par colleur (dropdown)
- Le prof ne voit que SES créneaux

## Phase 4 — Vues calendrier (@event-calendar)

### Installation
```
npm install @event-calendar/core
```

### Plugins nécessaires
- `DayGrid` — vues mois/semaine/jour
- `Interaction` — drag & drop, dateClick, eventClick
- `TimeGrid` — vue semaine avec créneaux horaires

### Composant `ColleCalendar.svelte`
- Wrapper `<Calendar>` avec props : `creneaux`, `semaines`, `classe`, `colleur`
- Transformation store → events :
  ```ts
  events = creneaux.flatMap(c =>
    semaines.map((s, i) => ({
      id: `${c.id}-${i}`,
      title: `${c.matiere} — G${assignations[c.id][i]}`,
      start: computeDate(s.date, c.jour, c.horaire),
      end: computeEndDate(s.date, c.jour, c.horaire),
      color: materiaColor(c.matiere),
      extendedProps: { creneau: c, semaine: i, groupe: assignations[c.id][i] }
    }))
  )
  ```
- `dateClick` → ouvre la fiche de colle du jour
- `eventClick` → affiche le détail (élèves du groupe, notes)

### Header toolbar
- `dayGridMonth` / `dayGridWeek` / `dayGridDay`
- Bouton "Aujourd'hui"
- Sélecteur de classe
- Sélecteur de colleur

## Phase 5 — Génération de fiches

### Workflow
1. Le prof clique sur un créneau dans le calendar ou la grille
2. L'app identifie le groupe assigné pour la semaine courante
3. L'app liste les élèves du groupe (depuis `eleves.json`)
4. Pour chaque élève, génère un fichier markdown avec :
   - Frontmatter (matiere, colleur, classe, groupe, eleve, semaine, creneau)
   - En-tête info box (style DataviewJS mais rendu direct)
   - Bloc de macros LaTeX (selon matière)
   - Contenu (planche d'exercices depuis la banque)

### Templates par matière
- `assets/templates/fiche-maths.md` — macros LaTeX maths
- `assets/templates/fiche-physique.md` — macros LaTeX physique
- `assets/templates/fiche-francais.md` — structure française

### Transclusion banque
- Sélection d'exercices depuis `Banque/` via `![[file#heading]]`
- Interface de sélection par matière/chapitre
- Injection dans la fiche au moment de la génération

## Phase 6 — Emploi du temps prof

### Vue dédiée
- Emploi du temps du prof connecté
- Filtre automatique par colleur
- Affiche : jour × horaire → matière + salle + groupe
- Indicateur "cette semaine" avec groupe actuel

### Notification
- Quand la fenêtre s'ouvre sur un jour de colle → afficher la fiche du jour
- Rappel des élèves à interroger

## Phase 7 — Intégration et polish

### Sidebar
- ActivityBar : icône Calendar pour la vue colles
- Switch entre vue grille (colloscope) et vue calendar
- Toggle classe/colleur

### CSS
- Thème dark/light pour @event-calendar
- Couleurs par matière cohérentes
- Responsive (grille scrollable sur mobile)

### i18n
- Clés : `colles.colloscope`, `colles.fiche`, `colles.semaine`, `colles.groupe`
- 4 locales (en, fr, de, es)

## Fichiers à créer

| Fichier | Rôle |
|---------|------|
| `src/types/colles.ts` | Types TypeScript |
| `src/stores/colloscope.svelte.ts` | Store colloscope réactif |
| `src/stores/eleves.svelte.ts` | Store élèves |
| `src/stores/fiches.svelte.ts` | Store fiches |
| `src/components/colles/ColloscopeGrid.svelte` | Grille jspreadsheet |
| `src/components/colles/ColleCalendar.svelte` | Calendar @event-calendar |
| `src/components/colles/FicheEditor.svelte` | Éditeur de fiche |
| `src/components/colles/ColleView.svelte` | Vue principale colles |
| `src/lib/colles/import-xlsx.ts` | Parser Excel → store |
| `src/lib/colles/fiche-generator.ts` | Génération fiches |
| `src/styles/colles/colles.css` | Styles |
| `assets/templates/fiche-*.md` | Templates fiches |

## Ordre d'implémentation

1. **Types + stores** (Phase 1) — base de tout
2. **Import xlsx** (Phase 2) — pouvoir charger des données
3. **ColloscopeGrid** (Phase 3) — visualiser et éditer
4. **ColleCalendar** (Phase 4) — consultation calendrier
5. **Fiche generator** (Phase 5) — production de fiches
6. **Emploi du temps** (Phase 6) — vue prof
7. **CSS + polish** (Phase 7) — finition
