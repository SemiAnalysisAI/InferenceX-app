import { QuickFiltersDialog } from '@/components/inference/ui/QuickFiltersDialog';
import { ActiveQuickFilters } from '@/components/inference/ui/ActiveQuickFilters';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
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
  for (const locale of ['en', 'zh'] as const) {
    for (const width of [390, 1280]) {
      it(`explains every filter on hover without changing selections (${locale}, ${width}px)`, () => {
        cy.viewport(width, 900);
        mountWithProviders(
          <PathnameContext.Provider value={locale === 'zh' ? '/zh/inference' : '/inference'}>
            <QuickFiltersDialog
              open
              onOpenChange={cy.stub().as('changeOpen')}
              bestPerSku={{ checked: false, onCheckedChange: cy.stub().as('bestPerSku') }}
            />
          </PathnameContext.Provider>,
          { inference: { availableQuickFilters } },
        );
        const explanations = [
          ['best-per-sku', locale === 'zh' ? '共同实测范围' : 'shared measured range'],
          ['vendor', locale === 'zh' ? '芯片制造商' : 'company that makes the chip'],
          ['framework', 'Dynamo vLLM'],
          ['deployment', locale === 'zh' ? '不同的 worker' : 'across workers'],
          ['spec', 'EAGLE'],
          ['power', locale === 'zh' ? '历史测量' : 'Historical measurement'],
        ];
        for (const [key, explanation] of explanations) {
          const testId =
            key === 'power' ? 'measured-power-help' : `option-help-quick-filter-${key}`;
          cy.get(`[data-testid="${testId}"]`)
            .scrollIntoView()
            .should('have.attr', 'aria-label')
            .and('include', locale === 'zh' ? '说明' : 'Help:');
          cy.get(`[data-testid="${testId}"]`).trigger('pointerover', { pointerType: 'mouse' });
          cy.get(`[data-testid="option-help-content-quick-filter-${key}"]`)
            .should('be.visible')
            .and('contain.text', explanation)
            .should(($content) => {
              const bounds = $content[0].getBoundingClientRect();
              expect(bounds.left).to.be.at.least(0);
              expect(bounds.right).to.be.at.most(width);
            });
          cy.get('body').type('{esc}');
          cy.get(`[data-testid="option-help-content-quick-filter-${key}"]`).should('not.exist');
        }
        cy.get('@bestPerSku').should('not.have.been.called');
        cy.get('@changeOpen').should('not.have.been.called');
        for (const action of ['Vendors', 'Frameworks', 'Deployment', 'Spec', 'Power']) {
          cy.get(`@setQuickFilter${action}`).should('not.have.been.called');
        }
      });
    }
  }

  it('keeps hovered help readable without stealing filter focus', () => {
    mountWithProviders(<QuickFiltersDialog open onOpenChange={cy.stub().as('changeOpen')} />, {
      inference: { availableQuickFilters },
    });
    cy.clock();
    cy.get('[data-testid="quick-filter-vendor-select"]').focus();
    cy.get('[data-testid="option-help-quick-filter-vendor"]').trigger('pointerover', {
      pointerType: 'mouse',
    });
    cy.get('[data-testid="quick-filter-vendor-select"]').should('have.focus');
    cy.get('[data-testid="option-help-quick-filter-vendor"]').trigger('pointerout', {
      pointerType: 'mouse',
    });
    cy.get('[data-testid="option-help-content-quick-filter-vendor"]').trigger('pointerover', {
      pointerType: 'mouse',
    });
    cy.tick(250);
    cy.get('[data-testid="option-help-content-quick-filter-vendor"]').should('be.visible');
    cy.get('[data-testid="option-help-content-quick-filter-vendor"]').trigger('pointerout', {
      pointerType: 'mouse',
    });
    cy.tick(250);
    cy.get('[data-testid="option-help-content-quick-filter-vendor"]').should('not.exist');
    cy.get('[data-testid="quick-filter-vendor-select"]').should('have.focus');
    cy.get('@changeOpen').should('not.have.been.called');
    cy.clock().then((clock) => clock.restore());
  });

  it('supports keyboard help without dismissing the dialog or blocking filter selection', () => {
    mountWithProviders(<QuickFiltersDialog open onOpenChange={cy.stub().as('changeOpen')} />, {
      inference: { availableQuickFilters },
    });
    // Wait for the modal's initial focus before moving to another help button.
    cy.get('[data-testid="option-help-quick-filter-vendor"]').should('have.focus');
    cy.get('[data-testid="option-help-quick-filter-framework"]').focus().should('have.focus');
    cy.press(Cypress.Keyboard.Keys.SPACE);
    cy.get('[data-testid="option-help-content-quick-filter-framework"]').should('be.visible');
    cy.get('body').type('{esc}');
    cy.get('[data-testid="option-help-quick-filter-framework"]').should('have.focus');
    cy.get('@changeOpen').should('not.have.been.called');
    cy.get('[data-testid="quick-filter-framework-select"]').click();
    cy.get('[data-testid="quick-filter-framework-vllm"]').click();
    cy.get('@setQuickFilterFrameworks').should('have.been.calledWith', ['vllm']);
    cy.get('[role="listbox"]').should('not.exist');
  });

  it('removes only the chosen visible filter without resetting the benchmark scope', () => {
    mountWithProviders(<ActiveQuickFilters />, {
      inference: {
        quickFilters: {
          vendors: ['AMD', 'NVIDIA'],
          frameworks: ['vllm'],
          deployment: [],
          spec: [],
          power: [],
        },
      },
    });
    cy.get('[data-testid="remove-filter-vendors-AMD"]').click();
    cy.get('@setQuickFilterVendors').should('have.been.calledOnceWith', ['NVIDIA']);
    cy.get('@setQuickFilterFrameworks').should('not.have.been.called');
    cy.get('@setSelectedModel').should('not.have.been.called');
    cy.get('@setSelectedPrecisions').should('not.have.been.called');
  });

  it('localizes active filter values and leaves inapplicable AgentX spec filters untouched', () => {
    mountWithProviders(
      <PathnameContext.Provider value="/zh/agentx">
        <ActiveQuickFilters />
      </PathnameContext.Provider>,
      {
        inference: {
          selectedSequence: Sequence.AgenticTraces,
          quickFilters: {
            vendors: ['AMD'],
            frameworks: [],
            deployment: ['multi-node'],
            spec: ['mtp'],
            power: ['certified'],
          },
        },
      },
    );
    cy.get('[data-testid="active-quick-filters"]')
      .should('contain.text', '多节点聚合')
      .and('contain.text', '已验证')
      .and('not.contain.text', 'MTP');
    cy.get('[data-testid="clear-active-quick-filters"]').click();
    cy.get('@setQuickFilterVendors').should('have.been.calledOnceWith', []);
    cy.get('@setQuickFilterDeployment').should('have.been.calledOnceWith', []);
    cy.get('@setQuickFilterPower').should('have.been.calledOnceWith', []);
    cy.get('@setQuickFilterSpec').should('not.have.been.called');
  });

  it('closes a keyboard-opened dropdown before dismissing the dialog', () => {
    mountWithProviders(<QuickFiltersDialog open onOpenChange={cy.stub().as('changeOpen')} />, {
      inference: { availableQuickFilters },
    });

    cy.get('[data-testid="quick-filter-vendor-select"]').focus().type('{downarrow}');
    cy.focused().should('have.text', 'NVIDIA').type('{downarrow}');
    cy.focused().should('have.text', 'AMD').type('{esc}');
    cy.get('[role="listbox"]').should('not.exist');
    cy.get('[data-testid="quick-filter-vendor-select"]').should('be.focused');
    cy.get('@changeOpen').should('not.have.been.called');
    cy.get('[data-testid="quick-filters-dialog"]').should('be.visible');
    cy.focused().type('{esc}');
    cy.get('@changeOpen').should('have.been.calledWith', false);
  });

  it('shows every filter group for fixed-sequence charts', () => {
    mountWithProviders(<QuickFiltersDialog open onOpenChange={cy.stub()} />, {
      inference: { availableQuickFilters },
    });

    cy.get('[data-testid="quick-filters-dialog"]').should('be.visible');
    cy.get('[data-testid="quick-filter-vendor-select"]').click();
    cy.get('[data-testid="quick-filter-vendor-NVIDIA"]').should('exist');
    cy.get('[data-testid="quick-filter-vendor-select"]').click();
    cy.get('[data-testid="quick-filter-framework-select"]').click();
    cy.get('[data-testid="quick-filter-framework-vllm"]').should('exist');
    cy.get('[data-testid="quick-filter-framework-select"]').click();
    cy.get('[data-testid="quick-filter-deployment-select"]').click();
    cy.get('[data-testid="quick-filter-deployment-disagg"]').should('exist');
    cy.get('[data-testid="quick-filter-deployment-select"]').click();
    cy.get('[data-testid="quick-filter-spec-select"]').click();
    cy.get('[data-testid="quick-filter-spec-mtp"]').should('exist');
    cy.get('[data-testid="quick-filter-spec-select"]').click();
    cy.get('[data-testid="quick-filter-power-select"]').click();
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

    cy.get('[data-testid="quick-filter-vendor-select"]').click();
    cy.get('[data-testid="quick-filter-vendor-NVIDIA"]').click();
    cy.get('@setQuickFilterVendors').should('have.been.calledWith', ['NVIDIA']);
    cy.get('[data-testid="quick-filter-vendor-select"]').should(
      'have.attr',
      'aria-expanded',
      'false',
    );
    cy.get('[data-testid="quick-filter-framework-select"]').should('exist').click();
    cy.get('[data-testid="quick-filter-framework-vllm"]').should('exist');
    cy.get('[data-testid="quick-filter-framework-select"]').click();
    cy.get('[data-testid="quick-filter-deployment-select"]').should('exist').click();
    cy.get('[data-testid="quick-filter-deployment-disagg"]').should('exist');
    cy.get('[data-testid="quick-filter-deployment-select"]').click();
    cy.get('[data-testid^="quick-filter-spec-"]').should('not.exist');
    cy.contains('Spec Decoding').should('not.exist');
  });

  it('keeps stale selections removable and disables unavailable options', () => {
    mountWithProviders(<QuickFiltersDialog open onOpenChange={cy.stub()} />, {
      inference: {
        quickFilters: {
          ...availableQuickFilters,
          vendors: ['AMD'],
          frameworks: [],
          deployment: [],
          spec: [],
          power: [],
        },
        availableQuickFilters: { ...availableQuickFilters, vendors: [] },
      },
    });

    cy.get('[data-testid="quick-filter-vendor-select"]').click();
    cy.get('[data-testid="quick-filter-vendor-AMD"]')
      .should('have.attr', 'aria-selected', 'true')
      .and('not.have.attr', 'aria-disabled', 'true');
    cy.get('[data-testid="quick-filter-vendor-NVIDIA"]').should(
      'have.attr',
      'aria-disabled',
      'true',
    );
    cy.get('[data-testid="quick-filter-vendor-AMD"]').click();
    cy.get('@setQuickFilterVendors').should('have.been.calledWith', []);
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
