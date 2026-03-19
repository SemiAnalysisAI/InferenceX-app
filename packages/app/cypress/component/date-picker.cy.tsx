import { useState } from 'react';

import { DatePicker } from '@/components/ui/date-picker';

const AVAILABLE_DATES = [
  '2025-11-01',
  '2025-11-05',
  '2025-11-10',
  '2025-11-15',
  '2025-11-20',
  '2025-12-01',
  '2025-12-05',
  '2025-12-10',
];

function DatePickerWrapper({
  initialDate,
  availableDates = AVAILABLE_DATES,
}: {
  initialDate?: string;
  availableDates?: string[];
}) {
  const [date, setDate] = useState<string | undefined>(initialDate);
  return (
    <DatePicker
      date={date}
      onChange={setDate}
      availableDates={availableDates}
      minDate={availableDates[0]}
      maxDate={availableDates[availableDates.length - 1]}
      placeholder="Select date"
    />
  );
}

describe('DatePicker', () => {
  it('displays placeholder when no date set', () => {
    cy.mount(<DatePickerWrapper />);
    cy.contains('Select date').should('be.visible');
  });

  it('displays formatted date when date is provided', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    // Date should be formatted as "Nov 15, 2025"
    cy.contains('Nov 15, 2025').should('be.visible');
  });

  it('click opens calendar dialog', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    // Click the date trigger button to open dialog
    cy.contains('Run Date:').click();
    // Dialog should open with calendar
    cy.contains('Select a Run Date').should('be.visible');
  });

  it('calendar shows month/year header', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.contains('Run Date:').click();
    cy.get('h3.font-semibold').should('contain', 'November 2025');
  });

  it('available dates are clickable', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.contains('Run Date:').click();
    // Date 10 should be enabled (2025-11-10 is in availableDates)
    cy.get('.grid-cols-7 button').contains('10').should('not.be.disabled');
  });

  it('unavailable dates have visual indicator', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.contains('Run Date:').click();
    // Date 2 is not in availableDates, so it should be disabled with line-through
    cy.get('.grid-cols-7 button')
      .contains(/^2$/)
      .should('be.disabled')
      .and('have.class', 'line-through');
  });

  it('"Go to Latest" button navigates to latest available date', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.contains('Run Date:').click();
    // Click "Go to Latest" - should select Dec 10, 2025
    cy.contains('Go to Latest').click();
    // Now apply the selection
    cy.contains('Apply').click();
    // The displayed date should be the latest
    cy.contains('Dec 10, 2025').should('be.visible');
  });

  it('Previous/Next date arrows work', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    // Click next arrow to go to next available date (2025-11-20)
    cy.get('button').filter(':has(svg)').last().click();
    cy.contains('Nov 20, 2025').should('be.visible');
    // Click previous arrow to go back
    cy.get('button').filter(':has(svg)').first().click();
    cy.contains('Nov 15, 2025').should('be.visible');
  });

  it('Apply button submits selected date', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.contains('Run Date:').click();
    // Click on date 10 in the calendar
    cy.get('.grid-cols-7 button').contains('10').click();
    cy.contains('Apply').click();
    // Dialog should close and date should update
    cy.contains('Select a Run Date').should('not.exist');
    cy.contains('Nov 10, 2025').should('be.visible');
  });

  it('Cancel reverts selection', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.contains('Run Date:').click();
    // Click a different date
    cy.get('.grid-cols-7 button').contains('10').click();
    // Click cancel
    cy.contains('Cancel').click();
    // Original date should still be shown
    cy.contains('Nov 15, 2025').should('be.visible');
  });
});
