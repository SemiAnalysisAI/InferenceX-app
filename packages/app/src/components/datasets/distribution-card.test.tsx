// @test-environment jsdom
import { describe, expect, it } from 'bun:test';

import type { Distribution } from '@/hooks/api/use-datasets';
import { $, $$, contains, eventually, focus, get, isVisible, press, render } from '@/test/dom';

import { DistributionCard } from './distribution-card';

const distribution: Distribution = {
  bins: [
    { x0: 0, x1: 100, count: 5 },
    { x0: 100, x1: 200, count: 20 },
    { x0: 200, x1: 300, count: 12 },
    { x0: 300, x1: 400, count: 3 },
  ],
  stats: { count: 40, min: 10, max: 390, mean: 180, median: 175, p75: 250, p90: 320, p95: 360 },
};

const visibleText = (text: string) => expect(isVisible(contains(text))).toBe(true);

describe('DistributionCard', () => {
  it('renders the title, summary stats, and one bar per bin', () => {
    render(
      <DistributionCard title="Input tokens per turn" unit="tok" distribution={distribution} />,
    );
    for (const text of [
      'Input tokens per turn',
      'n=40',
      'p50 175',
      'p75 250',
      'p90 320',
      'p95 360',
    ])
      visibleText(text);
    expect(
      $$(
        'line[stroke="#3b82f6"], line[stroke="#22c55e"], line[stroke="#f59e0b"], line[stroke="#ef4444"]',
      ),
    ).toHaveLength(8);
    expect($$('rect[class*="fill-primary"]')).toHaveLength(distribution.bins.length);
  });

  it('shows a "No data" placeholder when no distribution is provided', () => {
    render(<DistributionCard title="Empty metric" unit="tok" />);
    visibleText('Empty metric');
    visibleText('No data');
    expect($('rect[class*="fill-primary"]')).toBeNull();
  });

  it('marks the chart as log scale when scale="log"', () => {
    render(
      <DistributionCard
        title="Output tokens per turn"
        unit="tok"
        scale="log"
        distribution={distribution}
      />,
    );
    visibleText('log scale');
  });

  it('renders older v1 stats without unavailable percentile guides', () => {
    render(
      <DistributionCard
        title="Legacy metric"
        unit="tok"
        distribution={{
          bins: distribution.bins,
          stats: { count: 40, min: 10, max: 390, mean: 180, median: 175, p90: 320 },
        }}
      />,
    );
    visibleText('p50 175');
    visibleText('p90 320');
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('exposes localized bin values to keyboard and screen-reader users', async () => {
    render(
      <DistributionCard title="Input tokens per turn" unit="tokens" distribution={distribution} />,
    );
    const slider = get('rect[role="slider"]');
    expect(slider.getAttribute('tabindex')).toBe('0');
    expect(slider.getAttribute('aria-label')).toBe('Input tokens per turn');
    focus(slider);
    expect(slider.getAttribute('aria-valuemin')).toBe('1');
    expect(slider.getAttribute('aria-valuemax')).toBe('4');
    expect(slider.getAttribute('aria-valuenow')).toBe('1');
    expect(slider.getAttribute('aria-valuetext')).toContain('Range: 0–100 tokens');

    await eventually(() => {
      expect(isVisible(get('[role="tooltip"]'))).toBe(true);
      expect(get('[role="tooltip"]').textContent).toContain('5Count');
    });
    press('ArrowRight', get('rect[role="slider"]'));
    await eventually(() =>
      expect(get('rect[role="slider"]').getAttribute('aria-valuenow')).toBe('2'),
    );
    expect(get('rect[role="slider"]').getAttribute('aria-valuetext')).toContain('Count: 20');
    expect(get('[role="tooltip"]').textContent).toContain('100–200 tokens');
  });

  it('renders each distribution tick only once for small bin counts', () => {
    render(
      <DistributionCard
        title="Small distribution"
        unit="tokens"
        distribution={{ bins: distribution.bins.slice(0, 2), stats: distribution.stats }}
      />,
    );
    const ticks = $$('svg text')
      .map((node) => node.textContent)
      .filter((text) => text === '0' || text === '100');
    expect(ticks).toEqual(['0', '100']);
  });
});
