// @test-environment jsdom
import { useState } from 'react';
import { describe, expect, it } from 'bun:test';

import { $, click, contains, eventually, get, isVisible, render } from '@/test/dom';

import { type DateRange, DateRangePicker } from './date-range-picker';

function DateRangePickerHarness({
  initialRange = { startDate: '', endDate: '' },
  availableDates,
}: {
  initialRange?: DateRange;
  availableDates?: string[];
}) {
  const [range, setRange] = useState<DateRange>(initialRange);
  return (
    <div data-testid="date-range-wrapper">
      <DateRangePicker
        dateRange={range}
        onChange={setRange}
        availableDates={availableDates}
        placeholder="Select date range"
      />
      <div data-testid="date-range-output">
        {range.startDate && range.endDate ? `${range.startDate} to ${range.endDate}` : 'no range'}
      </div>
    </div>
  );
}

describe('DateRangePicker', () => {
  it('apply is disabled when no dates selected', async () => {
    render(<DateRangePickerHarness />);
    click(contains('Select date range'));
    await eventually(() =>
      expect(contains<HTMLButtonElement>('button', 'Apply').disabled).toBe(true),
    );
  });

  it('cancel closes the dialog', async () => {
    render(<DateRangePickerHarness />);
    click(contains('Select date range'));
    await eventually(() => expect(isVisible($('[role="dialog"]'))).toBe(true));
    click(contains('button', 'Cancel'));
    await eventually(() => expect($('[role="dialog"]')).toBeNull());
  });

  it('shows overlay when no available dates', async () => {
    render(<DateRangePickerHarness availableDates={[]} />);
    click(contains('Select date range'));
    await eventually(() => expect(isVisible(contains('No available dates'))).toBe(true));
  });

  it('shows overlay when only 1 available date', async () => {
    render(<DateRangePickerHarness availableDates={['2026-01-01']} />);
    click(contains('Select date range'));
    await eventually(() => expect(isVisible(contains('Only 1 date available'))).toBe(true));
  });

  it('view anyway button selects the single available date and closes dialog', async () => {
    render(<DateRangePickerHarness availableDates={['2026-01-01']} />);
    click(contains('Select date range'));
    click(await eventually(() => contains('button', 'View anyway')));
    await eventually(() => expect($('[role="dialog"]')).toBeNull());
    expect(get('[data-testid="date-range-output"]').textContent).toContain(
      '2026-01-01 to 2026-01-01',
    );
  });
});
