import { QuickFiltersDialog } from '@/components/inference/ui/QuickFiltersDialog';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type { QuickFilters } from '@/components/inference/types';
import { mountWithProviders } from '../support/test-utils';

const availableQuickFilters: QuickFilters = {
  vendors: ['NVIDIA', 'AMD', 'Google'],
  frameworks: ['vllm', 'sglang'],
  deployment: ['single-node', 'multi-node', 'disagg'],
  spec: ['mtp', 'stp'],
  power: ['certified', 'legacy'],
};

describe('QuickFiltersDialog', () => {
  for (const [locale, width] of [
    ['en', 390],
    ['zh', 1280],
  ] as const) {
    it(`explains every filter on hover without changing selections (${locale}, ${width}px)`, () => {
      cy.viewport(width, 900);
      mountWithProviders(
        <PathnameContext.Provider
          value={locale === 'zh' ? '/zh/infx/inference' : '/infx/inference'}
        >
          <QuickFiltersDialog
            open
            onOpenChange={cy.stub().as('changeOpen')}
            bestPerSku={{ checked: false, onCheckedChange: cy.stub().as('bestPerSku') }}
          />
        </PathnameContext.Provider>,
        { inference: { availableQuickFilters } },
      );
      const explanations = [
        [
          'best-per-sku',
          locale === 'zh'
            ? 'Pareto 前沿在图表中所覆盖的面积'
            : 'chart area its measured Pareto frontier dominates',
        ],
        ['vendor', locale === 'zh' ? '芯片制造商' : 'company that makes the chip'],
        ['framework', 'Dynamo vLLM'],
        ['deployment', locale === 'zh' ? '不同的 worker' : 'across workers'],
        ['spec', 'EAGLE'],
        ['power', locale === 'zh' ? '历史测量' : 'Historical measurement'],
      ];
      for (const [key, explanation] of explanations) {
        const testId = key === 'power' ? 'measured-power-help' : `option-help-quick-filter-${key}`;
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
});
