/**
 * Shared logic for converting colloscope data to calendar events.
 * Used by both SvarCalendarPanel (display) and ColloscopePanel (export).
 */

import { MATIERE_COLORS } from "@/types/colles";
import type { CalendarEventData } from "@/lib/calendar-types";

const JOUR_TO_WEEKDAY: Record<string, number> = {
  Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6,
};

/** Jour names → RRULE BYDAY codes */
const JOUR_TO_RRULE: Record<string, string> = {
  Lundi: "MO", Mardi: "TU", Mercredi: "WE", Jeudi: "TH", Vendredi: "FR", Samedi: "SA",
};

export function materiaColor(matiere: string): string {
  return MATIERE_COLORS[matiere] ?? "#666";
}

export function computeDate(semaineDate: string, jour: string, horaire: string): Date {
  const base = new Date(semaineDate + "T00:00:00");
  base.setDate(base.getDate() + (JOUR_TO_WEEKDAY[jour] ?? 1) - 1);
  const match = horaire.match(/(\d{1,2})h/);
  if (match) base.setHours(parseInt(match[1], 10), 0, 0);
  return base;
}

export function computeEndDate(date: Date, horaire: string): Date {
  const end = new Date(date);
  const match = horaire.match(/[-–]\s*(\d{1,2})h/);
  if (match) {
    end.setHours(parseInt(match[1], 10), 0, 0);
  } else {
    end.setHours(end.getHours() + 1);
  }
  return end;
}

export interface ColloscopeLike {
  state: {
    semaines: Array<{ date: string }>;
    creneaux: Array<{
      id: string;
      matiere: string;
      colleur: string;
      jour: string;
      horaire: string;
      salle: string;
      classe: string;
    }>;
  };
  getGroupe(creneauId: string, weekIndex: number): string | null;
}

// ── Export options ────────────────────────────────────────

export interface CollesExportOptions {
  /** Filter: only export creneaux whose colleur matches (case-insensitive). */
  colleurFilter: string;
  /** Start date of first week (YYYY-MM-DD). */
  startDate: string;
  /** End date of last week (YYYY-MM-DD). Events recur until this date. */
  endDate: string;
}

/**
 * Format a YYYY-MM-DD date string to iCal UTC timestamp: "YYYYMMDDT235959Z"
 * Used for RRULE UNTIL.
 */
function toICalUntil(dateStr: string): string {
  return dateStr.replace(/-/g, "") + "T235959Z";
}

// ── Legacy flat export (kept for SvarCalendarPanel display) ──

/**
 * Generate CalendarEventData[] from ALL creneaux × semaines (flat, no rrule).
 * Used by SvarCalendarPanel for read-only display of colloscope on calendar.
 */
export function collesToCalendarEvents(
  colloscope: ColloscopeLike,
): CalendarEventData[] {
  const result: CalendarEventData[] = [];
  const semaines = colloscope.state.semaines;
  const creneaux = colloscope.state.creneaux;
  let evIdx = 0;

  for (const c of creneaux) {
    for (let i = 0; i < semaines.length; i++) {
      const groupe = colloscope.getGroupe(c.id, i);
      if (!groupe) continue;

      const start = computeDate(semaines[i].date, c.jour, c.horaire);
      const end = computeEndDate(start, c.horaire);

      result.push({
        id: `colle-${c.id}-${i}-${evIdx++}`,
        text: `${c.matiere} · ${c.classe} · ${groupe}`,
        start,
        end,
        color: materiaColor(c.matiere),
        calendarId: "devoirs",
        location: c.salle || undefined,
      });
    }
  }
  return result;
}

// ── Recurring export (filtered by colleur) ────────────────

/**
 * Generate recurring CalendarEventData[] for a single prof's colles.
 *
 * For each creneau matching the colleur:
 *   - One recurring event with FREQ=WEEKLY;BYDAY=XX;UNTIL=...
 *   - Text: "Matière · Classe · G1/G2/G3" (all groups for this creneau)
 *   - First occurrence computed from startDate + jour + horaire
 *   - Recurrence ends at endDate
 */
export function exportCollesRecurring(
  colloscope: ColloscopeLike,
  options: CollesExportOptions,
): CalendarEventData[] {
  const { colleurFilter, startDate, endDate } = options;
  const result: CalendarEventData[] = [];
  const semaines = colloscope.state.semaines;
  const creneaux = colloscope.state.creneaux;

  if (!semaines.length || !startDate || !endDate) return result;

  const filter = colleurFilter.trim().toLowerCase();
  if (!filter) return result;

  for (const c of creneaux) {
    // Filter: only creneaux matching the profile's colleur name
    if (c.colleur.trim().toLowerCase() !== filter) continue;

    const byday = JOUR_TO_RRULE[c.jour];
    if (!byday) continue;

    // First occurrence: startDate week + jour offset + horaire time
    const firstOccurrence = computeDate(startDate, c.jour, c.horaire);
    const endOccurrence = computeEndDate(firstOccurrence, c.horaire);

    // RRULE: weekly on that day, until endDate
    const rrule = `FREQ=WEEKLY;BYDAY=${byday};UNTIL=${toICalUntil(endDate)}`;

    // Collect all groups for this creneau across all weeks
    const groups = new Set<string>();
    for (let i = 0; i < semaines.length; i++) {
      const g = colloscope.getGroupe(c.id, i);
      if (g) groups.add(g);
    }
    const groupeStr = [...groups].join("/");

    result.push({
      id: `colle-${c.id}`,
      text: `${c.matiere} · ${c.classe} · ${groupeStr}`,
      start: firstOccurrence,
      end: endOccurrence,
      color: materiaColor(c.matiere),
      calendarId: "devoirs",
      location: c.salle || undefined,
      rrule,
      persons: [c.colleur],
    });
  }

  return result;
}
