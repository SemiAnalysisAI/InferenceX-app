// @vitest-environment jsdom
import React, { act } from 'react';
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
  return [...container.querySelectorAll('div.max-h-20 p')]
    .map((element) => element.textContent ?? '')
    .join(' ');
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ChartShareActions', () => {
  it('renders the share popover trigger', () => {
    renderUi(<ChartShareActions />);

    const trigger = container.querySelector('[data-testid="share-button"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('Share');
  });
});

describe('MetricAssumptionNotes', () => {
  it('shows power source badges and the per-MW disaggregation caveat for inference metrics', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_inputTputPerMw" />);

    expect(getVisibleText()).toContain('All in Power/Chip:');
    expect(getVisibleText()).toContain('SemiAnalysis Datacenter Industry Model');
    expect(getVisibleCaveatText()).toContain('calculate power per decode chip or per prefill chip');
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
      'calculate power per decode chip or per prefill chip',
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
      'calculate power per decode chip or per prefill chip',
    );
  });

  it('renders TCO notes, source attribution, and the cost disaggregation caveat', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_costhOutput" />);

    expect(getVisibleText()).toContain('TCO $/chip/hr:');
    expect(getVisibleText()).toContain(
      'SemiAnalysis Market July 2026 Pricing Surveys & AI Cloud TCO Model',
    );
    expect(getVisibleCaveatText()).toContain('calculate cost per decode chip or per prefill chip');
  });

  // The prefill/decode split only skews the per-token-type costs; the
  // total-token cost divides by the whole chip count, exactly as an aggregated
  // config does, so it must not carry the caveat.
  it.each(['y_costhOutput', 'y_costnOutput', 'y_costrOutput', 'y_costhi', 'y_costni', 'y_costri'])(
    'shows the cost disaggregation caveat for per-token-type cost metric %s',
    (metric) => {
      renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} />);

      expect(getVisibleCaveatText()).toContain(
        'calculate cost per decode chip or per prefill chip',
      );
    },
  );

  it.each(['y_costh', 'y_costn', 'y_costr'])(
    'hides the cost disaggregation caveat for total-token cost metric %s',
    (metric) => {
      renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} />);

      // The TCO badges and source attribution still belong on a cost chart.
      expect(getVisibleText()).toContain('TCO $/chip/hr:');
      expect(getVisibleText()).toContain(
        'SemiAnalysis Market July 2026 Pricing Surveys & AI Cloud TCO Model',
      );
      expect(getVisibleCaveatText()).not.toContain(
        'calculate cost per decode chip or per prefill chip',
      );
    },
  );

  it('renders metric-specific throughput caveats and preserves Joules wording semantics', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_inputTputPerGpu" />);

    expect(getVisibleCaveatText()).toContain(
      'calculate input throughput per decode chip or per prefill chip',
    );
    expect(getVisibleCaveatText()).toContain('direct input throughput comparison');

    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_jTotal" />);

    expect(getVisibleText()).toContain('SemiAnalysis Datacenter Industry Model');
    expect(getVisibleCaveatText()).toContain(
      'calculate Joules per decode chip or per prefill chip',
    );
    expect(getVisibleCaveatText()).toContain('direct Joules per token comparison');
  });
});
