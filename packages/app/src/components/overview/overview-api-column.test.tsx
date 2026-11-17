// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Model } from '@/lib/catalog/data-mappings';
import { overviewApiPrice } from '@/lib/overview/overview-api-pricing';
import type {
  OverviewModelSummary,
  OverviewPlatformResult,
  OverviewScenario,
} from '@/lib/overview/overview-data';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/analytics/analytics', () => ({ track: vi.fn() }));

import { overviewApiTooltip } from './overview-api-cell';
import {
  DesktopOverviewMatrix,
  MobileOverviewList,
  OverviewMethodology,
  overviewFormatters,
} from './overview-scorecard';
import { OVERVIEW_STRINGS } from './overview-strings';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function platform(hardware: string, costPerMtok: number | null): OverviewPlatformResult {
  return {
    hardware,
    hardwareLabel: hardware.toUpperCase(),
    precision: costPerMtok === null ? null : 'fp4',
    read: {
      tier: 100,
      value: costPerMtok === null ? null : 1,
      boundary: null,
      estimated: false,
      evidenceDate: null,
      evidenceTopologies: [],
      config: null,
    },
    missingReason: null,
    costPerMtok,
    costVsReferencePct: null,
    historicalComparison: null,
  };
}

function summary(
  model: Model,
  scenario: OverviewScenario,
  costs: (number | null)[],
): OverviewModelSummary {
  return {
    model,
    modelLabel: model,
    category: 'default',
    scenario,
    platforms: ['b200', 'mi355x'].map((hw, i) => platform(hw, costs[i] ?? null)),
  };
}

const kimiApi = overviewApiPrice(Model.Kimi_K3_1_Pro, 'agentx');
if (kimiApi.status !== 'priced') throw new Error('Kimi K3.1 Pro must carry an API price');

const MODELS = [
  // B200 ~5.7× cheaper than the API; MI355X 2× pricier.
  summary(Model.Kimi_K3_1_Pro, 'agentx', [kimiApi.costPerMtok / 5.7, kimiApi.costPerMtok * 2]),
  // No hardware result at all: the API cell still renders.
  summary(Model.GLM_5_2, 'agentx', [null, null]),
  // No first-party price recorded.
  summary(Model.Llama3_3_70B, 'single_turn_8k1k', [0.1, null]),
];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const q = (sel: string) => [...container.querySelectorAll<HTMLElement>(sel)];
const row = (model: Model) =>
  container.querySelector<HTMLElement>(
    `[data-testid="overview-desktop-model"][data-model="${model}"]`,
  )!;

function renderDesktop(comparisonMode: 'hardware' | '30d' = 'hardware') {
  act(() =>
    root.render(
      <DesktopOverviewMatrix
        models={MODELS}
        locale="en"
        formatters={overviewFormatters('en')}
        strings={OVERVIEW_STRINGS.en}
        comparisonMode={comparisonMode}
        referenceHardware="b200"
      />,
    ),
  );
}

describe('Official API column', () => {
  it('adds one rightmost header and one API cell per row, after every hardware column', () => {
    renderDesktop();
    const headers = q('thead th');
    expect(headers.at(-1)?.dataset.testid).toBe('overview-api-header');
    expect(headers.at(-1)?.textContent).toBe('Official API');
    for (const tr of q('[data-testid="overview-desktop-model"]')) {
      expect((tr.lastElementChild as HTMLElement | null)?.dataset.testid).toBe('overview-api-cell');
    }
  });

  it('links the converted price to its source page with the formula in the tooltip', () => {
    renderDesktop();
    const link = row(Model.Kimi_K3_1_Pro).querySelector<HTMLAnchorElement>(
      '[data-testid="overview-api-source-link"]',
    )!;
    expect(link.href).toBe(kimiApi.pricing.sourceUrl);
    expect(link.textContent).toBe(overviewFormatters('en').cost.format(kimiApi.costPerMtok));
    expect(link.title).toContain('× $0.20');
    expect(link.title).toContain(kimiApi.pricing.asOf);
  });

  it('keeps the API cell on rows with no hardware result, spanning only hardware columns', () => {
    renderDesktop();
    const glm = row(Model.GLM_5_2);
    expect(glm.querySelector('td[colspan]')?.getAttribute('colspan')).toBe('2');
    expect(
      glm.querySelector<HTMLElement>('[data-testid="overview-api-price"]')?.dataset.apiStatus,
    ).toBe('priced');
    expect(glm.querySelectorAll('[data-testid="overview-api-ratio"]')).toHaveLength(0);
  });

  it('shows — with a reason instead of estimating a missing price', () => {
    renderDesktop();
    const cell = row(Model.Llama3_3_70B).querySelector<HTMLElement>(
      '[data-testid="overview-api-price"]',
    )!;
    expect(cell.dataset.apiStatus).toBe('unavailable');
    expect(cell.textContent).toBe('—');
    expect(cell.title).toBe(OVERVIEW_STRINGS.en.apiUnavailable.no_official_api);
    expect(
      row(Model.Llama3_3_70B).querySelectorAll('[data-testid="overview-api-ratio"]'),
    ).toHaveLength(0);
  });

  it.each(['hardware', '30d'] as const)('badges each priced hardware cell in %s mode', (mode) => {
    renderDesktop(mode);
    const badges = q(`[data-model="${Model.Kimi_K3_1_Pro}"] [data-testid="overview-api-ratio"]`);
    expect(badges.map((b) => [b.dataset.hardware, b.dataset.apiPolarity])).toEqual([
      ['b200', 'cheaper'],
      ['mi355x', 'pricier'],
    ]);
    expect(badges[0].textContent).toContain('×5.7 cheaper than API');
    expect(badges[1].textContent).toContain('×2.0 pricier than API');
  });

  it('renders an API row in every phone card, including blank ones', () => {
    act(() =>
      root.render(
        <MobileOverviewList
          models={MODELS}
          locale="en"
          formatters={overviewFormatters('en')}
          strings={OVERVIEW_STRINGS.en}
          comparisonMode="hardware"
          referenceHardware="b200"
        />,
      ),
    );
    const cards = q('[data-testid="overview-mobile-model"]');
    expect(cards).toHaveLength(MODELS.length);
    for (const card of cards) {
      expect(card.querySelectorAll('[data-testid="overview-mobile-api-row"]')).toHaveLength(1);
    }
  });

  it('states which controls the column ignores', () => {
    act(() =>
      root.render(
        <OverviewMethodology
          strings={OVERVIEW_STRINGS.en}
          comparisonMode="hardware"
          referenceHardware="b200"
        />,
      ),
    );
    const note = container.querySelector('[data-testid="overview-api-methodology"]')?.textContent;
    expect(note).toMatch(/SLO, engine scope/);
  });
});

describe('overviewApiTooltip', () => {
  it('explains tiered, cache-less pricing with the measured per-tier split', () => {
    const read = overviewApiPrice(Model.Qwen3_5, 'agentx');
    if (read.status !== 'priced') throw new Error('expected a price');
    const tip = overviewApiTooltip(read, 'en', OVERVIEW_STRINGS.en, overviewFormatters('en').cost);
    expect(tip).toContain('≤128K input');
    expect(tip).toContain('128K–256K input');
    expect(tip).toContain('41.8%');
  });

  it('localizes the note for zh', () => {
    const read = overviewApiPrice(Model.DeepSeek_V4_1_Flash, 'agentx');
    if (read.status !== 'priced') throw new Error('expected a price');
    const tip = overviewApiTooltip(read, 'zh', OVERVIEW_STRINGS.zh, overviewFormatters('zh').cost);
    expect(tip).toContain('非高峰');
  });
});
