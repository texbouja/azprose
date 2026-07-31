<script lang="ts">
  import { Counter, Combo, Switch, DatePicker } from "@svar-ui/svelte-core";

  const RFC_DAY_MAP = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

  let {
    value = null,
    onchange,
    eventStartDate = null,
  }: {
    value: string | null;
    onchange: (ev: { value: string | null }) => void;
    eventStartDate?: Date | null;
  } = $props();

  let enabled = $derived(value !== null && value !== undefined);

  // ── Parse RRULE string into local editing state ──────────
  interface LocalState {
    freq: "daily" | "weekly" | "monthly" | "yearly";
    interval: number;
    byDay: string[];
    count?: number;
    until?: string;
  }

  function parseRrule(str: string | null): LocalState {
    if (!str) return { freq: "weekly", interval: 1, byDay: [] };
    try {
      const parts: Record<string, string> = {};
      for (const p of str.split(";")) {
        const [k, ...v] = p.split("=");
        parts[k.toUpperCase()] = v.join("=");
      }
      return {
        freq: (parts.FREQ?.toLowerCase() || "weekly") as LocalState["freq"],
        interval: parseInt(parts.INTERVAL || "1", 10),
        byDay: parts.BYDAY ? parts.BYDAY.split(",") : [],
        count: parts.COUNT ? parseInt(parts.COUNT, 10) : undefined,
        until: parts.UNTIL ? formatUntil(parts.UNTIL) : undefined,
      };
    } catch {
      return { freq: "weekly", interval: 1, byDay: [] };
    }
  }

  function formatUntil(icalUntil: string): string | undefined {
    if (icalUntil.length === 8) {
      return `${icalUntil.slice(0, 4)}-${icalUntil.slice(4, 6)}-${icalUntil.slice(6, 8)}`;
    }
    return undefined;
  }

  function buildRrule(state: LocalState): string {
    const parts = [`FREQ=${state.freq.toUpperCase()}`];
    if (state.interval > 1) parts.push(`INTERVAL=${state.interval}`);
    if (state.freq === "weekly" && state.byDay.length > 0) {
      parts.push(`BYDAY=${state.byDay.join(",")}`);
    }
    if (state.count) parts.push(`COUNT=${state.count}`);
    if (state.until) {
      parts.push(`UNTIL=${state.until.replace(/-/g, "")}`);
    }
    return parts.join(";");
  }

  // ── Local state derived from RRULE string ────────────────
  let state = $derived(parseRrule(value));

  const FREQ_OPTIONS: { id: LocalState["freq"]; label: string }[] = [
    { id: "daily", label: "Jour" },
    { id: "weekly", label: "Semaine" },
    { id: "monthly", label: "Mois" },
    { id: "yearly", label: "Année" },
  ];

  const DAY_OPTIONS = [
    { id: "MO", label: "Lu" },
    { id: "TU", label: "Ma" },
    { id: "WE", label: "Me" },
    { id: "TH", label: "Je" },
    { id: "FR", label: "Ve" },
    { id: "SA", label: "Sa" },
    { id: "SU", label: "Di" },
  ];

  const END_OPTIONS = [
    { id: "never", label: "Jamais" },
    { id: "count", label: "Après N fois" },
    { id: "until", label: "Jusqu'au" },
  ];

  function toggle() {
    if (enabled) {
      onchange({ value: null });
    } else {
      // Default: weekly on the same day as the event's start date
      const dayAbbr = eventStartDate ? RFC_DAY_MAP[eventStartDate.getDay()] : "MO";
      onchange({ value: `FREQ=WEEKLY;BYDAY=${dayAbbr}` });
    }
  }

  function update(patch: Partial<LocalState>) {
    const next = { ...state, ...patch };
    // Auto-select event's day when switching to weekly with no days selected
    if (patch.freq === "weekly" && next.byDay.length === 0) {
      next.byDay = [eventStartDate ? RFC_DAY_MAP[eventStartDate.getDay()] : "MO"];
    }
    onchange({ value: buildRrule(next) });
  }

  function toggleDay(day: string) {
    const current = state.byDay;
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    update({ byDay: next });
  }

  let endMode = $derived(
    state.count ? "count" : state.until ? "until" : "never",
  );

  function setEndMode(val: string | number) {
    const mode = String(val);
    if (mode === "count") {
      update({ count: 10, until: undefined });
    } else if (mode === "until") {
      const d = new Date();
      d.setMonth(d.getMonth() + 3);
      update({ until: d.toISOString().slice(0, 10), count: undefined });
    } else {
      update({ count: undefined, until: undefined });
    }
  }

  function freqLabel(freq: LocalState["freq"], interval: number): string {
    const opt = FREQ_OPTIONS.find((f) => f.id === freq);
    return opt ? opt.label + (interval > 1 ? "s" : "") : "";
  }

  const freqDisplay = $derived(freqLabel(state.freq, state.interval));
