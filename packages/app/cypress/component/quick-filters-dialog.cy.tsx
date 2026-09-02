import { QuickFiltersDialog } from '@/components/inference/ui/QuickFiltersDialog';
import type { QuickFilters } from '@/components/inference/types';
import { Sequence } from '@/lib/data-mappings';
import { mountWithProviders } from '../support/test-utils';

const availableQuickFilters: QuickFilters = {
  vendors: ['NVIDIA', 'AMD'],
  frameworks: ['vllm', 'sglang'],
  deployment: ['single-node', 'multi-node', 'disagg'],
  spec: ['mtp', 'stp'],
  power: ['certified', 'legacy'],
};

describe('QuickFiltersDialog', () => {
  it('shows every filter group for fixed-sequence charts', () => {
    mountWithProviders(<QuickFiltersDialog open onOpenChange={cy.stub()} />, {
      inference: { availableQuickFilters },
    });

    cy.get('[data-testid="quick-filters-dialog"]').should('be.visible');
    cy.get('[data-testid="quick-filter-vendor-NVIDIA"]').should('exist');
    cy.get('[data-testid="quick-filter-framework-vllm"]').should('exist');
    cy.get('[data-testid="quick-filter-deployment-disagg"]').should('exist');
    cy.get('[data-testid="quick-filter-spec-mtp"]').should('exist');
    cy.get('[data-testid="quick-filter-power-certified"]').should('contain.text', 'Validated');
    cy.get('[data-testid="quick-filter-power-legacy"]').should('contain.text', 'Historical');
  });

  it('explains validated and historical power measurements in plain language', () => {
    mountWithProviders(<QuickFiltersDialog open onOpenChange={cy.stub()} />, {
      inference: { availableQuickFilters },
    });

    cy.get('[data-testid="measured-power-help"]').click();
    cy.contains('Validated measurement').should('be.visible');
    cy.contains('passed checks for benchmark-window coverage').should('be.visible');
    cy.contains('Historical measurement').should('be.visible');
    cy.contains('This does not mean the measurement is wrong.').should('be.visible');
    cy.contains('Both are shown by default.').should('be.visible');
  });

  it('removes speculative decoding from agentic charts and toggles supported filters', () => {
    mountWithProviders(<QuickFiltersDialog open onOpenChange={cy.stub()} />, {
      inference: {
        selectedSequence: Sequence.AgenticTraces,
        availableQuickFilters,
      },
    });

    cy.get('[data-testid="quick-filter-vendor-NVIDIA"]').click();
    cy.get('@setQuickFilterVendors').should('have.been.calledWith', ['NVIDIA']);
    cy.get('[data-testid="quick-filter-framework-vllm"]').should('exist');
    cy.get('[data-testid="quick-filter-deployment-disagg"]').should('exist');
    cy.get('[data-testid^="quick-filter-spec-"]').should('not.exist');
    cy.contains('Spec Decoding').should('not.exist');
  });

  it('clears every filter category from one action', () => {
    mountWithProviders(<QuickFiltersDialog open onOpenChange={cy.stub()} />, {
      inference: {
        quickFilters: {
          vendors: ['AMD'],
          frameworks: ['sglang'],
          deployment: ['disagg'],
          spec: ['mtp'],
          power: ['certified'],
        },
        availableQuickFilters,
      },
    });

    cy.contains('button', 'Clear filters').click();
    cy.get('@setQuickFilterVendors').should('have.been.calledWith', []);
    cy.get('@setQuickFilterFrameworks').should('have.been.calledWith', []);
    cy.get('@setQuickFilterDeployment').should('have.been.calledWith', []);
    cy.get('@setQuickFilterSpec').should('have.been.calledWith', []);
    cy.get('@setQuickFilterPower').should('have.been.calledWith', []);
  });
});
