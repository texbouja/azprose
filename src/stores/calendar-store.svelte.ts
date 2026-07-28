/**
 * Calendar store — reactive event state with localStorage persistence.
 *
 * Holds user-created calendar events. Persists to localStorage
 * for inter-session survival.
 *
 * Events use rrule strings (RFC 5545) for recurrence.
 * Legacy `recurrence` fields are auto-migrated on import.
 */

import type { CalendarEventData } from "@/lib/calendar-types";
import { migrateRecurrence } from "@/calendar/recurrence";

const STORAGE_KEY = "mdview.calendar.events";

// ── Serialization helpers (Date ↔ ISO string) ──────────

function serializeEvents(events: CalendarEventData[]): string {
  return JSON.stringify(events.map((e) => ({
    ...e,
    start: e.start instanceof Date ? e.start.toISOString() : e.start,
    end: e.end instanceof Date ? e.end.toISOString() : e.end,
  })));
}

function deserializeEvents(raw: string): CalendarEventData[] {
  const arr = JSON.parse(raw) as any[];
  return arr.map((e) => ({
    ...e,
    start: typeof e.start === "string" ? new Date(e.start) : e.start,
    end: typeof e.end === "string" ? new Date(e.end) : e.end,
  }));
}

function loadFromStorage(): CalendarEventData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return deserializeEvents(raw);
  } catch {
    return [];
  }
}

function saveToStorage(events: CalendarEventData[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeEvents(events));
  } catch {
    // ignore quota / serialization errors
  }
}

let userEvents = $state<CalendarEventData[]>(loadFromStorage().map(migrateRecurrence));

export function getCalendarStore() {
  return {
    get events(): CalendarEventData[] {
      return userEvents;
    },
    set events(v: CalendarEventData[]) {
      userEvents = v;
      saveToStorage(v);
    },

    /** Replace all events (e.g. after import). Migrates legacy recurrence fields. */
    replaceAll(events: CalendarEventData[]) {
      userEvents = events.map(migrateRecurrence);
      saveToStorage(userEvents);
    },

    /** Clear all calendar events and remove from localStorage. */
    clearAll() {
      userEvents = [];
      localStorage.removeItem(STORAGE_KEY);
    },

    /** Load from disk — no-op (localStorage is loaded at module init). */
    async load(_rootPath: string) {
      // No-op: localStorage persistence is handled at module level.
    },
  };
}
