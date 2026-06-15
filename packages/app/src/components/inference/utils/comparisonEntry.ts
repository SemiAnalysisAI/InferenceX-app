/**
 * Comparison selections (the `selectedDates` array / `i_dates` URL param) are
 * plain strings so they flow unchanged through the date-keyed GPU comparison
 * pipeline (grouping, activeDates, colors, legend). An entry is one of:
 *
 *   - a plain date  — "2026-06-14"             → the whole day's latest run
 *   - a run entry   — "2026-06-14~r27489075807" → one specific run
 *
 * The run's display number (#1, #2, …) is NOT baked into the string — it is
 * derived at render time from the set of runs actually on the chart (see
 * {@link buildRunNumbering}) so it is always sequential and in chronological
 * order, and never goes stale when the run list changes.
 *
 * The separator is `~` (not `_`) because GPUGraph derives ids as
 * `${entry}_${hwKey}_${precision}` and splits on the last `_`; a `_` in the entry
 * would corrupt that. `~` is URL-safe and never appears in dates or run ids.
 * (CSS selectors built from these ids are escaped — see d3-chart/layers/rooflines.)
 */

// Accepts the current `date~r<id>` form and the legacy `date~r<id>~<i>of<n>` form
// (older saved selections) — the baked index, if present, is ignored.
const RUN_ENTRY_RE = /^(?<date>\d{4}-\d{2}-\d{2})~r(?<runId>\d+)(?:~\d+of\d+)?$/u;

export interface ParsedComparisonEntry {
  /** The original entry string (series key). */
  raw: string;
  /** Calendar date the entry belongs to. */
  date: string;
  /** GitHub run id, when this entry pins a specific run. */
  runId?: string;
}

/** Build the entry string for a specific run within a date. */
export function makeRunComparisonEntry(date: string, runId: string): string {
  return `${date}~r${runId}`;
}

/** Parse an entry string into its date and (optional) run components. */
export function parseComparisonEntry(raw: string): ParsedComparisonEntry {
  const m = RUN_ENTRY_RE.exec(raw);
  if (!m?.groups) return { raw, date: raw };
  return { raw, date: m.groups.date, runId: m.groups.runId };
}

/** True when the entry pins a specific run (vs. the date's latest). */
export function isRunComparisonEntry(raw: string): boolean {
  return RUN_ENTRY_RE.test(raw);
}

/** Underlying calendar date — used for chronological sorting and matching. */
export function comparisonEntryDate(raw: string): string {
  return parseComparisonEntry(raw).date;
}

/**
 * Sort key for ordering comparison series: by date, then by run id (which grows
 * monotonically with time) so a date's runs read earliest → latest. A plain-date
 * entry sorts first within its day (run id 0).
 */
export function comparisonEntrySortValue(raw: string): [number, number] {
  const { date, runId } = parseComparisonEntry(raw);
  const t = new Date(date).getTime();
  return [Number.isNaN(t) ? 0 : t, runId ? Number(runId) : 0];
}

/**
 * Assign sequential, chronological 1-based numbers to the run entries in a set,
 * grouped by date (run ids sort chronologically). Plain-date entries are not
 * numbered. The result is gap-free regardless of which runs were selected.
 */
export function buildRunNumbering(entries: string[]): Map<string, number> {
  const byDate = new Map<string, ParsedComparisonEntry[]>();
  for (const raw of entries) {
    const parsed = parseComparisonEntry(raw);
    if (!parsed.runId) continue;
    const list = byDate.get(parsed.date) ?? [];
    list.push(parsed);
    byDate.set(parsed.date, list);
  }
  const numbering = new Map<string, number>();
  for (const list of byDate.values()) {
    list
      .toSorted((a, b) => Number(a.runId) - Number(b.runId))
      .forEach((e, i) => {
        numbering.set(e.raw, i + 1);
      });
  }
  return numbering;
}

/**
 * Human-readable label for legends/line labels, e.g. "2026-06-14 #2". Pass the
 * numbering from {@link buildRunNumbering} (built from the chart's current series)
 * so run entries get their sequential number; plain dates render as the date.
 */
export function comparisonEntryLabel(raw: string, numbering?: Map<string, number>): string {
  const n = numbering?.get(raw);
  return n ? `${comparisonEntryDate(raw)} #${n}` : comparisonEntryDate(raw);
}

/**
 * Resolve the final set of comparison series entries from the user's selections:
 * the date-range endpoints plus individually-added dates/runs, de-duplicated. A
 * range endpoint is dropped when that same date has specific run entries selected
 * — the whole-day "latest" line would just duplicate one of the numbered runs.
 */
export function resolveComparisonEntries(
  selectedDates: string[],
  range: { startDate: string; endDate: string },
): string[] {
  const datesWithRuns = new Set(
    selectedDates.filter(isRunComparisonEntry).map(comparisonEntryDate),
  );
  const entries: string[] = [];
  if (range.startDate && range.endDate) {
    for (const d of [range.startDate, range.endDate]) {
      if (!datesWithRuns.has(d)) entries.push(d);
    }
  }
  entries.push(...selectedDates);
  return [...new Set(entries)];
}
