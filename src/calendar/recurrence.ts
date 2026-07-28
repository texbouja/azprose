/**
 * Recurrence engine for SVAR Calendar, powered by the `rrule` library.
 *
 * Events store recurrence as an RFC 5545 RRULE string (e.g. "FREQ=WEEKLY;BYDAY=MO,WE").
 * This module provides:
 *   - expandRrule() — generate concrete occurrences for a visible date range
 *   - rruleToLabel() — human-readable French label
 *   - configToRrule() — migration from old RecurrenceConfig format
 */

import { RRule } from "rrule";

// ── Expansion ──────────────────────────────────────────────

/**
 * Expand an RRULE string into concrete Dates within [rangeStart, rangeEnd].
 *
 * @param rruleStr  RFC 5545 RRULE string (without DTSTART prefix)
 * @param dtstart   Event start date (used as RRULE's DTSTART)
 * @param rangeStart  Visible range start
 * @param rangeEnd    Visible range end
 * @param exdates  Optional excluded dates (ISO strings or Date objects)
 * @returns Array of occurrence start Dates within the range
 */
export function expandRrule(
  rruleStr: string,
  dtstart: Date,
  rangeStart: Date,
  rangeEnd: Date,
  exdates?: string[],
): Date[] {
  try {
    const rule = RRule.fromString(`DTSTART:${toICalUtc(dtstart)}\nRRULE:${rruleStr}`);

    // rrule lib uses `between()` for range queries — but it requires `inc=true`
    // to include boundary matches. We use a slightly wider window to be safe,
    // then filter.
    const before = new Date(rangeEnd);
    before.setDate(before.getDate() + 1);

    const occurrences = rule.between(rangeStart, before, true);

    if (!exdates || exdates.length === 0) return occurrences;

    // Filter out excluded dates
    const exSet = new Set(exdates.map((d) => normalizeDateKey(d)));
    return occurrences.filter((d) => !exSet.has(normalizeDateKey(d)));
  } catch {
    // Invalid RRULE — return empty rather than crash
    return [];
  }
}

// ── Human-readable label ───────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  DAILY: "jour",
  WEEKLY: "semaine",
  MONTHLY: "mois",
  YEARLY: "an",
};

const DAY_LABELS: Record<string, string> = {
  MO: "lundi",
  TU: "mardi",
  WE: "mercredi",
  TH: "jeudi",
  FR: "vendredi",
  SA: "samedi",
  SU: "dimanche",
};

/**
 * Generate a French human-readable label from an RRULE string.
 * e.g. "FREQ=WEEKLY;BYDAY=MO,WE" → "Toutes les semaines le lundi, mercredi"
 */
export function rruleToLabel(rruleStr: string): string {
  try {
    const parts = parseRruleParts(rruleStr);
    const freq = (parts.FREQ || "WEEKLY").toUpperCase();
    const interval = parseInt(parts.INTERVAL || "1", 10);
    const byDay = parts.BYDAY ? parts.BYDAY.split(",") : [];
    const count = parts.COUNT ? parseInt(parts.COUNT, 10) : undefined;
    const until = parts.UNTIL;

    const freqLabel = FREQ_LABELS[freq] ?? "période";
    const parts_: string[] = ["Toutes les"];

    if (interval === 1) {
      parts_.push(freqLabel + "s");
    } else {
      parts_.push(`${interval}`, freqLabel + "s");
    }

    if (freq === "WEEKLY" && byDay.length > 0) {
      const dayNames = byDay.map((d) => DAY_LABELS[d] ?? d).join(", ");
      parts_.push("le", dayNames);
    }

    if (count) {
      parts_.push(`(${count} fois)`);
    } else if (until) {
      const d = parseUntilDate(until);
      if (d) parts_.push(`(jusqu'au ${d.toLocaleDateString("fr")})`);
    }

    return parts_.join(" ");
  } catch {
    return rruleStr;
  }
}

// ── Migration: old RecurrenceConfig → rrule string ────────

interface LegacyRecurrenceConfig {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  byDay?: string[];
  count?: number;
  until?: string;
}

/**
 * Convert old RecurrenceConfig object to RFC 5545 RRULE string.
 * Used for migrating data from the old custom format.
 */
export function configToRrule(config: LegacyRecurrenceConfig): string {
  const parts = [`FREQ=${config.freq.toUpperCase()}`];
  if (config.interval > 1) parts.push(`INTERVAL=${config.interval}`);
  if (config.byDay && config.byDay.length > 0) parts.push(`BYDAY=${config.byDay.join(",")}`);
  if (config.count) parts.push(`COUNT=${config.count}`);
  if (config.until) {
    // Convert ISO date "2026-06-15" to iCal "20260615"
    parts.push(`UNTIL=${config.until.replace(/-/g, "")}`);
  }
  return parts.join(";");
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Format a Date as iCal UTC timestamp: "YYYYMMDDTHHMMSSZ"
 */
function toICalUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Parse RRULE string into key-value parts.
 * "FREQ=WEEKLY;BYDAY=MO,WE" → { FREQ: "WEEKLY", BYDAY: "MO,WE" }
 */
function parseRruleParts(rruleStr: string): Record<string, string> {
  return Object.fromEntries(
    rruleStr.split(";").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.toUpperCase(), v.join("=")];
    }),
  );
}

/**
 * Normalize a date to a YYYY-MM-DD key for exdate comparison.
 * Handles both Date objects and ISO strings.
 */
function normalizeDateKey(d: Date | string): string {
  if (typeof d === "string") {
    // "2026-03-15T10:00:00" → "2026-03-15"
    return d.slice(0, 10);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Parse an iCal UNTIL value (YYYYMMDD or YYYYMMDDTHHMMSSZ) to a Date.
 */
function parseUntilDate(until: string): Date | null {
  try {
    if (until.length === 8) {
      return new Date(`${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T23:59:59`);
    }
    const y = until.slice(0, 4);
    const m = until.slice(4, 6);
    const d = until.slice(6, 8);
    const H = until.slice(9, 11) || "00";
    const M = until.slice(11, 13) || "00";
    const S = until.slice(13, 15) || "00";
    if (until.endsWith("Z")) {
      return new Date(`${y}-${m}-${d}T${H}:${M}:${S}Z`);
    }
    return new Date(`${y}-${m}-${d}T${H}:${M}:${S}`);
  } catch {
    return null;
  }
}

// ── Legacy types (kept for migration references) ──────────

/**
 * @deprecated Use rrule strings directly on CalendarEventData.rrule
 */
export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

/**
 * @deprecated Use rrule strings directly on CalendarEventData.rrule
 */
export interface RecurrenceConfig {
  freq: RecurrenceFreq;
  interval: number;
  byDay?: string[];
  count?: number;
  until?: string;
}

/**
 * Migrate a legacy CalendarEventData with `recurrence` field to `rrule` field.
 * Returns the same object mutated — safe for in-place migration.
 */
export function migrateRecurrence<T extends { recurrence?: LegacyRecurrenceConfig | null; rrule?: string }>(
  event: T,
): T {
  if (event.recurrence && !event.rrule) {
    (event as any).rrule = configToRrule(event.recurrence);
    delete (event as any).recurrence;
  }
  return event;
}

/**
 * Batch-migrate an array of events.
 */
export function migrateAllRecurrences<T extends { recurrence?: LegacyRecurrenceConfig | null; rrule?: string }>(
  events: T[],
): T[] {
  return events.map(migrateRecurrence);
}
