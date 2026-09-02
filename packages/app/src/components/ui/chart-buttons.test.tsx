// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/inference',
}));

import { ChartButtons } from '@/components/ui/chart-buttons';

/**
 * Regression tests for the mobile chart-toolbar overlap bug: below `md` the
 * absolutely-positioned toolbar sat on top of the chart card's title. The fix
 * keeps the toolbar in normal flow (right-aligned row above the card) on
 * narrow screens and only positions it absolutely from `md` up.
 */
function toolbarClassTokens(
  props: Partial<React.ComponentProps<typeof ChartButtons>> = {},
): string[] {
  const markup = renderToStaticMarkup(
    <ChartButtons chartId="test-chart" analyticsPrefix="test" {...props} />,
  );
  const host = document.createElement('div');
  host.innerHTML = markup;
  const toolbar = host.firstElementChild;
  if (!toolbar) throw new Error('ChartButtons rendered no toolbar element');
  return [...toolbar.classList];
}

describe('ChartButtons container layout', () => {
  it('is a normal-flow right-aligned row below md when mobileVisible', () => {
    const tokens = toolbarClassTokens({ mobileVisible: true });
    // In-flow row on mobile so it takes its own height above the chart card.
    expect(tokens).toContain('flex');
    expect(tokens).toContain('justify-end');
    expect(tokens).toContain('mb-2');
    expect(tokens).toContain('md:mb-0');
    expect(tokens).not.toContain('hidden');
    // The overlap bug: an unprefixed `absolute` put the toolbar on the title.
    expect(tokens).not.toContain('absolute');
    expect(tokens).not.toContain('top-6');
    expect(tokens).not.toContain('right-6');
  });

  it('positions absolutely only from md up', () => {
    for (const mobileVisible of [true, false]) {
      const tokens = toolbarClassTokens({ mobileVisible });
      expect(tokens).toContain('md:absolute');
      expect(tokens).toContain('md:top-8');
      expect(tokens).toContain('md:right-8');
      expect(tokens).not.toContain('absolute');
    }
  });

  it('stays hidden on mobile when mobileVisible is false (default)', () => {
    const tokens = toolbarClassTokens();
    expect(tokens).toContain('hidden');
    expect(tokens).toContain('md:flex');
    expect(tokens).not.toContain('flex');
  });

  it('keeps caller className overrides appended after layout classes', () => {
    const tokens = toolbarClassTokens({ mobileVisible: true, className: 'custom-marker' });
    expect(tokens).toContain('custom-marker');
    expect(tokens).toContain('md:absolute');
  });
});
