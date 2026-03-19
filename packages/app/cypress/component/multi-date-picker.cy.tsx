import { useState } from 'react';

import { MultiDatePicker } from '@/components/ui/multi-date-picker';

const AVAILABLE_DATES = [
  '2025-10-15',
  '2025-11-02',
  '2025-11-05',
  '2025-11-10',
  '2025-11-15',
  '2025-11-20',
  '2025-12-01',
  '2025-12-05',
  '2025-12-15',
];

function MultiDatePickerWrapper({
  initialDates = [],
  maxDates = 3,
}: {
  initialDates?: string[];
  maxDates?: number;
}) {
  const [dates, setDates] = useState<string[]>(initialDates);
  return (
    <MultiDatePicker
      dates={dates}
      onChange={setDates}
      maxDates={maxDates}
      availableDates={AVAILABLE_DATES}
      minDate={AVAILABLE_DATES[0]}
      maxDate={AVAILABLE_DATES[AVAILABLE_DATES.length - 1]}
      placeholder="Select dates"
    />
  );
}

describe('MultiDatePicker', () => {
  it('renders placeholder when no dates selected', () => {
    cy.mount(<MultiDatePickerWrapper />);
    cy.contains('Select dates').should('be.visible');
  });

  it('shows formatted text for selected dates', () => {
    // 1 date: shows the formatted date
    cy.mount(<MultiDatePickerWrapper initialDates={['2025-11-15']} />);
    cy.contains('Nov 15, 2025').should('be.visible');
  });

  it('shows "vs" text for 2 selected dates', () => {
    cy.mount(<MultiDatePickerWrapper initialDates={['2025-11-10', '2025-11-20']} />);
    cy.contains('Nov 10, 2025 vs Nov 20, 2025').should('be.visible');
  });

  it('shows count text for 3+ selected dates', () => {
    cy.mount(<MultiDatePickerWrapper initialDates={['2025-11-01', '2025-11-10', '2025-11-20']} />);
    cy.contains('3 dates selected').should('be.visible');
  });

  it('calendar opens on click', () => {
    cy.mount(<MultiDatePickerWrapper />);
    cy.contains('Select dates').click();
    cy.contains('Select Comparison Dates').should('be.visible');
  });

  it('can select multiple dates', () => {
    // Start with a date in November so calendar opens to November
    cy.mount(<MultiDatePickerWrapper initialDates={['2025-11-02']} maxDates={3} />);
    cy.contains('Nov 2, 2025').click();
    // Calendar opens to November. Available within range: Nov 2, 5, 10, 15, 20.
    cy.get('.grid-cols-7 button').contains(/^5$/).click();
    cy.get('.grid-cols-7 button').contains('10').click();
    // Should see the selected dates as pills
    cy.contains('Selected Dates:').should('be.visible');
    cy.contains('Nov 2, 2025').should('be.visible');
    cy.contains('Nov 5, 2025').should('be.visible');
    cy.contains('Nov 10, 2025').should('be.visible');
  });

  it('cannot exceed maxDates', () => {
    // Start with 1 date already selected in November, calendar opens to Nov
    cy.mount(<MultiDatePickerWrapper initialDates={['2025-11-02']} maxDates={2} />);
    cy.contains('Nov 2, 2025').click();
    // Calendar opens to November (month of selected date). Select one more.
    cy.get('.grid-cols-7 button').contains(/^5$/).click();
    // Now at maxDates=2, third date (10) should be disabled
    cy.get('.grid-cols-7 button').contains('10').should('be.disabled');
  });

  it('selected dates show as removable pills', () => {
    // Start with a date so calendar opens to its month
    cy.mount(<MultiDatePickerWrapper initialDates={['2025-11-05']} maxDates={3} />);
    cy.contains('Nov 5, 2025').click();
    // Calendar opens to November. Add another date.
    cy.get('.grid-cols-7 button').contains('10').click();
    // Pill should have a remove button
    cy.get('[aria-label="Remove Nov 10, 2025"]').should('be.visible');
  });

  it('remove button on pill deselects date', () => {
    cy.mount(<MultiDatePickerWrapper initialDates={['2025-11-05']} maxDates={3} />);
    cy.contains('Nov 5, 2025').click();
    // Calendar opens to November. Select another date.
    cy.get('.grid-cols-7 button').contains('10').click();
    // Remove the first pill (Nov 5)
    cy.get('[aria-label="Remove Nov 5, 2025"]').click();
    // Only Nov 10 should remain as a pill in the selected dates section
    cy.contains('Selected Dates:')
      .parents('.rounded-md')
      .first()
      .within(() => {
        cy.contains('Nov 5, 2025').should('not.exist');
        cy.contains('Nov 10, 2025').should('be.visible');
      });
  });

  it('Clear All removes all selected dates', () => {
    cy.mount(<MultiDatePickerWrapper initialDates={['2025-11-05']} maxDates={3} />);
    cy.contains('Nov 5, 2025').click();
    // Calendar opens to November. Select another date.
    cy.get('.grid-cols-7 button').contains('10').click();
    cy.contains('Selected Dates:').should('be.visible');
    // Click Clear All
    cy.contains('Clear All').click();
    // Selected Dates section should disappear (no pills)
    cy.contains('Selected Dates:').should('not.exist');
  });
});
