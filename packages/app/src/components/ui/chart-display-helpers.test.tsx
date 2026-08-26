// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TCO_SOURCE_TITLE, TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';

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

  // Total tok/s/MW divides throughput per chip overall by per-chip power — the
  // same denominator an aggregated config uses — so, like the total-token cost
  // metrics, it keeps the power badges but must not carry the disagg caveat.
  it('hides the disaggregation caveat for the total per-MW metric', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_tpPerMw" />);

    expect(getVisibleText()).toContain('All in Power/Chip:');
    expect(getVisibleText()).toContain('SemiAnalysis Datacenter Industry Model');
    expect(getVisibleCaveatText()).not.toContain(
      'calculate power per decode chip or per prefill chip',
    );
  });

  it.each(['y_inputTputPerMw', 'y_outputTputPerMw'])(
    'shows the disaggregation caveat for per-token-type per-MW metric %s',
    (metric) => {
      renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} />);

      expect(getVisibleCaveatText()).toContain(
        'calculate power per decode chip or per prefill chip',
      );
    },
  );

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

  it('renders TCO notes, source attribution, and the purchasing-power caveat', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_outputTokensPerDollarH" />);

    expect(getVisibleText()).toContain('TCO $/chip/hr:');
    expect(getVisibleText()).toContain(TCO_SOURCE_TITLE);
    expect(container.querySelector(`a[href="${TCO_SOURCE_URL}"]`)).not.toBeNull();
    expect(getVisibleCaveatText()).toContain(
      'calculate tokens per $1 USD per decode chip or per prefill chip',
    );
  });

  it('describes the existing cost-per-million metric', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_costhOutput" />);

    expect(getVisibleCaveatText()).toContain(
      'calculate cost per million tokens per decode chip or per prefill chip',
    );
    expect(getVisibleCaveatText()).toContain('token cost comparison');
  });

  // The prefill/decode split only skews per-token-type metrics; the
  // total-token metric divides by the whole chip count, exactly as an aggregated
  // config does, so it must not carry the caveat.
  it.each([
    'y_outputTokensPerDollarH',
    'y_outputTokensPerDollarN',
    'y_outputTokensPerDollarR',
    'y_inputTokensPerDollarH',
    'y_inputTokensPerDollarN',
    'y_inputTokensPerDollarR',
  ])('shows the purchasing-power caveat for per-token-type metric %s', (metric) => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} />);

    expect(getVisibleCaveatText()).toContain(
      'calculate tokens per $1 USD per decode chip or per prefill chip',
    );
  });

  it.each(['y_costhOutput', 'y_costnOutput', 'y_costrOutput', 'y_costhi', 'y_costni', 'y_costri'])(
    'shows the token-cost caveat for per-token-type metric %s',
    (metric) => {
      renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} />);

      expect(getVisibleCaveatText()).toContain(
        'calculate cost per million tokens per decode chip or per prefill chip',
      );
    },
  );

  it.each([
    'y_costh',
    'y_costn',
    'y_costr',
    'y_tokensPerDollarH',
    'y_tokensPerDollarN',
    'y_tokensPerDollarR',
  ])('hides the purchasing-power caveat for total-token metric %s', (metric) => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} />);

    // The TCO badges and source attribution still explain the hourly-price input.
    expect(getVisibleText()).toContain('TCO $/chip/hr:');
    expect(getVisibleText()).toContain(TCO_SOURCE_TITLE);
    expect(container.querySelector(`a[href="${TCO_SOURCE_URL}"]`)).not.toBeNull();
    expect(getVisibleCaveatText()).not.toContain(
      'calculate tokens per $1 USD per decode chip or per prefill chip',
    );
  });

  it('narrows the TCO badges to the base GPUs of the active legend selection', () => {
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_tokensPerDollarH"
        activeHwKeys={['h200_dynamo-sglang', 'gb300_dynamo-sglang']}
      />,
    );

    expect(getVisibleText()).toContain('TCO $/chip/hr:');
    expect(getVisibleText()).toContain('H200:');
    expect(getVisibleText()).toContain('GB300:');
    expect(getVisibleText()).not.toContain('H100:');
    expect(getVisibleText()).not.toContain('MI300X:');
  });

  it('narrows the power badges to the active legend selection', () => {
    renderUi(
      <MetricAssumptionNotes selectedYAxisMetric="y_tpPerMw" activeHwKeys={new Set(['mi300x'])} />,
    );

    expect(getVisibleText()).toContain('All in Power/Chip:');
    expect(getVisibleText()).toContain('MI300X:');
    expect(getVisibleText()).not.toContain('H100:');
    expect(getVisibleText()).not.toContain('H200:');
  });

  it('falls back to every registry GPU when the selection is empty or unrecognized', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_tokensPerDollarH" activeHwKeys={[]} />);

    expect(getVisibleText()).toContain('H100:');
    expect(getVisibleText()).toContain('MI300X:');

    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_tokensPerDollarH"
        activeHwKeys={['not-a-gpu_dynamo-sglang']}
      />,
    );

    expect(getVisibleText()).toContain('H100:');
    expect(getVisibleText()).toContain('MI300X:');
  });

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
