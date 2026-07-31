<script lang="ts">
  import {
    Calendar,
    Editor,
    CalendarPanel as CalendarGroups,
    ContextMenu,
    getMenuOptions,
    type CalendarInstanceApi,
    type CalendarEvent,
  } from "@svar-ui/svelte-calendar";
  import { fr } from "@svar-ui/calendar-locales";
  import { fr as frCore } from "@svar-ui/core-locales";
  import { Locale } from "@svar-ui/svelte-core";
  import { journal } from "@/stores/journal-store.svelte";
  import { journalSettings } from "@/stores/journal-settings.svelte";
  import { getRootPath } from "@/stores/root-path.svelte";

  const words = { ...fr, ...frCore };

  let api: CalendarInstanceApi | null = $state(null);

  const folder = $derived(journalSettings.current.journalFolder);

  $effect(() => {
    const rp = getRootPath();
    const f = folder;
    journal.scanForNotes(rp, f);
  });

  // ── Journal note events ──────────────────────────────────
  const noteEvents = $derived.by(() => {
    void journal.state.noteDates;
    return Array.from(journal.state.noteDates).map((dateStr: string) => {
      const start = new Date(dateStr + "T00:00:00");
      const end = new Date(dateStr + "T23:59:59");
      return ({
        id: `note-${dateStr}`,
        text: "\u{1F4DD}",
        start,
        end,
        allDay: true,
        color: "transparent",
        calendarId: "notes",
      });
    });
  });

  // ── Combined events ──────────────────────────────────────
  const events = $derived<CalendarEvent[]>(noteEvents);

  // ── Calendar groups ──────────────────────────────────────
  const calendars = $derived([
    { id: "notes", label: "Notes", css: "cal-notes", active: true },
  ]);

  // ── Context menu ──────────────────────────────────────────
  const menuOptions = [...getMenuOptions()];

  function handleContextMenu({ action, context }: { action: any; context: any }) {
    if (action.id === "delete-event") {
      api?.exec("delete-event", { id: context.id });
    }
  }

  // ── Event handlers ──────────────────────────────────────
  function handleEventClick({ event }: { event: CalendarEvent }) {
    const eventId = String(event?.id ?? "");
    if (eventId.startsWith("note-")) {
      const dateStr = eventId.replace("note-", "");
      window.dispatchEvent(new CustomEvent("azprose:journal-date-click", { detail: { date: dateStr } }));
    }
  }

  function init(a: CalendarInstanceApi) {
    api = a;
    a.on("select-event", handleEventClick as any);
    // Intercept navigate-to: clicking an empty date cell creates/opens a daily note
    a.intercept("navigate-to", (ctx: any) => {
      if ("view" in ctx && ctx.view === "day" && "date" in ctx && ctx.date) {
        const d: Date = ctx.date;
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        window.dispatchEvent(new CustomEvent("azprose:journal-date-click", { detail: { date: dateStr } }));
      }
    });
  }
</script>

