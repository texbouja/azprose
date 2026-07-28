export interface Creneau {
  id: string;
  matiere: string;
  colleur: string;
  jour: string;
  horaire: string;
  salle: string;
  classe: string;
}

export interface Semaine {
  date: string;
  label: string;
}

export interface Colloscope {
  semaines: Semaine[];
  creneaux: Creneau[];
  assignations: Record<string, (string | null)[]>;
  startDate: string | null;
  endDate: string | null;
}

export interface Eleve {
  id: string;
  nom: string;
  prenom: string;
  classe: string;
  groupe: string;
  email: string;
}

export interface Fiche {
  id: string;
  matiere: string;
  colleur: string;
  classe: string;
  groupe: string;
  eleve: string;
  semaine: number;
  creneau: string;
  programme: string;
  notes: Record<string, number>;
  note: number;
}

export const MATIERES = [
  "Mathématiques",
  "Physique",
  "Français",
  "Anglais",
  "TRAD& Culture Arabe",
  "TP Chimie",
] as const;

export type Matiere = (typeof MATIERES)[number];

export const MATIERE_COLORS: Record<string, string> = {
  "Mathématiques": "#4a90d9",
  "Physique": "#e6a94c",
  "Français": "#72b886",
  "Anglais": "#b496e6",
  "TRAD& Culture Arabe": "#e06464",
  "TP Chimie": "#6b9eeb",
};

export const JOURS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
] as const;
