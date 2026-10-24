// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { POWER_COUNT_LABELS } from '@/lib/power/power-basis';
import type { PowerCompare } from '../types';

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh' }));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => mocks.locale }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

import { energyPerFor, powerXMetricFields, PowerXTabs, powerXTabFor } from './PowerXTabs';

const render = (metric: string, compare: PowerCompare = 'none', locale: 'en' | 'zh' = 'en') => {
  mocks.locale = locale;
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <PowerXTabs
        metric={metric}
        onChange={() => {}}
        compare={compare}
        onCompareChange={() => {}}
      />
    </TooltipProvider>,
  );
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
};
const testIds = (container: HTMLElement) =>
  new Set(
    [...container.querySelectorAll<HTMLElement>('[data-testid]')].map((el) => el.dataset.testid),
  );

describe('powerXTabFor', () => {
  it('maps every measured metric to a tab so the controls never disappear', () => {
    expect(powerXTabFor('y_measuredAvgPower', 'none')).toBe('draw');
    expect(powerXTabFor('y_measuredP90Power', 'none')).toBe('draw');
    expect(powerXTabFor('y_measuredPowerPercentTdp', 'none')).toBe('draw');
    expect(powerXTabFor('y_measuredWhPerSuccessfulQuery', 'none')).toBe('energy');
    expect(powerXTabFor('y_measuredPowerTimeline', 'none')).toBe('time');
    expect(powerXTabFor('y_notAPowerMetric', 'none')).toBeNull();
  });

  it('keeps an energy boundary overlay on the Energy tab and sends power splits to Where', () => {
    expect(powerXTabFor('y_measuredJPerOutputToken', 'boundaries')).toBe('energy');
    expect(powerXTabFor('y_measuredAvgPower', 'boundaries')).toBe('where');
    expect(powerXTabFor('y_measuredAvgPower', 'roles')).toBe('where');
  });
});

describe('energyPerFor', () => {
  it('reads the unit from the metric, whatever its boundary or role', () => {
    expect(energyPerFor('y_measuredJPerOutputToken')).toBe('output');
    expect(energyPerFor('y_utilityModeledJPerOutputToken')).toBe('output');
    expect(energyPerFor('y_measuredPrefillJPerInputToken')).toBe('input');
    expect(energyPerFor('y_measuredJPerTotalToken')).toBe('total');
    expect(energyPerFor('y_measuredJPerSuccessfulQuery')).toBe('query');
    expect(energyPerFor('y_measuredWhPerSuccessfulQuery')).toBe('query');
  });
});

describe('powerXMetricFields', () => {
  it('keeps Scope and Power statistic for GPU-only power draw', () => {
    expect(powerXMetricFields('y_measuredAvgPower', 'none')).toEqual(['scope', 'statistic']);
    expect(powerXMetricFields('y_measuredP90Power', 'none')).toEqual(['scope', 'statistic']);
    expect(powerXMetricFields('y_measuredPrefillAvgPower', 'none')).toEqual(['scope', 'statistic']);
  });

  it('keeps Scope for per-token energy, where a role has its own denominator', () => {
    expect(powerXMetricFields('y_measuredJPerOutputToken', 'none')).toEqual(['scope']);
    expect(powerXMetricFields('y_measuredJPerInputToken', 'none')).toEqual(['scope']);
    expect(powerXMetricFields('y_measuredDecodeJPerOutputToken', 'none')).toEqual(['scope']);
    expect(powerXMetricFields('y_measuredJPerTotalToken', 'none')).toEqual([]);
    expect(powerXMetricFields('y_measuredWhPerSuccessfulQuery', 'none')).toEqual([]);
  });

  it('hides both where only the all-GPU average is defined', () => {
    expect(powerXMetricFields('y_utilityModeledWatts', 'none')).toEqual([]);
    expect(powerXMetricFields('y_utilityModeledJPerOutputToken', 'none')).toEqual([]);
    expect(powerXMetricFields('y_measuredPowerTimeline', 'none')).toEqual([]);
    expect(powerXMetricFields('y_measuredAvgPower', 'boundaries')).toEqual([]);
    expect(powerXMetricFields('y_measuredAvgPower', 'roles')).toEqual([]);
    expect(powerXMetricFields('y_measuredJPerOutputToken', 'boundaries')).toEqual([]);
    expect(powerXMetricFields('y_notAPowerMetric', 'none')).toEqual([]);
  });
});

