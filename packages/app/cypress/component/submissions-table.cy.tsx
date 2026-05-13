import SubmissionsTable from '@/components/submissions/SubmissionsTable';
import type { SubmissionSummaryRow } from '@/lib/submissions-types';

const baseRow: Omit<SubmissionSummaryRow, 'spec_method' | 'hardware' | 'date'> = {
  model: 'dsr1',
  framework: 'vllm',
  precision: 'fp8',
  disagg: false,
  is_multinode: false,
  num_prefill_gpu: 4,
  num_decode_gpu: 4,
  prefill_tp: 4,
  prefill_ep: 1,
  decode_tp: 4,
  decode_ep: 1,
  total_datapoints: 10,
  distinct_sequences: 2,
  distinct_concurrencies: 5,
  max_concurrency: 64,
  image: null,
};

const rows: SubmissionSummaryRow[] = [
  { ...baseRow, hardware: 'h200', spec_method: 'mtp', date: '2026-05-13' },
  { ...baseRow, hardware: 'b300', spec_method: 'eagle', date: '2026-05-12' },
  { ...baseRow, hardware: 'mi355x', spec_method: 'none', date: '2026-05-11' },
];

describe('SubmissionsTable — Spec Method column', () => {
  it('renders a Spec Method column header', () => {
    cy.mount(<SubmissionsTable data={rows} />);
    cy.contains('th', 'Spec Method').should('be.visible');
  });

  it('renders spec_method values uppercased and shows an em-dash for "none"', () => {
    cy.mount(<SubmissionsTable data={rows} />);
    // CSS uppercases the value; the DOM text remains lowercase.
    cy.contains('td', 'mtp').should('be.visible').and('have.class', 'uppercase');
    cy.contains('td', 'eagle').should('be.visible').and('have.class', 'uppercase');
    // The "none" row renders an em-dash placeholder instead of literal "none".
    // Hardware text is rendered uppercase via .toUpperCase().
    cy.contains('tbody tr', 'MI355X').within(() => {
      cy.contains('—').should('be.visible');
    });
  });

  it('sorts by spec_method when the header is clicked', () => {
    cy.mount(<SubmissionsTable data={rows} />);
    // Desc alphabetical: 'none' (mi355x) → 'mtp' (h200) → 'eagle' (b300).
    cy.contains('th', 'Spec Method').click();
    cy.get('tbody tr').first().should('contain.text', 'MI355X');
    cy.get('tbody tr').last().should('contain.text', 'B300');
    // Asc alphabetical: 'eagle' (b300) → 'mtp' (h200) → 'none' (mi355x).
    cy.contains('th', 'Spec Method').click();
    cy.get('tbody tr').first().should('contain.text', 'B300');
    cy.get('tbody tr').last().should('contain.text', 'MI355X');
  });

  it('filters rows when the search query matches a spec_method', () => {
    cy.mount(<SubmissionsTable data={rows} />);
    cy.get('input[placeholder="Search configs..."]').type('eagle');
    cy.get('tbody tr').should('have.length', 1).first().should('contain.text', 'B300');
  });
});
