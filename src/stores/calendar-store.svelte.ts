/**
 * Calendar store — reactive event state with SQLite persistence.
 *
 * SQLite (`.azprose/data.db`, table `calendar_events`) is the source of truth.
 * localStorage is only used as a one-time migration source and as a secondary
 * cache during the transition; it is removed once data has been migrated.
 *
 * The localStorage key is scoped per project (session.ts scopedKey) so events
 * never leak between vaults sharing the same WebView origin. The key must be
 * resolved lazily (at each access) because the project scope is only known
 * after boot — a module-load evaluation would read the unscoped global key.
 *
 * Events use rrule strings (RFC 5545) for recurrence.
 * Legacy `recurrence` fields are auto-migrated on import.
 */

import type { CalendarEventData } from "@/lib/calendar-types";
import { migrateRecurrence } from "@/calendar/recurrence";
import { scopedKey } from "@/lib/session";
import {
  calendarEventsGet,
  calendarEventsSave,
  calendarEventsClear,
} from "@/lib/calendar-sqlite";

const SAVE_DEBOUNCE_MS = 400;

/** Scoped localStorage key — resolved lazily (project scope set after boot). */
function storageKey(): string {
  return scopedKey("mdview.calendar.events");
}

/**
 * Pre-isolation unscoped key. Data was migrated to SQLite (source of truth)
 * when isolation landed; this key is now dead and only cleaned up here.
 */
const LEGACY_STORAGE_KEY = "mdview.calendar.events";

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
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    return deserializeEvents(raw);
  } catch {
    return [];
  }
}

function saveToStorage(events: CalendarEventData[]): void {
  try {
    localStorage.setItem(storageKey(), serializeEvents(events));
  } catch {
    // ignore quota / serialization errors
  }
}

// ── Module state ─────────────────────────────────────────────

// Intentionally NOT loaded from localStorage at module init: the project
// scope is unknown before boot, so a module-load read would hit the unscoped
// global key (cross-vault leak). State starts empty and load() populates it
// once the scope is set.
let userEvents = $state<CalendarEventData[]>([]);

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
      localStorage.removeItem(storageKey());
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
      // Legacy pre-isolation key — never read, only purged.
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      try {
        const dbEvents = await calendarEventsGet(rootPath);
        if (dbEvents.length > 0) {
          userEvents = dbEvents.map(migrateRecurrence);
          // SQLite is authoritative — drop any stale legacy localStorage copy
          // (it is only ever a migration source, never a fallback while SQLite has data).
          localStorage.removeItem(storageKey());
          _loadedRoot = rootPath;
          return;
        }
        // SQLite empty → one-time migration from scoped localStorage
        const legacy = loadFromStorage().map(migrateRecurrence);
        if (legacy.length > 0) {
          userEvents = legacy;
          await calendarEventsSave(rootPath, userEvents);
          localStorage.removeItem(storageKey());
        }
        _loadedRoot = rootPath;
      } catch (err) {
        console.warn("[calendar] load failed, falling back to scoped localStorage:", err);
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
