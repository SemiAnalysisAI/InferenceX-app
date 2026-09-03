'use client';

import { useReducer, type Dispatch, type SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

const DISPLAY_DATE_FORMATTERS: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
  zh: new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }),
};

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

interface CalendarMonthState {
  resetKey: string;
  currentMonth: Date;
}

type CalendarMonthAction =
  | { type: 'reset'; resetKey: string; currentMonth: Date }
  | { type: 'set'; currentMonth: SetStateAction<Date> };

function calendarMonthReducer(
  state: CalendarMonthState,
  action: CalendarMonthAction,
): CalendarMonthState {
  if (action.type === 'reset') {
    return { resetKey: action.resetKey, currentMonth: action.currentMonth };
  }
  return {
    ...state,
    currentMonth:
      typeof action.currentMonth === 'function'
        ? action.currentMonth(state.currentMonth)
        : action.currentMonth,
  };
}

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

export function formatDisplayDate(dateStr: string, locale: Locale = 'en'): string {
  return DISPLAY_DATE_FORMATTERS[locale].format(parseCalendarDate(dateStr));
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
  const initialMonth = getInitialCalendarMonth(selectedDate, availableDates, maxAllowedDate);
  const resetMonthKey = formatCalendarDate(initialMonth);
  const resetKey = [
    availableDates?.join(',') ?? '',
    formatCalendarDate(maxAllowedDate),
    resetMonthKey,
    deps.map((dep) => String(dep ?? '')).join('\u001F'),
  ].join('\u001E');
  const [state, dispatch] = useReducer(calendarMonthReducer, {
    resetKey,
    currentMonth: initialMonth,
  });

  let currentMonth = state.currentMonth;
  if (state.resetKey !== resetKey) {
    currentMonth = initialMonth;
    dispatch({ type: 'reset', resetKey, currentMonth });
  }

  const setCurrentMonth: Dispatch<SetStateAction<Date>> = (nextMonth) => {
    dispatch({ type: 'set', currentMonth: nextMonth });
  };
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

function getCalendarMonthDays(month: Date): (Date | null)[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days: (Date | null)[] = [];

  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    days.push(new Date(year, monthIndex, day));
  }

  while (days.length < 42) {
    days.push(null);
  }

  return days;
}

export function CalendarMonthPanel({
  month,
  onPreviousMonth,
  onNextMonth,
  canGoPrevious = true,
  canGoNext = true,
  isDisabled = false,
  getDayState,
  onDateClick,
  onDateHover,
}: CalendarMonthPanelProps) {
  const locale = useLocale();
  const monthName = month.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'long',
    year: 'numeric',
  });
  const weekdays =
    locale === 'zh'
      ? ['日', '一', '二', '三', '四', '五', '六']
      : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const days = getCalendarMonthDays(month);
  const previousMonthLabel = locale === 'zh' ? '上个月' : 'Previous month';
  const nextMonthLabel = locale === 'zh' ? '下个月' : 'Next month';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {onPreviousMonth ? (
          <Button
            variant="outline"
            size="icon"
            onClick={onPreviousMonth}
            disabled={isDisabled || !canGoPrevious}
            className={cn(!canGoPrevious && 'opacity-30')}
            aria-label={previousMonthLabel}
          >
            ‹
          </Button>
        ) : (
          <div className="w-10" />
        )}
        <h3 className="font-semibold">{monthName}</h3>
        {onNextMonth ? (
          <Button
            variant="outline"
            size="icon"
            onClick={onNextMonth}
            disabled={isDisabled || !canGoNext}
            className={cn(!canGoNext && 'opacity-30')}
            aria-label={nextMonthLabel}
          >
            ›
          </Button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekdays.map((weekday) => (
          <div key={weekday} className="text-center text-xs font-medium text-muted-foreground py-2">
            {weekday}
          </div>
        ))}

        {days.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="h-9" />;
          }

          const { selected, disabled, hovered, inRange, outOfRange } = getDayState(day);
          const isToday = day.toDateString() === new Date().toDateString();

          return (
            <button
              type="button"
              key={formatCalendarDate(day)}
              onClick={() => !disabled && !isDisabled && onDateClick(day)}
              onMouseEnter={() => !isDisabled && onDateHover?.(day)}
              onMouseLeave={() => !isDisabled && onDateHover?.(null)}
              disabled={disabled || isDisabled}
              className={cn(
                'h-9 w-full rounded-md text-sm transition-colors',
                'focus-visible:outline-none',
                selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                hovered && !selected && 'bg-primary text-primary-foreground',
                inRange && !selected && !hovered && 'bg-primary/20',
                (disabled || isDisabled) &&
                  !selected &&
                  'opacity-30 cursor-not-allowed hover:bg-transparent hover:text-current line-through',
                !(disabled || isDisabled) &&
                  !selected &&
                  !hovered &&
                  !inRange &&
                  'hover:bg-accent hover:text-accent-foreground',
                isToday && !selected && 'border-2 border-primary',
                !selected && !(disabled || isDisabled) && !inRange && !hovered && 'bg-background',
                outOfRange && !selected && 'text-muted-foreground',
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
