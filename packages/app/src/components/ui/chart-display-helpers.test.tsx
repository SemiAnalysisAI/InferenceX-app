// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TCO_SOURCE_TITLE, TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';

import { ChartShareActions, MetricAssumptionNotes } from '@/components/ui/chart-display-helpers';
import { getGpuSpecs } from '@/lib/constants';

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

// Stand-in for the /inference editable badge row.
const renderCostBadges = ({
  label,
  values,
  blankedBases,
}: {
  label: string;
  values: Record<string, number>;
  blankedBases?: string[];
}) => (
  <div data-testid="editable" data-blanked={(blankedBases ?? []).join(',')}>
    {label} {Object.keys(values).join(',')}
  </div>
);

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
      'calculate tokens per $1 TCO per decode chip or per prefill chip',
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
    'y_outputTokensPerDollarR',
    'y_inputTokensPerDollarH',
    'y_inputTokensPerDollarR',
  ])('shows the purchasing-power caveat for per-token-type metric %s', (metric) => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} />);

    expect(getVisibleCaveatText()).toContain(
      'calculate tokens per $1 TCO per decode chip or per prefill chip',
    );
  });

  it.each(['y_costhOutput', 'y_costrOutput', 'y_costhi', 'y_costri'])(
    'shows the token-cost caveat for per-token-type metric %s',
    (metric) => {
      renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} />);

      expect(getVisibleCaveatText()).toContain(
        'calculate cost per million tokens per decode chip or per prefill chip',
      );
    },
  );

  it.each(['y_costh', 'y_costr', 'y_tokensPerDollarH', 'y_tokensPerDollarR'])(
    'hides the purchasing-power caveat for total-token metric %s',
    (metric) => {
      renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} />);

      // The TCO badges and source attribution still explain the hourly-price input.
      expect(getVisibleText()).toContain('TCO $/chip/hr:');
      expect(getVisibleText()).toContain(TCO_SOURCE_TITLE);
      expect(container.querySelector(`a[href="${TCO_SOURCE_URL}"]`)).not.toBeNull();
      expect(getVisibleCaveatText()).not.toContain(
        'calculate tokens per $1 USD per decode chip or per prefill chip',
      );
    },
  );

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

  it('hands the TCO badges to the caller-supplied renderer for tiered and custom cost metrics', () => {
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_costh"
        activeHwKeys={['gb300_dynamo-sglang']}
        renderCostBadges={renderCostBadges}
      />,
    );
    expect(container.querySelector('[data-testid="editable"]')?.textContent).toBe(
      'TCO $/chip/hr: gb300',
    );
    expect(container.querySelector(`a[href="${TCO_SOURCE_URL}"]`)).not.toBeNull();

    // The custom tier shows the same badge row (so the reader can type into
    // it) but cites no TCO source: the numbers are theirs.
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_costUser"
        activeHwKeys={['gb300_dynamo-sglang', 'mi355x_vllm']}
        renderCostBadges={renderCostBadges}
      />,
    );
    expect(container.querySelector('[data-testid="editable"]')?.textContent).toBe(
      'TCO $/chip/hr: gb300,mi355x',
    );
    expect(container.querySelector(`a[href="${TCO_SOURCE_URL}"]`)).toBeNull();
  });

  it("quotes the reader's own prices on the custom tier and the hyperscaler price before any exist", () => {
    // The plot prices Custom User Values from `userCosts`, so the badges
    // must quote those, not a published tier; a blanked chip has no badge.
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_costUser"
        activeHwKeys={['gb300_x', 'mi355x_x', 'b200_x']}
        userCosts={{ gb300: 9.5, mi355x: 0.75, b200: undefined }}
      />,
    );
    expect(getVisibleText()).toContain('GB300: 9.5');
    expect(getVisibleText()).toContain('MI355X: 0.75');
    expect(getVisibleText()).not.toContain('B200:');

    // Every selected chip blanked: hand the renderer an empty list rather
    // than every other registry chip the reader never selected.
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_costUser"
        activeHwKeys={['gb300_x']}
        userCosts={{ gb300: undefined, mi355x: 0.75, b200: undefined }}
        renderCostBadges={renderCostBadges}
      />,
    );
    expect(container.querySelector('[data-testid="editable"]')?.textContent?.trim()).toBe(
      'TCO $/chip/hr:',
    );
    // Every blanked chip is named so the renderer can keep its badge. A
    // blanked chip has no point and so leaves the active selection, which is
    // why the list is not narrowed to `activeHwKeys`.
    expect(container.querySelector<HTMLElement>('[data-testid="editable"]')?.dataset.blanked).toBe(
      'gb300,b200',
    );

    // Nothing entered yet: show the seed the custom costs will start from.
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_costUser"
        activeHwKeys={['gb300_x']}
        userCosts={null}
      />,
    );
    expect(getVisibleText()).toContain(`GB300: ${getGpuSpecs('gb300').costh}`);

    // Published tiers ignore `userCosts`.
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_costr"
        activeHwKeys={['gb300_x']}
        userCosts={{ gb300: 9.5 }}
      />,
    );
    expect(getVisibleText()).toContain(`GB300: ${getGpuSpecs('gb300').costr}`);
  });

  it('falls back to read-only TCO badges without a renderer', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_costUser" activeHwKeys={['gb300_x']} />);
    expect(getVisibleText()).toContain('TCO $/chip/hr:');
    expect(getVisibleText()).toContain('GB300:');
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector(`a[href="${TCO_SOURCE_URL}"]`)).toBeNull();
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
