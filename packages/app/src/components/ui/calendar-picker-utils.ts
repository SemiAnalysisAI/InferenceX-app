import { useState } from 'react';

const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export interface CalendarDateBounds {
  minAllowedDate: Date;
  maxAllowedDate: Date;
  earliestMonth: Date;
  latestMonth: Date;
}

export interface CalendarDayState {
  selected?: boolean;
  disabled?: boolean;
  hovered?: boolean;
  inRange?: boolean;
  outOfRange?: boolean;
}

export interface CalendarMonthPanelProps {
  month: Date;
  onPreviousMonth?: () => void;
  onNextMonth?: () => void;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  isDisabled?: boolean;
  getDayState: (date: Date) => CalendarDayState;
  onDateClick: (date: Date) => void;
  onDateHover?: (date: Date | null) => void;
}

type CalendarMonthResetDep = string | number | boolean | null | undefined;

export function parseCalendarDate(dateStr: string): Date {
  if (dateStr.includes('-') && !dateStr.includes(',')) {
    const [year, month, day] = dateStr.split('-');
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const [datePart] = dateStr.split(', ');
  const [month, day, year] = datePart.split('/');
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function formatCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateStr: string): string {
  return DISPLAY_DATE_FORMATTER.format(parseCalendarDate(dateStr));
}

export function getLatestSelectableDate(availableDates?: string[], maxDate?: string): string {
  if (availableDates && availableDates.length > 0) {
    // Callers provide ascending dates; first/last are the min/max selectable entries.
    return availableDates.at(-1)!;
  }

  return maxDate || formatCalendarDate(new Date());
}

export function resolveCalendarDateBounds(
  minDate: string | undefined,
  maxDate: string | undefined,
  availableDates: string[] | undefined,
  fallbackMinDate: string,
): CalendarDateBounds {
  const minAllowedDate = parseCalendarDate(minDate || fallbackMinDate);
  const maxAllowedDate = maxDate ? parseCalendarDate(maxDate) : new Date();
  maxAllowedDate.setHours(23, 59, 59, 999);

  // Callers provide ascending dates; first/last bound the month navigation range.
  const earliestMonth =
    availableDates && availableDates.length > 0
      ? parseCalendarDate(availableDates[0])
      : minAllowedDate;
  const latestMonth =
    availableDates && availableDates.length > 0
      ? parseCalendarDate(availableDates.at(-1)!)
      : maxAllowedDate;

  return {
    minAllowedDate,
    maxAllowedDate,
    earliestMonth,
    latestMonth,
  };
}

export function isCalendarDateOutOfRange(
  date: Date,
  minAllowedDate: Date,
  maxAllowedDate: Date,
  // MultiDatePicker keeps legacy exclusive min/max boundaries; the other pickers use inclusive edges.
  excludeBoundaryDates = false,
): boolean {
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const minDateOnly = new Date(
    minAllowedDate.getFullYear(),
    minAllowedDate.getMonth(),
    minAllowedDate.getDate(),
  );
  const maxDateOnly = new Date(
    maxAllowedDate.getFullYear(),
    maxAllowedDate.getMonth(),
    maxAllowedDate.getDate(),
  );
  if (excludeBoundaryDates) {
    return dateOnly <= minDateOnly || dateOnly >= maxDateOnly;
  }

  return dateOnly < minDateOnly || dateOnly > maxDateOnly;
}

export function getInitialCalendarMonth(
  selectedDate: string | undefined,
  availableDates: string[] | undefined,
  maxAllowedDate: Date,
): Date {
  const selectedCalendarDate = selectedDate
    ? formatCalendarDate(parseCalendarDate(selectedDate))
    : undefined;

  if (
    selectedDate &&
    (availableDates === undefined ||
      (selectedCalendarDate && availableDates.includes(selectedCalendarDate)))
  ) {
    return parseCalendarDate(selectedDate);
  }

  if (availableDates && availableDates.length > 0) {
    return parseCalendarDate(availableDates.at(-1)!);
  }

  const today = new Date();
  return maxAllowedDate >= today ? today : maxAllowedDate;
}

/**
 * `deps` are stringified into a reset key, so callers should pass stable primitive values only.
 */
export function useCalendarMonth(
  selectedDate: string | undefined,
  availableDates: string[] | undefined,
  maxAllowedDate: Date,
  deps: readonly CalendarMonthResetDep[],
) {
  const resetMonthKey = formatCalendarDate(
    getInitialCalendarMonth(selectedDate, availableDates, maxAllowedDate),
  );
  const availableDatesKey = availableDates?.join(',') ?? '';
  const maxAllowedDateKey = formatCalendarDate(maxAllowedDate);
  const selectionResetKey = deps.map((dep) => String(dep ?? '')).join('');
  const [currentMonth, setCurrentMonth] = useState(() => parseCalendarDate(resetMonthKey));

  // Snap the visible month back to the computed reset month whenever any reset
  // key changes (new selection, available dates, or bounds). Done during render
  // with a prev-key comparison instead of an effect so the visible month is
  // correct in the same render rather than after an extra commit; the user can
  // still freely navigate months between resets via setCurrentMonth.
  const combinedResetKey = [
    availableDatesKey,
    maxAllowedDateKey,
    resetMonthKey,
    selectionResetKey,
  ].join('');
  const [prevResetKey, setPrevResetKey] = useState(combinedResetKey);
  if (combinedResetKey !== prevResetKey) {
    setPrevResetKey(combinedResetKey);
    setCurrentMonth(parseCalendarDate(resetMonthKey));
  }

  return [currentMonth, setCurrentMonth] as const;
}

export function getCalendarMonthNavState(
  currentMonth: Date,
  earliestMonth: Date,
  latestMonth: Date,
  // For two-panel range pickers, pass the right-hand visible month so next-nav clamps correctly.
  nextButtonMonth = currentMonth,
) {
  const canGoPrevious =
    currentMonth.getFullYear() > earliestMonth.getFullYear() ||
    (currentMonth.getFullYear() === earliestMonth.getFullYear() &&
      currentMonth.getMonth() > earliestMonth.getMonth());
  const canGoNext =
    nextButtonMonth.getFullYear() < latestMonth.getFullYear() ||
    (nextButtonMonth.getFullYear() === latestMonth.getFullYear() &&
      nextButtonMonth.getMonth() < latestMonth.getMonth());

  return { canGoPrevious, canGoNext };
}
