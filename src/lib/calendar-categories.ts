/**
 * Semantic calendar categories for the calendar sidebar.
 *
 * Uses CSS custom properties from the theme (--syntax-***) so colors
 * adapt automatically to Catppuccin, Everforest, Nord, Latte, etc.
 */

export interface CalendarCategory {
  id: string;
  label: string;
  css: string;
  /** CSS variable reference, e.g. "var(--syntax-keyword)" */
  color: string;
  active: boolean;
  builtIn: boolean;
}

export const CALENDARS: CalendarCategory[] = [
  { id: "cours",   label: "Cours",             css: "cal-cours",   color: "var(--syntax-keyword)", active: true, builtIn: true },
  { id: "td",      label: "TD et Prep",        css: "cal-td",      color: "var(--syntax-number)",  active: true, builtIn: true },
  // « Devoirs et Colles » couvrait les deux ; les colles ayant désormais leur
  // propre projection depuis le colloscope, elles méritent leur catégorie —
  // sans quoi le filtre de la barre latérale ne saurait pas les séparer.
  { id: "devoirs", label: "Devoirs",           css: "cal-devoirs", color: "var(--syntax-string)",  active: true, builtIn: true },
  { id: "colles",  label: "Colles",            css: "cal-colles",  color: "var(--syntax-function)", active: true, builtIn: true },
  { id: "perso",   label: "Personnel",         css: "cal-perso",   color: "var(--syntax-constant)", active: true, builtIn: true },
];
