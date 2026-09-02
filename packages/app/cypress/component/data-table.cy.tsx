import { DataTable } from '@/components/ui/data-table';

const rows = [
  { config: 'H100', metric: 'fast', detail: 'decode-heavy' },
  { config: 'B200', metric: 'steady', detail: 'prefill-heavy' },
];

const columns = [
  {
    header: 'Configuration',
    cell: (row: (typeof rows)[number]) => row.config,
    sortValue: (row: (typeof rows)[number]) => row.config,
    importance: 'key' as const,
    pinned: true,
  },
  {
    header: 'Metric',
    cell: (row: (typeof rows)[number]) => row.metric,
    sortValue: (row: (typeof rows)[number]) => row.metric,
    importance: 'key' as const,
  },
  {
    header: 'Detail',
    cell: (row: (typeof rows)[number]) => row.detail,
    sortValue: (row: (typeof rows)[number]) => row.detail,
    importance: 'secondary' as const,
  },
];

describe('DataTable presets', () => {
  it('switches to all data, searches hidden columns, clears search, and keeps sort state', () => {
    cy.mount(<DataTable data={rows} columns={columns} testId="preset-table" />);

    cy.get('[data-testid="preset-table"] th').should('have.length', 2);
    cy.get('[data-testid="preset-table"] input[aria-label="Search table"]').type('prefill-heavy');
    cy.get('[data-testid="preset-table"] tbody tr')
      .should('have.length', 1)
      .and('contain.text', 'B200');
    cy.get('[data-testid="preset-table"] button[aria-label="Clear search"]').click();
    cy.get('[data-testid="preset-table"] tbody tr').should('have.length', 2);

    cy.get('[data-testid="preset-table"] input[aria-label="Search table"]').type('no-match');
    cy.get('[data-testid="data-table-empty-clear-search"]').click();
    cy.get('[data-testid="preset-table"] tbody tr').should('have.length', 2);

    cy.get('[data-testid="data-table-preset-all"]').click();
    cy.get('[data-testid="preset-table"] th').should('have.length', 3);
    cy.contains('[data-testid="preset-table"] th', 'Detail').should('be.visible');

    cy.contains('[data-testid="preset-table"] th', 'Metric').click();
    cy.get('[data-testid="preset-table"] th')
      .contains('Metric')
      .should('have.attr', 'aria-sort', 'descending');
    cy.get('[data-testid="data-table-preset-key"]').click();
    cy.get('[data-testid="preset-table"] th')
      .contains('Metric')
      .should('have.attr', 'aria-sort', 'descending');
  });

  it('pins the explicit configuration identifier inside the horizontal scroller', () => {
    cy.viewport(390, 720);
    cy.mount(
      <div style={{ width: 220 }}>
        <DataTable
          data={[{ ...rows[0], config: 'MI355X (Mooncake ATOMesh) C768 P(8/1/F/1) D(8/1/F/1)' }]}
          columns={columns.map((column) => ({ ...column, className: 'min-w-40' }))}
          testId="pinned-table"
        />
      </div>,
    );

    cy.get('[data-testid="pinned-table"] th').first().should('have.class', 'sticky');
    cy.get('[data-testid="pinned-table"] td').first().should('have.class', 'sticky');
    cy.get('[data-testid="pinned-table"] td')
      .first()
      .should(($cell) => {
        expect(
          $cell[0].getBoundingClientRect().width,
          'identifier leaves space for metrics on phones',
        ).to.be.within(184, 185);
        expect($cell.text()).to.include('P(8/1/F/1) D(8/1/F/1)');
      });
    cy.get('[data-testid="pinned-table"] .overflow-x-auto').should('exist');
    cy.get('[data-testid="pinned-table"] th')
      .first()
      .then(($identifier) => {
        const initialLeft = $identifier[0].getBoundingClientRect().left;
        cy.get('[data-testid="pinned-table"] .overflow-x-auto')
          .scrollTo('right')
          .should(($scroller) => {
            expect($scroller[0].scrollLeft).to.be.greaterThan(0);
          });
        cy.get('[data-testid="pinned-table"] th')
          .first()
          .should(($afterScroll) => {
            expect($afterScroll[0].getBoundingClientRect().left).to.be.closeTo(initialLeft, 1);
          });
      });
  });
});
