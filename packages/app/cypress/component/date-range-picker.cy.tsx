import { useState } from 'react';

import { type DateRange, DateRangePicker } from '@/components/ui/date-range-picker';

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

  it('view anyway button selects the single available date and closes dialog', () => {
    cy.mount(<DateRangePickerHarness availableDates={['2026-01-01']} />);
    cy.contains('Select date range').click();
    cy.contains('button', 'View anyway').click();
    cy.get('[role="dialog"]').should('not.exist');
    cy.get('[data-testid="date-range-output"]').should('contain', '2026-01-01 to 2026-01-01');
  });
});
