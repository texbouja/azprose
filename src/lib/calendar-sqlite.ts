// ── IPC wrapper for SQLite-backed calendar events ──────────────────────────
// Mirrors the Rust `calendar_db.rs` commands. Events are stored with typed
// columns (id/text/start/end/all_day/calendar_id/color) + a `data` JSONB blob
// holding every custom field (rrule, exdates, persons, location, priority, …).
// This is the same split SVAR's provider does: JSON for everything except dates.

import { invoke } from "@tauri-apps/api/core";
import type { CalendarEventData } from "@/lib/calendar-types";

interface CalendarEventRow {
  id: string;
  text: string;
  start: string;
  end: string;
  all_day: boolean;
  calendar_id: string | null;
  color: string | null;
  data: string;
}

/** Load all events from SQLite (start/end come back as Date objects). */
export async function calendarEventsGet(root: string): Promise<CalendarEventData[]> {
  const rows = await invoke<CalendarEventRow[]>("calendar_events_get", { root });
  return rows.map((r) => {
    let extra: Record<string, unknown> = {};
    try {
      extra = JSON.parse(r.data || "{}") as Record<string, unknown>;
    } catch {
      // corrupt data blob — ignore rather than crash the whole calendar
    }
    return {
      id: r.id,
      text: r.text,
      start: new Date(r.start),
      end: new Date(r.end),
      allDay: r.all_day,
      calendarId: r.calendar_id ?? undefined,
      color: r.color ?? undefined,
      ...extra,
    } as unknown as CalendarEventData;
  });
}

/** Upsert events into SQLite (transactional). */
export async function calendarEventsSave(root: string, events: CalendarEventData[]): Promise<void> {
  const rows: CalendarEventRow[] = events.map((e) => {
    const { id, text, start, end, allDay, calendarId, color, ...extra } =
      e as CalendarEventData & Record<string, unknown>;
    return {
      id: String(id),
      text: text ?? "",
      start: toIso(start),
      end: toIso(end),
      all_day: !!allDay,
      calendar_id: calendarId ?? null,
      color: color ?? null,
      data: JSON.stringify(extra),
    };
  });
  await invoke("calendar_events_save", { root, events: JSON.stringify(rows) });
}

/** Delete a single event by id. */
export async function calendarEventsDelete(root: string, id: string): Promise<void> {
  await invoke("calendar_events_delete", { root, id });
}

/** Delete all events (used by "clear calendar"). */
export async function calendarEventsClear(root: string): Promise<void> {
  await invoke("calendar_events_clear", { root });
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
