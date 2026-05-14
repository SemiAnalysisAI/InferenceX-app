export interface ComparisonDateRange {
  startDate: string;
  endDate: string;
}

/**
 * Dates currently represented on the comparison chart: explicitly pinned dates
 * plus comparison range endpoints (when set).
 */
export function buildDatesOnComparisonChart(
  selectedDates: string[],
  selectedDateRange: ComparisonDateRange,
): Set<string> {
  const set = new Set(selectedDates);
  if (selectedDateRange.startDate) set.add(selectedDateRange.startDate);
  if (selectedDateRange.endDate) set.add(selectedDateRange.endDate);
  return set;
}

/**
 * Changelog dates that are not already shown on the chart (candidates for "Pin" / "Pin all").
 */
export function getAddableChangelogDates<T extends { date: string }>(
  filteredChangelogs: T[],
  datesOnChart: Set<string>,
): string[] {
  return filteredChangelogs.map((c) => c.date).filter((d) => !datesOnChart.has(d));
}