describe('PowerXTabs markup', () => {
  it('renders the four questions as one compact tab row with the hint as a tooltip', () => {
    const container = render('y_measuredAvgPower');
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist?.getAttribute('aria-label')).toBe('PowerX question');
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Power draw',
      'Energy per token',
      'Over time',
      'Where the power goes',
    ]);
    expect(tabs.map((tab) => tab.title)).toEqual([
      'Watts per chip vs interactivity',
      'Joules per token, Wh per query',
      'Power trace through a run',
      'GPU, server and facility',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    // The tab label says what the view is; no question, how-to-read or glossary line repeats it.
    const ids = testIds(container);
    expect(ids.has('powerx-question')).toBe(false);
    expect(ids.has('powerx-read')).toBe(false);
    expect(ids.has('powerx-advanced')).toBe(false);
    expect(container.textContent).not.toContain('How many watts');
    expect(container.textContent).not.toContain('What do these terms mean');
  });

  it('exposes only Scope and Power statistic below the Power draw toggles', () => {
    const ids = testIds(render('y_measuredAvgPower'));
    expect(ids.has('powerx-boundary')).toBe(true);
    expect(ids.has('powerx-unit')).toBe(true);
    expect(ids.has('measured-power-scope')).toBe(true);
    expect(ids.has('measured-power-statistic-average')).toBe(true);
    expect(ids.has('measured-power-basis')).toBe(false);
    expect(ids.has('measured-power-display')).toBe(false);
    expect(ids.has('measured-power-compare')).toBe(false);
  });

  it('drops the Scope row for the modeled whole system, the timeline and comparisons', () => {
    expect(testIds(render('y_utilityModeledWatts')).has('measured-metric-controls')).toBe(false);
    expect(testIds(render('y_measuredPowerTimeline')).has('measured-metric-controls')).toBe(false);
    expect(
      testIds(render('y_measuredAvgPower', 'boundaries')).has('measured-metric-controls'),
    ).toBe(false);
  });

  it('keeps Scope alone on the Energy tab and only for per-token units', () => {
    const output = testIds(render('y_measuredJPerOutputToken'));
    expect(output.has('powerx-energy-per')).toBe(true);
    expect(output.has('measured-energy-scope')).toBe(true);
    expect(output.has('measured-energy-denominator')).toBe(false);
    expect(output.has('measured-power-basis')).toBe(false);
    expect(testIds(render('y_measuredWhPerSuccessfulQuery')).has('measured-metric-controls')).toBe(
      false,
    );
  });

  it.each(['en', 'zh'] as const)(
    'names the Count options from the shared basis labels (%s)',
    (locale) => {
      const container = render('y_measuredAvgPower', 'none', locale);
      const labels = [...container.querySelectorAll('[data-testid="powerx-boundary"] button')].map(
        (button) => button.textContent,
      );
      expect(labels).toEqual([
        POWER_COUNT_LABELS['gpu-measured'][locale],
        POWER_COUNT_LABELS['utility-modeled'][locale],
      ]);
    },
  );
});

describe('breakdown hatch angles', () => {
  it('gives every modeled part its own stripe angle, matched between SVG and CSS', async () => {
    const { HATCH_ANGLE, cssHatchAngle } = await import('./PowerBreakdownPanel');
    const modeled = ['server', 'fansPsu', 'network', 'facility'] as const;
    expect(new Set(modeled.map((category) => HATCH_ANGLE[category])).size).toBe(modeled.length);
    // A vertical SVG stripe rotated by a draws the same lines as a CSS gradient at a + 90.
    for (const category of modeled) {
      expect((cssHatchAngle(category) - HATCH_ANGLE[category] + 360) % 360).toBe(90);
    }
  });
});
