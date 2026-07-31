<script lang="ts">
  import {
    Calendar,
    CalendarPanel as CalendarGroups,
    ContextMenu,
    getMenuOptions,
    type CalendarInstanceApi,
    type CalendarEvent,
  } from "@svar-ui/svelte-calendar";
  import { fr } from "@svar-ui/calendar-locales";
  import { fr as frCore } from "@svar-ui/core-locales";
  import { Locale } from "@svar-ui/svelte-core";
  import { getCalendarStore } from "@/stores/calendar-store.svelte";
  import { CALENDARS } from "@/lib/calendar-categories";
  import { expandRrule } from "@/calendar/recurrence";

  const words = { ...fr, ...frCore };
  const store = getCalendarStore();

  let api: CalendarInstanceApi | null = $state(null);

  // ── Expand recurring events ──────────────────────────────
  const expandedEvents = $derived.by<CalendarEvent[]>(() => {
    const rangeStart = new Date();
    rangeStart.setMonth(rangeStart.getMonth() - 6);
    const rangeEnd = new Date();
    rangeEnd.setMonth(rangeEnd.getMonth() + 12);

    const result: CalendarEvent[] = [];
    for (const ev of store.events) {
      if (!(ev.start instanceof Date) || !(ev.end instanceof Date)) continue;
      if (ev.rrule) {
        const occurrences = expandRrule(ev.rrule, ev.start, rangeStart, rangeEnd, ev.exdates);
        const duration = ev.end.getTime() - ev.start.getTime();
        for (let i = 0; i < occurrences.length; i++) {
          const d = occurrences[i];
          const end = new Date(d.getTime() + duration);
          result.push({
            ...ev,
            id: `${ev.id}__${d.getTime()}`,
            start: d,
            end,
          });
        }
      } else {
        result.push(ev);
      }
    }
    return result;
  });

  // ── Calendar groups ──────────────────────────────────────
  const calendars = $derived(CALENDARS.map((c) => ({
    id: c.id,
    label: c.label,
    css: c.css,
    active: c.active,
  })));

  // ── Context menu ──────────────────────────────────────────
  const menuOptions = [...getMenuOptions()];

  function handleContextMenu({ action, context }: { action: any; context: any }) {
    if (action.id === "delete-event") {
      api?.exec("delete-event", { id: context.id });
    }
  }

  function init(a: CalendarInstanceApi) {
    api = a;
  }
</script>

<div class="calendar-panel">
  <Locale {words}>
      <ContextMenu {api} options={menuOptions} onclick={handleContextMenu}>
        <Calendar
          events={expandedEvents}
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
        >
          <CalendarGroups {calendars} accessor="calendarId" />
        </Calendar>
      </ContextMenu>
  </Locale>
</div>

<style>
  .calendar-panel {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* ── Navigation toolbar ──────────────────────────────── */
  .calendar-panel :global(.wx-navigation) {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 6px 12px;
    font-family: var(--font-ui, system-ui);
    gap: 8px;
  }

  .calendar-panel :global(.wx-navigation button),
  .calendar-panel :global(.wx-navigation .wx-button) {
    background: var(--surface);
    color: var(--fg-muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 10px;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .calendar-panel :global(.wx-navigation button:hover),
  .calendar-panel :global(.wx-navigation .wx-button:hover) {
    background: color-mix(in srgb, var(--fg) 8%, var(--surface));
    color: var(--fg);
  }

  .calendar-panel :global(.wx-navigation .wx-button-active),
  .calendar-panel :global(.wx-navigation button.wx-button-active) {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .calendar-panel :global(.wx-navigation .wx-nav-title) {
    font-size: 15px;
    font-weight: 600;
    color: var(--fg);
    font-family: var(--font-ui, system-ui);
  }

  /* ── Month grid ──────────────────────────────────────── */
  .calendar-panel :global(.wx-month-grid) {
    border-color: var(--border);
  }

  .calendar-panel :global(.wx-month-label) {
    color: var(--fg-muted);
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 0;
    background: var(--surface);
    border-color: var(--border);
  }

  .calendar-panel :global(.wx-month-day) {
    border-color: var(--border);
  }

  .calendar-panel :global(.wx-today .wx-month-day-label) {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    color: var(--accent);
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Box events (month view) ─────────────────────────── */
  .calendar-panel :global(.wx-box-event) {
    border-radius: 4px;
    padding: 2px 6px;
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    line-height: 1.3;
    cursor: pointer;
    border: none;
    box-shadow: 0 1px 3px color-mix(in srgb, var(--fg) 10%, transparent);
  }

  .calendar-panel :global(.wx-box-event:hover) {
    opacity: 0.85;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--fg) 15%, transparent);
  }

  /* ── CalendarPanel (sidebar groups) ──────────────────── */
  .calendar-panel :global(.wx-calendar-panel) {
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 12px;
    font-family: var(--font-ui, system-ui);
    font-size: 13px;
  }

  .calendar-panel :global(.wx-calendar-name) {
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--fg);
    font-size: 12px;
  }

  /* ── Calendar category colours (theme-adaptive) ──────── */
  .calendar-panel :global(.cal-cours.wx-calendar-name) {
    background: color-mix(in srgb, var(--syntax-keyword) 20%, var(--surface));
    color: var(--syntax-keyword);
  }

  .calendar-panel :global(.cal-td.wx-calendar-name) {
    background: color-mix(in srgb, var(--syntax-number) 20%, var(--surface));
    color: var(--syntax-number);
  }

  .calendar-panel :global(.cal-devoirs.wx-calendar-name) {
    background: color-mix(in srgb, var(--syntax-string) 20%, var(--surface));
    color: var(--syntax-string);
  }

  .calendar-panel :global(.cal-perso.wx-calendar-name) {
    background: color-mix(in srgb, var(--syntax-constant) 20%, var(--surface));
    color: var(--syntax-constant);
  }

  /* ── Layout ──────────────────────────────────────────── */
  .calendar-panel :global(.wx-calendar) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .calendar-panel :global(.wx-calendar-main) {
    flex: 1;
    min-height: 0;
  }

  .calendar-panel :global([data-menu-ignore]) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .calendar-panel :global(.wx-calendar-sidebar) {
    flex-shrink: 0;
  }

  /* ── Context menu ────────────────────────────────────── */
  .calendar-panel :global(.wx-context-menu) {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 4px 16px color-mix(in srgb, var(--fg) 15%, transparent);
    padding: 4px;
    font-family: var(--font-ui, system-ui);
    font-size: 13px;
  }

  .calendar-panel :global(.wx-context-menu-item) {
    color: var(--fg);
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
  }

  .calendar-panel :global(.wx-context-menu-item:hover) {
    background: color-mix(in srgb, var(--fg) 8%, var(--surface));
  }
</style>
