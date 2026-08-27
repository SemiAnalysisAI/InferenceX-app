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
