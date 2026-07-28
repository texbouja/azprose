<script lang="ts">
let {
  value = null as string | null,
  onchange,
}: {
  value?: string | null;
  onchange?: (date: string | null) => void;
} = $props();

let open = $state(false);
let containerEl = $state<HTMLElement | null>(null);

let displayValue = $derived(
  value ? new Date(value + "T00:00:00").toLocaleDateString("fr", { day: "numeric", month: "long", year: "numeric" }) : ""
);

const weekDayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const monthLabels = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

let viewYear = $state(new Date().getFullYear());
let viewMonth = $state(new Date().getMonth());

function prevMonth() {
  if (viewMonth === 0) { viewMonth = 11; viewYear--; }
  else viewMonth--;
}

function nextMonth() {
  if (viewMonth === 11) { viewMonth = 0; viewYear++; }
  else viewMonth++;
}

function selectToday() {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  selectDate(now);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function selectDate(d: Date) {
  const iso = toISO(d);
  value = iso;
  open = false;
  onchange?.(iso);
}

function clearDate() {
  value = null;
  open = false;
  onchange?.(null);
}

function toggleOpen() {
  if (!open && value) {
    const d = new Date(value + "T00:00:00");
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
  }
  open = !open;
}

$effect(() => {
  if (!open) return;
  function handleClickOutside(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      open = false;
    }
  }
  requestAnimationFrame(() => document.addEventListener("mousedown", handleClickOutside));
  return () => document.removeEventListener("mousedown", handleClickOutside);
});

function getDays(year: number, month: number): { date: Date; day: number; currentMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = (first.getDay() + 6) % 7;
  const days: { date: Date; day: number; currentMonth: boolean }[] = [];
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, day: d.getDate(), currentMonth: false });
  }
  for (let i = 1; i <= last.getDate(); i++) {
    days.push({ date: new Date(year, month, i), day: i, currentMonth: true });
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d, day: d.getDate(), currentMonth: false });
  }
  return days;
}

let days = $derived(getDays(viewYear, viewMonth));
let todayISO = $derived(toISO(new Date()));
</script>

<div class="date-picker" bind:this={containerEl}>
  <button type="button" class="date-picker__trigger" onclick={toggleOpen}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    <span class="date-picker__value">{displayValue || "—"}</span>
    <svg class="date-picker__chevron" class:is-open={open} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </button>

  {#if open}
    <div class="date-picker__popup">
      <div class="date-picker__nav">
        <button type="button" class="date-picker__nav-btn" onclick={prevMonth}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="date-picker__month-label">{monthLabels[viewMonth]} {viewYear}</span>
        <button type="button" class="date-picker__nav-btn" onclick={nextMonth}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
      <div class="date-picker__weekdays">
        {#each weekDayLabels as wd}
          <span class="date-picker__weekday">{wd}</span>
        {/each}
      </div>
      <div class="date-picker__grid">
        {#each days as cell}
          <button
            type="button"
            class="date-picker__day"
            class:is-other={!cell.currentMonth}
            class:is-today={cell.currentMonth && toISO(cell.date) === todayISO}
            class:is-selected={cell.currentMonth && toISO(cell.date) === value}
            onclick={() => cell.currentMonth && selectDate(cell.date)}
          >{cell.day}</button>
        {/each}
      </div>
      <div class="date-picker__footer">
        <button type="button" class="date-picker__footer-btn" onclick={selectToday}>Aujourd'hui</button>
        {#if value}
          <button type="button" class="date-picker__footer-btn" onclick={clearDate}>Effacer</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .date-picker {
    position: relative;
    display: inline-block;
  }
  .date-picker__trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--dur-fast) var(--easing);
  }
  .date-picker__trigger:hover {
    border-color: var(--muted);
  }
  .date-picker__trigger:focus-visible {
    outline: none;
    border-color: var(--accent);
  }
  .date-picker__value {
    color: var(--fg);
    min-width: 80px;
    text-align: left;
  }
  .date-picker__chevron {
    color: var(--muted);
    transition: transform var(--dur-fast) var(--easing);
  }
  .date-picker__chevron.is-open {
    transform: rotate(180deg);
  }
  .date-picker__popup {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 1000;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--fg) 15%, transparent);
    padding: 8px;
    min-width: 240px;
  }
  .date-picker__nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .date-picker__nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition: background var(--dur-fast) var(--easing), color var(--dur-fast) var(--easing);
  }
  .date-picker__nav-btn:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    color: var(--fg);
  }
  .date-picker__month-label {
    font-family: var(--font-ui);
    font-size: 12px;
    font-weight: 600;
    color: var(--fg);
  }
  .date-picker__weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    margin-bottom: 2px;
  }
  .date-picker__weekday {
    text-align: center;
    font-family: var(--font-ui);
    font-size: 10px;
    font-weight: 500;
    color: var(--muted);
    padding: 2px 0;
  }
  .date-picker__grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
  }
  .date-picker__day {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--fg);
    font-family: var(--font-ui);
    font-size: 11px;
    cursor: pointer;
    transition: background var(--dur-fast) var(--easing);
  }
  .date-picker__day:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }
  .date-picker__day.is-other {
    color: var(--muted);
    opacity: 0.4;
  }
  .date-picker__day.is-other:hover {
    opacity: 0.7;
  }
  .date-picker__day.is-today {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
    font-weight: 600;
  }
  .date-picker__day.is-selected {
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }
  .date-picker__day.is-selected:hover {
    background: color-mix(in srgb, var(--accent) 85%, var(--bg));
  }
  .date-picker__footer {
    display: flex;
    gap: 6px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }
  .date-picker__footer-btn {
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--accent);
    font-family: var(--font-ui);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 6px;
    transition: background var(--dur-fast) var(--easing);
  }
  .date-picker__footer-btn:hover {
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
</style>
