/**
 * Calendar persistence — user‑managed iCal snapshots.
 *
 * Strategy (zero risk):
 *   - localStorage is the primary live store (SVAR's own persistence).
 *   - No automatic sync to `.azprose/`.
 *   - The user manually saves a .ics snapshot (export) or restores one (import)
 *     via native save/open dialogs.
 *   - SVAR's `@svar-ui/calendar-ical` handles the iCal serialisation/parsing.
 */

import { open, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { serializeICal, parseICal } from "@svar-ui/calendar-ical";
import { getCalendarStore } from "@/stores/calendar-store.svelte";
import { notifications } from "@/stores/notifications.svelte";
import type { CalendarEventData } from "@/lib/calendar-types";
import { migrateRecurrence } from "@/calendar/recurrence";

/**
 * Save the current calendar as a .ics file.
 * Opens a native "Save As" dialog; the user chooses where to write.
 */
export async function exportCalendar(): Promise<void> {
  const store = getCalendarStore();
  const events = store.events;
  if (events.length === 0) {
    notifications.setInfo("Le calendrier est vide — rien à exporter");
    return;
  }

  try {
    const icalContent = serializeICal(events);
    const path = await dialogSave({
      title: "Enregistrer le calendrier",
      filters: [{ name: "iCalendar", extensions: ["ics"] }],
      defaultPath: "calendrier.ics",
    });
    if (!path) return; // user cancelled

    await writeTextFile(path, icalContent);
    notifications.setInfo(`Calendrier exporté (${events.length} événements)`);
  } catch (e) {
    console.error("[calendar] export error:", e);
    notifications.setInfo("Erreur lors de l'export");
  }
}

/**
 * Import events from a user‑selected .ics file.
 * Parsed events are merged into the store (existing IDs are preserved).
 */
export async function importCalendar(): Promise<void> {
  try {
    const path = await open({
      multiple: false,
      title: "Charger un calendrier",
      filters: [{ name: "iCalendar", extensions: ["ics"] }],
    });
    if (!path || typeof path !== "string") return; // user cancelled

    const icalContent = await readTextFile(path);
    const parsed = parseICal(icalContent);
    if (parsed.length === 0) {
      notifications.setInfo("Aucun événement trouvé dans le fichier");
      return;
    }

    // Cast to CalendarEventData with migration
    const incoming = parsed.map((e) =>
      migrateRecurrence(e as unknown as CalendarEventData),
    );

    const store = getCalendarStore();
    const existingIds = new Set(store.events.map((e) => e.id));
    const toAdd = incoming.filter((e) => !existingIds.has(e.id));
    const skipped = incoming.length - toAdd.length;

    if (toAdd.length === 0) {
      notifications.setInfo("Tous les événements sont déjà dans le calendrier");
      return;
    }

    store.events = [...store.events, ...toAdd];
    notifications.setInfo(`${toAdd.length} événement(s) importé(s)` +
      (skipped > 0 ? ` (${skipped} déjà présent(s))` : ""));
  } catch (e) {
    console.error("[calendar] import error:", e);
    notifications.setInfo("Erreur lors de l'import");
  }
}

/**
 * Clear all calendar events (localStorage + memory).
 */
export function clearCalendar(): void {
  const store = getCalendarStore();
  store.clearAll();
  notifications.setInfo("Calendrier vidé");
}
