const RUN_ENTRY_RE = /^(?<date>\d{4}-\d{2}-\d{2})~r(?<runId>\d+)(?:~\d+of\d+)?$/u;

export interface ParsedComparisonEntry {
  raw: string;
  date: string;
  runId?: string;
}

export function makeRunComparisonEntry(date: string, runId: string): string {
  return `${date}~r${runId}`;
}

export function parseComparisonEntry(raw: string): ParsedComparisonEntry {
  const m = RUN_ENTRY_RE.exec(raw);
  if (!m?.groups) return { raw, date: raw };
  return { raw, date: m.groups.date, runId: m.groups.runId };
}

export function isRunComparisonEntry(raw: string): boolean {
  return RUN_ENTRY_RE.test(raw);
}

export function comparisonEntryDate(raw: string): string {
  return parseComparisonEntry(raw).date;
}

export function comparisonEntrySortValue(raw: string): [number, number] {
  const { date, runId } = parseComparisonEntry(raw);
  const t = new Date(date).getTime();
  return [Number.isNaN(t) ? 0 : t, runId ? Number(runId) : 0];
}

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

export function comparisonEntryLabel(raw: string, numbering?: Map<string, number>): string {
  const n = numbering?.get(raw);
  return n ? `${comparisonEntryDate(raw)} #${n}` : comparisonEntryDate(raw);
}

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

export function buildActiveComparisonIds(
  selectedGPUs: readonly string[],
  comparisonEntries: readonly string[],
  currentDate?: string,
): Set<string> {
  const entries = currentDate ? [currentDate, ...comparisonEntries] : comparisonEntries;
  const ids = new Set<string>();
  for (const gpu of selectedGPUs) {
    for (const entry of entries) ids.add(`${entry}_${gpu}`);
  }
  return ids;
}
