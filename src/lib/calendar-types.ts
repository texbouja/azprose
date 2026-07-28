/**
 * AZprose calendar event type — extends SVAR's CalendarEvent with typed fields.
 * `text`, `color`, `calendarId`, `persons`, `rrule`, `exdates`, `location`, `priority`
 * are all valid keys thanks to SVAR's `[key: string]: any` index signature,
 * but we declare them explicitly for type safety.
 */

import type { CalendarEvent } from "@svar-ui/calendar-store";

export interface CalendarEventData extends CalendarEvent {
  text: string;
  color?: string;
  calendarId?: string;
  persons?: string[];
  /** RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO,WE" */
  rrule?: string;
  /** Excluded dates for recurring events (ISO date strings "YYYY-MM-DD") */
  exdates?: string[];
  location?: string;
  priority?: string;
}
