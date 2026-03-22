import { useState } from 'react';

import { DateRangePicker, DateRange } from '@/components/ui/date-range-picker';

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
        {range.startDate && range.endDate
          ? `${range.startDate} to ${range.endDate}`
          : 'no range'}
      </div>
    </div>
  );
}

describe('DateRangePicker', () => {
  it('renders with placeholder text', () => {
    cy.mount(<DateRangePickerHarness />);
    cy.get('[data-testid="date-range-wrapper"]').should('contain', 'Select date range');
  });

  it('opens dialog when clicked', () => {
    cy.mount(<DateRangePickerHarness />);
    cy.contains('Select date range').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.contains('Select Date Range').should('be.visible');
  });

  it('shows cancel and apply buttons in dialog', () => {
    cy.mount(<DateRangePickerHarness />);
    cy.contains('Select date range').click();
    cy.contains('button', 'Cancel').should('be.visible');
    cy.contains('button', 'Apply').should('be.visible');
  });

  it('apply is disabled when no dates selected', () => {
    cy.mount(<DateRangePickerHarness />);
    cy.contains('Select date range').click();
    cy.contains('button', 'Apply').should('be.disabled');
  });

  it('cancel closes the dialog', () => {
    cy.mount(<DateRangePickerHarness />);
    cy.contains('Select date range').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.contains('button', 'Cancel').click();
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('displays formatted range when dates are provided', () => {
    cy.mount(
      <DateRangePickerHarness initialRange={{ startDate: '2026-01-15', endDate: '2026-02-20' }} />,
    );
    cy.get('[data-testid="date-range-wrapper"]').should('contain', 'Jan 15, 2026');
    cy.get('[data-testid="date-range-wrapper"]').should('contain', 'Feb 20, 2026');
  });

  it('shows quick select buttons when availableDates provided', () => {
    const dates = ['2025-12-01', '2025-12-15', '2026-01-01', '2026-02-01', '2026-03-01'];
    cy.mount(<DateRangePickerHarness availableDates={dates} />);
    cy.contains('Select date range').click();
    cy.contains('button', 'Max Range').should('be.visible');
  });

  it('shows overlay when no available dates', () => {
    cy.mount(<DateRangePickerHarness availableDates={[]} />);
    cy.contains('Select date range').click();
    cy.contains('No available dates').should('be.visible');
  });

  it('shows overlay when only 1 available date', () => {
    cy.mount(<DateRangePickerHarness availableDates={['2026-01-01']} />);
    cy.contains('Select date range').click();
    cy.contains('Only 1 date available').should('be.visible');
  });
});
