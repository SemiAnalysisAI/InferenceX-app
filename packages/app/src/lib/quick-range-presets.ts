/**
 * Quick-range presets for the inference date-range selector.
 *
 * Each preset takes the list of available benchmark dates (sorted ASC, ISO YYYY-MM-DD)
 * and returns a {startDate, endDate} pair, or null if the window cannot be satisfied
 * (fewer than 2 data points fall in the window).
 */

export interface QuickRangePreset {
  id: string;
  label: string;
  /**
   * `null` is a sentinel for "not enough data points in this window" — used so the UI
   * can render a disabled chip with a tooltip instead of hiding the affordance.
   */
  getRange: (availableDates: string[]) => { startDate: string; endDate: string } | null;
}

function filterFromCutoff(
  availableDates: string[],
  cutoffISO: string,
): { startDate: string; endDate: string } | null {
  const filtered = availableDates.filter((d) => d >= cutoffISO);
  if (filtered.length < 2) return null;
  return { startDate: filtered[0], endDate: filtered.at(-1)! };
}

function daysAgoISO(days: number, today: Date = new Date()): string {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString().slice(0, 10);
}

export function buildQuickRangePresets(today: Date = new Date()): QuickRangePreset[] {
  return [
    {
      id: '7d',
      label: '7D',
      getRange: (dates) => filterFromCutoff(dates, daysAgoISO(7, today)),
    },
    {
      id: '30d',
      label: '30D',
      getRange: (dates) => filterFromCutoff(dates, daysAgoISO(30, today)),
    },
    {
      id: '90d',
      label: '90D',
      getRange: (dates) => filterFromCutoff(dates, daysAgoISO(90, today)),
    },
    {
      id: 'ytd',
      label: 'YTD',
      getRange: (dates) => filterFromCutoff(dates, `${today.getFullYear()}-01-01`),
    },
    {
      id: 'all',
      label: 'All',
      getRange: (dates) => {
        if (dates.length < 2) return null;
        return { startDate: dates[0], endDate: dates.at(-1)! };
      },
    },
  ];
}

/**
 * Round-trip a {startDate, endDate} back to the preset id that would produce it,
 * so URL-restored ranges light up the matching chip.
 *
 * Returns the preset id (e.g. 'all') or null if the range is custom.
 */
export function matchActivePreset(
  range: { startDate: string; endDate: string },
  availableDates: string[],
  today: Date = new Date(),
): string | null {
  if (!range.startDate || !range.endDate) return null;
  const presets = buildQuickRangePresets(today);
  for (const preset of presets) {
    const presetRange = preset.getRange(availableDates);
    if (
      presetRange &&
      presetRange.startDate === range.startDate &&
      presetRange.endDate === range.endDate
    ) {
      return preset.id;
    }
  }
  return null;
}
