// @test-environment jsdom
import { beforeEach, describe, expect, it } from 'bun:test';

import { $, $$, click, contains, eventually, get, isVisible, render } from '@/test/dom';
import { stubs, withProviders } from '@/test/mock-providers';

import { CostTierSelector } from './CostTierSelector';

const open = async () => {
  click(get('[data-testid="cost-tier-selector"]'));
  await eventually(() => expect($$('[data-slot="select-item"]').length).toBeGreaterThan(0));
};

describe('CostTierSelector', () => {
  it('renders nothing for metrics without a pricing basis', () => {
    render(withProviders(<CostTierSelector />, { inference: {}, globalFilters: {} }));
    expect($('[data-testid="cost-tier-selector"]')).toBeNull();
  });

  describe('on a hyperscaler-tier cost metric', () => {
    beforeEach(() => {
      render(
        withProviders(<CostTierSelector />, {
          inference: { selectedYAxisMetric: 'y_costh' },
          globalFilters: {},
        }),
      );
    });

    it('shows published tiers, custom values and locked rental terms', async () => {
      const selector = get('[data-testid="cost-tier-selector"]');
      expect(isVisible(selector)).toBe(true);
      expect(selector.textContent).toContain('Owning at Large Hyperscaler Volume');
      await open();
      expect($$('[data-slot="select-item"]').map((item) => item.textContent?.trim() ?? '')).toEqual(
        [
          'Owning at Large Hyperscaler Volume',
          'Rent – 3-Year Commit',
          'Custom User Values',
          'Rent – On DemandLocked',
          'Rent – 1-Month CommitLocked',
          'Rent – 6-Month CommitLocked',
          'Rent – 1-Year CommitLocked',
          'Rent – 2-Year CommitLocked',
        ],
      );
      expect($$('[data-testid="locked-tier-badge"]')).toHaveLength(5);
      click(get('[data-testid="cost-tier-rental"]'));
      expect(stubs.setSelectedYAxisMetric).toHaveBeenCalledExactlyOnceWith('y_costr');
    });

    it('switches to the custom axis and seeds the per-chip $/hr from the current tier', async () => {
      await open();
      click(get('[data-testid="cost-tier-custom"]'));
      expect(stubs.setSelectedYAxisMetric).toHaveBeenCalledExactlyOnceWith('y_costUser');
      expect(stubs.setUserCosts).toHaveBeenCalledTimes(1);
      const seeded = stubs.setUserCosts.mock.calls[0][0] as Record<string, number>;
      expect(seeded).toHaveProperty('gb300');
      expect(seeded).toHaveProperty('mi355x');
      for (const value of Object.values(seeded)) expect(value).toBeGreaterThan(0);
    });

    it('opens the TCO model dialog for locked rental tiers instead of changing the axis', async () => {
      await open();
      const locked = get('[data-testid="cost-tier-locked-rent_1_year"]');
      expect(locked.textContent).toContain('Rent – 1-Year Commit');
      click(locked);
      const dialog = await eventually(() => get('[data-testid="tco-model-dialog"]'));
      expect(isVisible(dialog)).toBe(true);
      expect(dialog.textContent).toContain('Rent – 1-Year Commit');
      const link = get('[data-testid="tco-model-dialog-link"]');
      expect(link.getAttribute('href')).toBe('https://semianalysis.com/ai-cloud-tco-model/');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(stubs.setSelectedYAxisMetric).not.toHaveBeenCalled();
      click(contains('button', 'Not now'));
      await eventually(() => expect($('[data-testid="tco-model-dialog"]')).toBeNull());
    });
  });

  it('does not reseed $/hr the reader has already entered', async () => {
    render(
      withProviders(<CostTierSelector />, {
        inference: { selectedYAxisMetric: 'y_costh', userCosts: { gb300: 9 } },
        globalFilters: {},
      }),
    );
    await open();
    click(get('[data-testid="cost-tier-custom"]'));
    expect(stubs.setSelectedYAxisMetric).toHaveBeenCalledExactlyOnceWith('y_costUser');
    expect(stubs.setUserCosts).not.toHaveBeenCalled();
  });

  it('leaves Custom User Values out when the chart has no custom pricing path', async () => {
    render(
      withProviders(<CostTierSelector allowCustom={false} />, {
        inference: { selectedYAxisMetric: 'y_costh' },
        globalFilters: {},
      }),
    );
    await open();
    expect($('[data-testid="cost-tier-hyperscaler"]')).not.toBeNull();
    expect($('[data-testid="cost-tier-rental"]')).not.toBeNull();
    expect($('[data-testid="cost-tier-custom"]')).toBeNull();
    expect($$('[data-testid="locked-tier-badge"]')).toHaveLength(5);
  });

  it('shows the rental tier on rental-tier metrics', () => {
    render(
      withProviders(<CostTierSelector />, {
        inference: { selectedYAxisMetric: 'y_tokensPerDollarR' },
        globalFilters: {},
      }),
    );
    expect(get('[data-testid="cost-tier-selector"]').textContent).toContain('Rent – 3-Year Commit');
  });
});
