import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

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
  useDefaults = false,
}: {
  initialDate?: string;
  availableDates?: string[];
  useDefaults?: boolean;
}) {
  const [date, setDate] = useState<string | undefined>(initialDate);
  return (
    <DatePicker
      date={date}
      onChange={setDate}
      availableDates={availableDates}
      minDate={availableDates[0]}
      maxDate={availableDates.at(-1)}
      placeholder={useDefaults ? undefined : 'Select date'}
    />
  );
}

describe('DatePicker', () => {
  it('unavailable dates have visual indicator', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.contains('Nov 15, 2025').click();
    cy.get('.grid-cols-7 button').contains(/^2$/u).should('be.disabled');
  });

  it('"Go to Latest" button navigates to latest available date', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.contains('Nov 15, 2025').click();
    cy.contains('Go to latest').click();
    cy.contains('Apply').click();
    cy.contains('Dec 10, 2025').should('be.visible');
  });

  it('Previous/Next date arrows work', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.get('button').filter(':has(svg)').last().click();
    cy.contains('Nov 20, 2025').should('be.visible');
    cy.get('button').filter(':has(svg)').first().click();
    cy.contains('Nov 15, 2025').should('be.visible');
  });

  it('Apply button submits selected date', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.contains('Nov 15, 2025').click();
    cy.get('.grid-cols-7 button').contains('10').click();
    cy.contains('Apply').click();
    cy.contains('Select a run date').should('not.exist');
    cy.contains('Nov 10, 2025').should('be.visible');
  });

  it('Cancel reverts selection', () => {
    cy.mount(<DatePickerWrapper initialDate="2025-11-15" />);
    cy.contains('Nov 15, 2025').click();
    cy.get('.grid-cols-7 button').contains('10').click();
    cy.contains('Cancel').click();
    cy.contains('Nov 15, 2025').should('be.visible');
  });

  for (const locale of ['en', 'zh']) {
    it(`keeps the full date readable and adjacent actions touch-sized in a narrow ${locale} panel`, () => {
      cy.viewport(375, 812);
      cy.mount(
        <PathnameContext.Provider value={locale === 'zh' ? '/zh/evaluation' : '/evaluation'}>
          <div style={{ width: 285 }}>
            <DatePickerWrapper initialDate="2025-11-15" useDefaults />
          </div>
        </PathnameContext.Provider>,
      );
      cy.get('button').each(($button) => {
        expect($button[0].getBoundingClientRect().height).to.be.at.least(44);
      });
      cy.get('button span.tabular-nums').should(($date) => {
        expect($date[0].scrollWidth).to.be.at.most($date[0].clientWidth);
      });
      cy.get(
        `button[aria-label="${locale === 'zh' ? '上一个可用日期' : 'Previous available date'}"]`,
      ).click();
      cy.get('button span.tabular-nums').should('contain.text', '10');
    });
  }
});
