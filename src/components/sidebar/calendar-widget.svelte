<script lang="ts">
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { Icon } from "@/components/primitives";
let {
  viewedMonth,
  noteDates,
  selectedDate,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: {
  viewedMonth: { year: number; month: number };
  noteDates: Set<string>;
  selectedDate: string | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (date: string) => void;
} = $props();

const DAY_LABELS = ["lu", "ma", "me", "je", "ve", "sa", "di"];

function monthLabel(year: number, month: number): string {
  const d = new Date(year, month, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

interface DayCell {
  date: string;
  day: number;
  currentMonth: boolean;
  isToday: boolean;
  hasNote: boolean;
}

function buildGrid(year: number, month: number): DayCell[] {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();

  // Monday-based: Monday=0 .. Sunday=6
  let startDow = (first.getDay() + 6) % 7;

  const cells: DayCell[] = [];

  // Leading blanks from previous month
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const day = prevMonthLast - i;
    const m = month === 0 ? 12 : month;
    const y = month === 0 ? year - 1 : year;
    const ds = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ date: ds, day, currentMonth: false, isToday: ds === todayStr, hasNote: noteDates.has(ds) });
  }

  // Current month
  for (let d = 1; d <= lastDay; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date: ds, day: d, currentMonth: true, isToday: ds === todayStr, hasNote: noteDates.has(ds) });
  }

  // Trailing blanks
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    const fill = 7 - remainder;
    for (let d = 1; d <= fill; d++) {
      const m = month + 2 > 12 ? 1 : month + 2;
      const y = month + 2 > 12 ? year + 1 : year;
      const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ date: ds, day: d, currentMonth: false, isToday: ds === todayStr, hasNote: noteDates.has(ds) });
    }
  }

  return cells;
}

let grid = $derived(buildGrid(viewedMonth.year, viewedMonth.month));
</script>

<div class="mdv-calendar">
  <header class="mdv-calendar__nav">
    <button type="button" class="mdv-calendar__nav-btn" aria-label="Previous month" onclick={onPrevMonth}>
      <Icon icon={ChevronLeft} size={14} strokeWidth={2} />
    </button>
    <span class="mdv-calendar__month">{monthLabel(viewedMonth.year, viewedMonth.month)}</span>
    <button type="button" class="mdv-calendar__nav-btn" aria-label="Next month" onclick={onNextMonth}>
      <Icon icon={ChevronRight} size={14} strokeWidth={2} />
    </button>
  </header>

  <div class="mdv-calendar__grid" role="grid">
    <div class="mdv-calendar__row mdv-calendar__row--head" role="row">
      {#each DAY_LABELS as label (label)}
        <span class="mdv-calendar__dow" role="columnheader">{label}</span>
      {/each}
    </div>
    {#each grid as cell (cell.date)}
        <button
        type="button"
        class="mdv-calendar__day{cell.currentMonth ? '' : ' is-outside'}{cell.isToday ? ' is-today' : ''}{selectedDate === cell.date ? ' is-selected' : ''}{cell.hasNote ? ' has-note' : ''}"
        role="gridcell"
        aria-label={cell.date}
        onclick={() => onSelectDate(cell.date)}
      >
        <span class="mdv-calendar__day-num">{cell.day}</span>
        {#if cell.hasNote}
          <span class="mdv-calendar__dot" aria-hidden="true"></span>
        {/if}
      </button>
    {/each}
  </div>
</div>
