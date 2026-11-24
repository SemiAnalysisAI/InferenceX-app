import { CostTierSelector } from '@/components/inference/ui/CostTierSelector';
import { checkA11y } from '../support/axe';
import { mountWithProviders } from '../support/test-utils';

// The selector's behaviour is covered in src/components/inference/ui/CostTierSelector.test.tsx.
// The axe audit stays in a browser, where color contrast can be computed.
describe('CostTierSelector', () => {
  describe('on a hyperscaler-tier cost metric', () => {
    beforeEach(() => {
      mountWithProviders(<CostTierSelector />, {
        inference: { selectedYAxisMetric: 'y_costh' },
        globalFilters: {},
      });
    });

    it('has no detectable a11y violations', () => {
      checkA11y('[data-testid="cost-tier-selector"]');
    });
  });
});
