/**
 * Calendar store — reactive event state with SQLite persistence.
 *
 * SQLite (`.azprose/data.db`, table `calendar_events`) is the source of truth.
 * localStorage is only used as a one-time migration source and as a secondary
 * cache during the transition; it is removed once data has been migrated.
 *
 * Events use rrule strings (RFC 5545) for recurrence.
 * Legacy `recurrence` fields are auto-migrated on import.
 */

import type { CalendarEventData } from "@/lib/calendar-types";
import { migrateRecurrence } from "@/calendar/recurrence";
import {
  calendarEventsGet,
  calendarEventsSave,
  calendarEventsClear,
} from "@/lib/calendar-sqlite";

const STORAGE_KEY = "mdview.calendar.events";
const SAVE_DEBOUNCE_MS = 400;

// ── localStorage serialization (legacy — migration source only) ──

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

// ── Module state ─────────────────────────────────────────────

let userEvents = $state<CalendarEventData[]>(loadFromStorage().map(migrateRecurrence));

let _rootPath: string | null = null;
let _loadedRoot: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (!_rootPath || _loadedRoot !== _rootPath) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  const root = _rootPath;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    // Vault may have changed while the timer was pending — never write to the wrong project.
    if (root !== _rootPath || _loadedRoot !== root) return;
    calendarEventsSave(root, userEvents).catch((err) => {
      console.warn("[calendar] save failed:", err);
    });
  }, SAVE_DEBOUNCE_MS);
}

export function getCalendarStore() {
  return {
    get events(): CalendarEventData[] {
      return userEvents;
    },
    set events(v: CalendarEventData[]) {
      userEvents = v;
      saveToStorage(v);
      scheduleSave();
    },

    /** Replace all events (e.g. after import). Migrates legacy recurrence fields. */
    replaceAll(events: CalendarEventData[]) {
      userEvents = events.map(migrateRecurrence);
      saveToStorage(userEvents);
      scheduleSave();
    },

    /** Clear all calendar events from memory + SQLite (+ localStorage). */
    clearAll() {
      userEvents = [];
      localStorage.removeItem(STORAGE_KEY);
      if (_rootPath) {
        calendarEventsClear(_rootPath).catch((err) => {
          console.warn("[calendar] clear failed:", err);
        });
      }
    },

    /**
     * Load events from SQLite for the given vault root.
     * If SQLite is empty and localStorage has legacy events, they are
     * migrated into SQLite (idempotent — runs at most once per root).
     */
    async load(rootPath: string | null) {
      if (!rootPath || _loadedRoot === rootPath) return;
      _rootPath = rootPath;
      try {
        const dbEvents = await calendarEventsGet(rootPath);
        if (dbEvents.length > 0) {
          userEvents = dbEvents.map(migrateRecurrence);
          // SQLite is authoritative — drop any stale legacy localStorage copy
          // (it is only ever a migration source, never a fallback while SQLite has data).
          localStorage.removeItem(STORAGE_KEY);
          _loadedRoot = rootPath;
          return;
        }
        // SQLite empty → one-time migration from legacy localStorage
        const legacy = loadFromStorage().map(migrateRecurrence);
        if (legacy.length > 0) {
          userEvents = legacy;
          await calendarEventsSave(rootPath, userEvents);
          localStorage.removeItem(STORAGE_KEY);
        }
        _loadedRoot = rootPath;
      } catch (err) {
        console.warn("[calendar] load failed, falling back to localStorage:", err);
        userEvents = loadFromStorage().map(migrateRecurrence);
        _loadedRoot = rootPath;
      }
    },

    /**
     * Flush any pending debounced save immediately (window close).
     */
    async flush() {
      if (_saveTimer) {
        clearTimeout(_saveTimer);
        _saveTimer = null;
      }
      if (_rootPath && _loadedRoot === _rootPath) {
        try {
          await calendarEventsSave(_rootPath, userEvents);
        } catch (err) {
          console.warn("[calendar] flush failed:", err);
        }
      }
    },
  };
}