</script>

<div class="recurrence-editor">
  <Switch value={enabled} onchange={toggle} />
  <span class="recurrence-toggle-label">Récurrent</span>

  {#if enabled}
    <div class="recurrence-config">
      <!-- Interval + Frequency -->
      <div class="recurrence-row">
        <span class="recurrence-label">Toutes les</span>
        <Counter
          value={state.interval}
          min={1}
          max={99}
          onchange={(ev) => update({ interval: ev.value || 1 })}
        />
        <Combo
          value={state.freq}
          options={FREQ_OPTIONS.map((f) => ({
            id: f.id,
            label: f.id === state.freq ? freqDisplay : f.label + (state.interval > 1 ? "s" : ""),
          }))}
          onchange={(ev) => update({ freq: String(ev.value) as LocalState["freq"] })}
        />
      </div>

      <!-- Day picker (weekly only) -->
      {#if state.freq === "weekly"}
        <div class="recurrence-row">
          <span class="recurrence-label">Le</span>
          <div class="recurrence-days">
            {#each DAY_OPTIONS as day}
              <button
                class="recurrence-day"
                class:active={state.byDay.includes(day.id)}
                onclick={() => toggleDay(day.id)}
                type="button"
              >
                {day.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- End condition -->
      <div class="recurrence-row">
        <Combo
          value={endMode}
          options={END_OPTIONS}
          onchange={(ev) => setEndMode(ev.value)}
        />

        {#if endMode === "count"}
          <Counter
            value={state.count ?? 10}
            min={1}
            max={999}
            onchange={(ev) => update({ count: ev.value || 10 })}
          />
        {:else if endMode === "until"}
          <DatePicker
            value={state.until ? new Date(state.until + "T00:00:00") : undefined}
            buttons={["clear", "today"]}
            onchange={(ev) => update({ until: ev.value ? ev.value.toISOString().slice(0, 10) : undefined })}
          />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .recurrence-editor {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .recurrence-toggle-label {
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    color: var(--fg, #cdd6f4);
  }

  .recurrence-config {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    background: color-mix(in srgb, var(--fg, #cdd6f4) 4%, var(--bg, #1e1e2e));
    border-radius: 4px;
    border: 1px solid var(--border, #45475a);
  }

  .recurrence-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .recurrence-label {
    font-family: var(--font-ui, system-ui);
    font-size: 12px;
    color: var(--fg-muted, #a6adc8);
    white-space: nowrap;
  }

  .recurrence-days {
    display: flex;
    gap: 2px;
  }

  .recurrence-day {
    width: 28px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--border, #45475a);
    border-radius: 3px;
    background: var(--bg, #1e1e2e);
    color: var(--fg-muted, #a6adc8);
    font-family: var(--font-ui, system-ui);
    font-size: 10px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .recurrence-day:hover {
    background: color-mix(in srgb, var(--accent, #89b4fa) 15%, var(--bg, #1e1e2e));
    color: var(--fg, #cdd6f4);
  }

  .recurrence-day.active {
    background: var(--accent, #89b4fa);
    color: var(--bg, #1e1e2e);
    border-color: var(--accent, #89b4fa);
    font-weight: 600;
  }
</style>
