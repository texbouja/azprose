<script lang="ts">
  import {
    Calendar,
    type CalendarInstanceApi,
  } from "@svar-ui/svelte-calendar";
  import { fr } from "@svar-ui/calendar-locales";
  import { fr as frCore } from "@svar-ui/core-locales";
  import { Locale } from "@svar-ui/svelte-core";
  import { tick } from "svelte";

  const words = { ...fr, ...frCore };

  let {
    onSelectDate,
  }: {
    onSelectDate: (date: string) => void;
  } = $props();

  function toDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  let selectedDate = $state<Date | null>(null);
  let calEl = $state<HTMLDivElement | null>(null);

  // ── DOM-based selected-date highlight ────────────────────
  // SVAR Calendar month view DOM:
  //   .wx-grid-cell > span.wx-day-number[data-date="YYYY-MM-DD"]
  // cellCss prop doesn't reliably re-trigger on external $state changes,
  // so we toggle classes directly via $effect + tick() fallback.
  function applyHighlight() {
    if (!calEl) return;
    calEl.querySelectorAll(".wx-selected-date").forEach((el) => {
      el.classList.remove("wx-selected-date");
    });
    if (selectedDate) {
      const ds = toDateString(selectedDate);
      calEl.querySelectorAll(`[data-date="${ds}"]`).forEach((el) => {
        el.closest(".wx-grid-cell")?.classList.add("wx-selected-date");
      });
    }
  }

  // Re-apply when selectedDate changes (immediate DOM)
  $effect(() => {
    void selectedDate;
    applyHighlight();
  });

  // ── Read-only init ──────────────────────────────────────────
  function init(a: CalendarInstanceApi) {
    // Intercept date-cell clicks (view === "day") → open note, stay in month view
    a.intercept("navigate-to", (ctx) => {
      if ("view" in ctx && ctx.view === "day" && "date" in ctx && ctx.date) {
        selectedDate = ctx.date;
        onSelectDate(toDateString(ctx.date));
        ctx.view = "month";
        // Re-apply after Calendar re-renders the grid with new DOM nodes
        tick().then(applyHighlight);
        return true;
      }
      // Chevrons / programmatic navigation → re-apply highlight in new month
      tick().then(applyHighlight);
      return true;
    });

    // Block mutations — read-only
    a.intercept("add-event", () => false);
    a.intercept("update-event", () => false);
    a.intercept("delete-event", () => false);
    a.intercept("move-event", () => false);
  }
</script>

<div class="journal-calendar" bind:this={calEl}>
    <Locale {words}>
      <Calendar
        events={[]}
        view="month"
        views={["month"]}
        readonly
        {init}
      />
    </Locale>
</div>

<style>
  .journal-calendar {
    height: 100%;
    overflow: hidden;
    margin: 6px 8px;
    border-radius: 8px;
    box-shadow:
      0 2px 8px color-mix(in srgb, #000 30%, transparent),
      0 0 1px color-mix(in srgb, #000 20%, transparent);
  }

  /* ── Navigation toolbar (compact) ─────────────────── */
  .journal-calendar :global(.wx-navigation) {
    background: var(--surface, #2a2a3c);
    border-bottom: 1px solid var(--border, #45475a);
    padding: 2px 6px;
    font-family: var(--font-ui, system-ui);
    gap: 4px;
  }

  .journal-calendar :global(.wx-navigation button),
  .journal-calendar :global(.wx-navigation .wx-button) {
    background: var(--surface, #2a2a3c);
    color: var(--fg-muted, #a6adc8);
    border: 1px solid var(--border, #45475a);
    border-radius: 3px;
    padding: 1px 4px;
    font-family: var(--font-ui, system-ui);
    font-size: 10px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .journal-calendar :global(.wx-navigation button:hover),
  .journal-calendar :global(.wx-navigation .wx-button:hover) {
    background: color-mix(in srgb, var(--fg, #cdd6f4) 8%, var(--surface, #2a2a3c));
    color: var(--fg, #cdd6f4);
  }

  .journal-calendar :global(.wx-navigation .wx-nav-title) {
    font-size: 11px;
    font-weight: 600;
    color: var(--fg, #cdd6f4);
    font-family: var(--font-ui, system-ui);
  }

  /* ── Month grid ──────────────────────────────────────── */
  .journal-calendar :global(.wx-month-grid) {
    border-color: var(--border, #45475a);
  }

  .journal-calendar :global(.wx-month-label) {
    color: var(--fg-muted, #a6adc8);
    font-family: var(--font-ui, system-ui);
    font-size: 11px;
    font-weight: 500;
    padding: 4px 0;
    background: var(--surface, #2a2a3c);
    border-color: var(--border, #45475a);
  }

  /* Day cells */
  .journal-calendar :global(.wx-grid-cell) {
    border-color: var(--border, #45475a);
  }

  /* Today: subtle accent ring */
  .journal-calendar :global(.wx-today .wx-day-number) {
    background: color-mix(in srgb, var(--accent, #89b4fa) 20%, transparent);
    color: var(--accent, #89b4fa);
    border-radius: 4px;
  }

  /* Selected date: solid accent rounded rect */
  .journal-calendar :global(.wx-selected-date .wx-day-number) {
    background: var(--accent, #89b4fa);
    color: var(--bg, #1e1e2e);
    border-radius: 4px;
    font-weight: 600;
  }

  /* Day number label */
  .journal-calendar :global(.wx-day-number) {
    font-family: var(--font-ui, system-ui);
    font-size: 11px;
  }

  /* ── Box events ──────────────────────────────────────── */
  .journal-calendar :global(.wx-box-event) {
    border-radius: 3px;
    padding: 1px 4px;
    font-family: var(--font-ui, system-ui);
    font-size: 10px;
    line-height: 1.3;
    cursor: pointer;
    border: none;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--fg, #cdd6f4) 10%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .journal-calendar :global(.wx-box-event:hover) {
    opacity: 0.85;
    box-shadow: 0 2px 4px color-mix(in srgb, var(--fg, #cdd6f4) 15%, transparent);
  }

  /* ── Layout ──────────────────────────────────────────── */
  .journal-calendar :global(.wx-calendar) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .journal-calendar :global(.wx-calendar-main) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
