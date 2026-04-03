// @vitest-environment jsdom

import React, { type Dispatch, type SetStateAction } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CalendarMonthPanel,
  formatCalendarDate,
  getCalendarMonthNavState,
  getInitialCalendarMonth,
  getLatestSelectableDate,
  isCalendarDateOutOfRange,
  parseCalendarDate,
  resolveCalendarDateBounds,
  useCalendarMonth,
} from '@/components/ui/calendar-picker-utils';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('calendar-picker-utils', () => {
  it('parses ISO and legacy calendar date formats', () => {
    expect(formatCalendarDate(parseCalendarDate('2026-04-02'))).toBe('2026-04-02');
    expect(formatCalendarDate(parseCalendarDate('04/02/2026, 13:45:59'))).toBe('2026-04-02');
  });

  it('returns the latest available date or falls back to maxDate/today', () => {
    expect(getLatestSelectableDate(['2026-01-10', '2026-03-20'], '2026-02-01')).toBe('2026-03-20');
    expect(getLatestSelectableDate([], '2026-02-01')).toBe('2026-02-01');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00'));
    expect(getLatestSelectableDate()).toBe('2026-04-02');
    vi.useRealTimers();
  });

  it('resolves min/max bounds from explicit limits or sorted available dates', () => {
    const bounds = resolveCalendarDateBounds(
      '2026-01-01',
      '2026-05-10',
      ['2026-02-01', '2026-04-20'],
      '2025-10-05',
    );

    expect(formatCalendarDate(bounds.minAllowedDate)).toBe('2026-01-01');
    expect(formatCalendarDate(bounds.maxAllowedDate)).toBe('2026-05-10');
    expect(formatCalendarDate(bounds.earliestMonth)).toBe('2026-02-01');
    expect(formatCalendarDate(bounds.latestMonth)).toBe('2026-04-20');
  });

  it('supports inclusive and exclusive min/max boundary checks', () => {
    const min = parseCalendarDate('2026-01-10');
    const max = parseCalendarDate('2026-01-20');

    expect(isCalendarDateOutOfRange(parseCalendarDate('2026-01-10'), min, max)).toBe(false);
    expect(isCalendarDateOutOfRange(parseCalendarDate('2026-01-20'), min, max)).toBe(false);
    expect(isCalendarDateOutOfRange(parseCalendarDate('2026-01-10'), min, max, true)).toBe(true);
    expect(isCalendarDateOutOfRange(parseCalendarDate('2026-01-20'), min, max, true)).toBe(true);
    expect(isCalendarDateOutOfRange(parseCalendarDate('2026-01-09'), min, max)).toBe(true);
    expect(isCalendarDateOutOfRange(parseCalendarDate('2026-01-21'), min, max)).toBe(true);
  });

  it('prefers the selected month, then latest available month, then maxDate fallback', () => {
    expect(
      formatCalendarDate(
        getInitialCalendarMonth('2026-03-01', ['2026-02-01', '2026-04-01'], new Date(2026, 6, 1)),
      ),
    ).toBe('2026-04-01');
    expect(
      formatCalendarDate(
        getInitialCalendarMonth('2026-03-01', undefined, parseCalendarDate('2026-05-01')),
      ),
    ).toBe('2026-03-01');
    expect(
      formatCalendarDate(
        getInitialCalendarMonth(undefined, ['2026-02-01', '2026-04-01'], new Date(2026, 6, 1)),
      ),
    ).toBe('2026-04-01');
    expect(
      formatCalendarDate(
        getInitialCalendarMonth(undefined, undefined, parseCalendarDate('2026-02-15')),
      ),
    ).toBe('2026-02-15');
  });

  it('clamps month navigation using the second visible month for range pickers', () => {
    expect(
      getCalendarMonthNavState(
        parseCalendarDate('2026-03-01'),
        parseCalendarDate('2026-01-01'),
        parseCalendarDate('2026-05-01'),
      ),
    ).toEqual({ canGoPrevious: true, canGoNext: true });

    expect(
      getCalendarMonthNavState(
        parseCalendarDate('2026-01-01'),
        parseCalendarDate('2026-01-01'),
        parseCalendarDate('2026-02-01'),
        parseCalendarDate('2026-02-01'),
      ),
    ).toEqual({ canGoPrevious: false, canGoNext: false });
  });
});

describe('useCalendarMonth', () => {
  let container: HTMLDivElement;
  let root: Root;
  let currentMonth: Date;
  let setCurrentMonth: Dispatch<SetStateAction<Date>>;

  interface TestComponentProps {
    selectedDate?: string;
    availableDates?: string[];
    maxAllowedDate: Date;
    deps: ReadonlyArray<string>;
  }

  function TestComponent({
    selectedDate,
    availableDates,
    maxAllowedDate,
    deps,
  }: TestComponentProps) {
    [currentMonth, setCurrentMonth] = useCalendarMonth(
      selectedDate,
      availableDates,
      maxAllowedDate,
      deps,
    );
    return null;
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('resets when selection and availability change', () => {
    act(() => {
      root.render(
        React.createElement(TestComponent, {
          selectedDate: '2026-03-15',
          availableDates: ['2026-02-10', '2026-03-15'],
          maxAllowedDate: parseCalendarDate('2026-04-30'),
          deps: ['2026-03-15'],
        }),
      );
    });
    expect(formatCalendarDate(currentMonth)).toBe('2026-03-15');

    act(() => setCurrentMonth(parseCalendarDate('2026-02-01')));
    expect(formatCalendarDate(currentMonth)).toBe('2026-02-01');

    act(() => {
      root.render(
        React.createElement(TestComponent, {
          selectedDate: '2026-03-15',
          availableDates: ['2026-04-05', '2026-04-20'],
          maxAllowedDate: parseCalendarDate('2026-04-30'),
          deps: ['2026-03-15'],
        }),
      );
    });
    expect(formatCalendarDate(currentMonth)).toBe('2026-04-20');

    act(() => {
      root.render(
        React.createElement(TestComponent, {
          selectedDate: '2026-04-05',
          availableDates: ['2026-04-05', '2026-04-20'],
          maxAllowedDate: parseCalendarDate('2026-04-30'),
          deps: ['2026-04-05'],
        }),
      );
    });
    expect(formatCalendarDate(currentMonth)).toBe('2026-04-05');
  });
});

describe('CalendarMonthPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders one month and forwards nav/date callbacks', () => {
    const onPreviousMonth = vi.fn();
    const onNextMonth = vi.fn();
    const onDateClick = vi.fn();

    act(() => {
      root.render(
        React.createElement(CalendarMonthPanel, {
          month: parseCalendarDate('2026-04-01'),
          onPreviousMonth,
          onNextMonth,
          canGoPrevious: true,
          canGoNext: true,
          getDayState: (date) => ({
            selected: formatCalendarDate(date) === '2026-04-02',
            disabled: formatCalendarDate(date) === '2026-04-03',
          }),
          onDateClick,
        }),
      );
    });

    expect(container.textContent).toContain('April 2026');

    const buttons = Array.from(container.querySelectorAll('button'));
    act(() => buttons[0].click());
    act(() => buttons[1].click());
    act(() => buttons.find((button) => button.textContent === '2')?.click());
    act(() => buttons.find((button) => button.textContent === '3')?.click());

    expect(onPreviousMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
    expect(onDateClick).toHaveBeenCalledTimes(1);
    expect(formatCalendarDate(onDateClick.mock.calls[0][0])).toBe('2026-04-02');
  });
});
