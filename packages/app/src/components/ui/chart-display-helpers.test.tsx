// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartShareActions, MetricAssumptionNotes } from '@/components/ui/chart-display-helpers';

let container: HTMLDivElement;
let root: Root;

function renderUi(ui: React.ReactNode) {
  act(() => root.render(ui));
}

function getVisibleText() {
  return container.textContent ?? '';
}

function getVisibleCaveatText() {
  return Array.from(container.querySelectorAll('div.max-h-20 p'))
    .map((element) => element.textContent ?? '')
    .join(' ');
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ChartShareActions', () => {
  it('renders the shared copy-link, X, and LinkedIn buttons with stable test ids', () => {
    renderUi(<ChartShareActions />);

    expect(container.querySelector('[data-testid="share-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="share-twitter"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="share-linkedin"]')).not.toBeNull();
  });
});

describe('MetricAssumptionNotes', () => {
  it('shows power source badges and the per-MW disaggregation caveat for inference metrics', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_inputTputPerMw" />);

    expect(getVisibleText()).toContain('All in Power/GPU:');
    expect(getVisibleText()).toContain('SemiAnalysis Datacenter Industry Model');
    expect(getVisibleCaveatText()).toContain('calculate power per decode GPU or per prefill GPU');
  });

  it('preserves historical-trends semantics when both compatibility flags are disabled', () => {
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_inputTputPerMw"
        includeAllPowerThroughputMetrics={false}
        includePowerThroughputCaveat={false}
      />,
    );

    expect(getVisibleText()).not.toContain('SemiAnalysis Datacenter Industry Model');
    expect(getVisibleCaveatText()).not.toContain(
      'calculate power per decode GPU or per prefill GPU',
    );

    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_tpPerMw"
        includeAllPowerThroughputMetrics={false}
        includePowerThroughputCaveat={false}
      />,
    );

    expect(getVisibleText()).toContain('SemiAnalysis Datacenter Industry Model');
    expect(getVisibleCaveatText()).not.toContain(
      'calculate power per decode GPU or per prefill GPU',
    );
  });

  it('renders TCO notes, source attribution, and the cost disaggregation caveat', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_costhOutput" />);

    expect(getVisibleText()).toContain('TCO $/GPU/hr:');
    expect(getVisibleText()).toContain(
      'SemiAnalysis Market August 2025 Pricing Surveys & AI Cloud TCO Model',
    );
    expect(getVisibleCaveatText()).toContain('calculate cost per decode GPU or per prefill GPU');
  });

  it('renders metric-specific throughput caveats and preserves Joules wording semantics', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_inputTputPerGpu" />);

    expect(getVisibleCaveatText()).toContain(
      'calculate input throughput per decode GPU or per prefill GPU',
    );
    expect(getVisibleCaveatText()).toContain('direct input throughput comparison');

    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_jTotal" />);

    expect(getVisibleText()).toContain('SemiAnalysis Datacenter Industry Model');
    expect(getVisibleCaveatText()).toContain('calculate Joules per decode GPU or per prefill GPU');
    expect(getVisibleCaveatText()).toContain('direct Joules per token comparison');
  });
});