<div class="journal-calendar-panel">
    <Locale {words}>
      <ContextMenu {api} options={menuOptions} onclick={handleContextMenu}>
        <Calendar
          {events}
          view="month"
          views={[
            {
              id: "day",
              sections: { timeGrid: { yScale: { startHour: 8, endHour: 22 } } },
            },
            {
              id: "week",
              sections: { timeGrid: { yScale: { startHour: 8, endHour: 22 } } },
            },
            "month",
          ]}
          {init}
          cellCss={(ctx) => {
            if (ctx.date) {
              const d = ctx.date.getDay();
              if (d === 0 || d === 6) return "wx-weekend";
            }
            return "";
          }}
        >
          <CalendarGroups {calendars} accessor="calendarId" />
        </Calendar>
        {#if api}
          <Editor {api} />
        {/if}
      </ContextMenu>
    </Locale>
</div>

<style>
  .journal-calendar-panel {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* ── Navigation toolbar ──────────────────────────────── */
  .journal-calendar-panel :global(.wx-navigation) {
    background: var(--surface, #2a2a3c);
    border-bottom: 1px solid var(--border, #45475a);
    padding: 6px 12px;
    font-family: var(--font-ui, system-ui);
    gap: 8px;
  }

  .journal-calendar-panel :global(.wx-navigation button),
  .journal-calendar-panel :global(.wx-navigation .wx-button) {
    background: var(--surface, #2a2a3c);
    color: var(--fg-muted, #a6adc8);
    border: 1px solid var(--border, #45475a);
    border-radius: 4px;
    padding: 4px 10px;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .journal-calendar-panel :global(.wx-navigation button:hover),
  .journal-calendar-panel :global(.wx-navigation .wx-button:hover) {
    background: color-mix(in srgb, var(--fg, #cdd6f4) 8%, var(--surface, #2a2a3c));
    color: var(--fg, #cdd6f4);
  }

  .journal-calendar-panel :global(.wx-navigation .wx-button-active),
  .journal-calendar-panel :global(.wx-navigation button.wx-button-active) {
    background: var(--accent, #89b4fa);
    color: var(--bg, #1e1e2e);
    border-color: var(--accent, #89b4fa);
  }

  .journal-calendar-panel :global(.wx-navigation .wx-nav-title) {
    font-size: 15px;
    font-weight: 600;
    color: var(--fg, #cdd6f4);
    font-family: var(--font-ui, system-ui);
  }

  /* ── Month grid ──────────────────────────────────────── */
  .journal-calendar-panel :global(.wx-month-grid) {
    border-color: var(--border, #45475a);
  }

  .journal-calendar-panel :global(.wx-month-label) {
    color: var(--fg-muted, #a6adc8);
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 0;
    background: var(--surface, #2a2a3c);
    border-color: var(--border, #45475a);
  }

  .journal-calendar-panel :global(.wx-month-day) {
    border-color: var(--border, #45475a);
  }

  .journal-calendar-panel :global(.wx-today .wx-month-day-label) {
    background: color-mix(in srgb, var(--accent, #89b4fa) 20%, transparent);
    color: var(--accent, #89b4fa);
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Box events ──────────────────────────────────────── */
  .journal-calendar-panel :global(.wx-box-event) {
    border-radius: 4px;
    padding: 2px 6px;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    line-height: 1.3;
    cursor: pointer;
    border: none;
    box-shadow: 0 1px 3px color-mix(in srgb, var(--fg, #cdd6f4) 10%, transparent);
  }

  .journal-calendar-panel :global(.wx-box-event:hover) {
    opacity: 0.85;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--fg, #cdd6f4) 15%, transparent);
  }

  /* ── CalendarPanel (sidebar groups) ──────────────────── */
  .journal-calendar-panel :global(.wx-calendar-panel) {
    background: var(--surface, #2a2a3c);
    border-right: 1px solid var(--border, #45475a);
    padding: 12px;
    font-family: var(--font-ui, system-ui);
    font-size: 13px;
  }

  .journal-calendar-panel :global(.wx-calendar-name) {
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--fg, #cdd6f4);
    font-size: 12px;
  }

  /* ── Layout ──────────────────────────────────────────── */
  .journal-calendar-panel :global(.wx-calendar) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .journal-calendar-panel :global(.wx-calendar-main) {
    flex: 1;
    min-height: 0;
  }

  .journal-calendar-panel :global([data-menu-ignore]) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .journal-calendar-panel :global(.wx-calendar-sidebar) {
    flex-shrink: 0;
  }

  /* ── Context menu ────────────────────────────────────── */
  .journal-calendar-panel :global(.wx-context-menu) {
    background: var(--surface, #2a2a3c);
    border: 1px solid var(--border, #45475a);
    border-radius: 6px;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--fg, #cdd6f4) 15%, transparent);
    padding: 4px;
    font-family: var(--font-ui, system-ui);
    font-size: 13px;
  }

  .journal-calendar-panel :global(.wx-context-menu-item) {
    color: var(--fg, #cdd6f4);
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
  }

  .journal-calendar-panel :global(.wx-context-menu-item:hover) {
    background: color-mix(in srgb, var(--fg, #cdd6f4) 8%, var(--surface, #2a2a3c));
  }
</style>
