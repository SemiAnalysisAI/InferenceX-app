// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TCO_SOURCE_TITLE, TCO_SOURCE_URL } from '@semianalysisai/inferencex-constants';

const mocks = vi.hoisted(() => ({ locale: 'en' as 'en' | 'zh', track: vi.fn() }));
vi.mock('@/lib/i18n/use-locale', () => ({ useLocale: () => mocks.locale }));
vi.mock('@/lib/analytics/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof analytics>()),
  track: mocks.track,
}));

import {
  ChartShareActions,
  MetricAssumptionNotes,
  metricCostAssumptions,
} from '@/components/ui/chart-display-helpers';
import type * as analytics from '@/lib/analytics/analytics';
import { getGpuSpecs } from '@/lib/catalog/constants';

let container: HTMLDivElement;
let root: Root;

function renderUi(ui: React.ReactNode) {
  act(() => root.render(ui));
}

function getVisibleText() {
  return container.textContent ?? '';
}

function getVisibleCaveatText() {
  return [...container.querySelectorAll('[data-disagg-caveat]:not([aria-hidden]) p')]
    .map((element) => element.textContent ?? '')
    .join(' ');
}

beforeEach(() => {
  mocks.locale = 'en';
  mocks.track.mockClear();
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
    expect(getVisibleCaveatText()).toContain(
      'calculate throughput per MW per decode chip or per prefill chip',
    );
  });

  it('hides the disaggregation caveat for the total per-MW metric', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_tpPerMw" />);

    expect(getVisibleText()).toContain('All in Power/Chip:');
    expect(getVisibleText()).toContain('SemiAnalysis Datacenter Industry Model');
    expect(getVisibleCaveatText()).not.toContain(
      'calculate throughput per MW per decode chip or per prefill chip',
    );
  });

  it.each(['y_inputTputPerMw', 'y_outputTputPerMw'])(
    'shows the disaggregation caveat for per-token-type per-MW metric %s',
    (metric) => {
      renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} />);

      expect(getVisibleCaveatText()).toContain(
        'calculate throughput per MW per decode chip or per prefill chip',
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
      'calculate throughput per MW per decode chip or per prefill chip',
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
      'calculate throughput per MW per decode chip or per prefill chip',
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
    expect(getVisibleText()).toContain('H200 ');
    expect(getVisibleText()).toContain('GB300 ');
    expect(getVisibleText()).not.toContain('H100 ');
    expect(getVisibleText()).not.toContain('MI300X ');
  });

  it('narrows the power badges to the active legend selection', () => {
    renderUi(
      <MetricAssumptionNotes selectedYAxisMetric="y_tpPerMw" activeHwKeys={new Set(['mi300x'])} />,
    );

    expect(getVisibleText()).toContain('All in Power/Chip:');
    expect(getVisibleText()).toContain('MI300X ');
    expect(getVisibleText()).not.toContain('H100 ');
    expect(getVisibleText()).not.toContain('H200 ');
  });

  it('falls back to every registry GPU when the selection is empty or unrecognized', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_tokensPerDollarH" activeHwKeys={[]} />);

    expect(getVisibleText()).toContain('H100 ');
    expect(getVisibleText()).toContain('MI300X ');

    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_tokensPerDollarH"
        activeHwKeys={['not-a-gpu_dynamo-sglang']}
      />,
    );

    expect(getVisibleText()).toContain('H100 ');
    expect(getVisibleText()).toContain('MI300X ');
  });

  it('leaves the TCO values and their source to the caller when omitCostValues is set', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_costhOutput" omitCostValues />);
    expect(getVisibleText()).not.toContain('TCO $/chip/hr:');
    expect(container.querySelector(`a[href="${TCO_SOURCE_URL}"]`)).toBeNull();
    expect(getVisibleCaveatText()).toContain(
      'calculate cost per million tokens per decode chip or per prefill chip',
    );
  });

  it('describes which cost values a metric quotes and whether they are editable', () => {
    expect(metricCostAssumptions('y_tpPerMw', 'external', null)).toBeNull();
    expect(metricCostAssumptions('y_costh', 'external', null)).toMatchObject({
      editable: true,
      custom: false,
      blankedBases: [],
    });
    expect(metricCostAssumptions('y_costhOutput', 'external', null)).toMatchObject({
      editable: false,
      custom: false,
    });
    expect(
      metricCostAssumptions('y_costUser', 'external', {
        gb300: undefined,
        mi355x: 0.75,
        b200: undefined,
      }),
    ).toEqual({
      values: { mi355x: 0.75 },
      blankedBases: ['gb300', 'b200'],
      editable: true,
      custom: true,
    });
  });

  it("quotes the reader's own prices on the custom tier and the hyperscaler price before any exist", () => {
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_costUser"
        activeHwKeys={['gb300_x', 'mi355x_x', 'b200_x']}
        userCosts={{ gb300: 9.5, mi355x: 0.75, b200: undefined }}
      />,
    );
    expect(getVisibleText()).toContain('GB300 9.5');
    expect(getVisibleText()).toContain('MI355X 0.75');
    expect(getVisibleText()).not.toContain('B200 ');

    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_costUser"
        activeHwKeys={['gb300_x']}
        userCosts={null}
      />,
    );
    expect(getVisibleText()).toContain(`GB300 ${getGpuSpecs('gb300').costh}`);

    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_costr"
        activeHwKeys={['gb300_x']}
        userCosts={{ gb300: 9.5 }}
      />,
    );
    expect(getVisibleText()).toContain(`GB300 ${getGpuSpecs('gb300').costr}`);
  });

  it('quotes read-only custom TCO values without a source link', () => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric="y_costUser" activeHwKeys={['gb300_x']} />);
    expect(getVisibleText()).toContain('TCO $/chip/hr:');
    expect(getVisibleText()).toContain('GB300 ');
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

function control(value: 'pool' | 'total', onChange = vi.fn()) {
  return { value, onChange, source: 'inference' };
}

const toggle = () => container.querySelector('[data-testid="chip-basis-toggle"]');

describe('MetricAssumptionNotes — chip basis toggle', () => {
  const visibleNote = getVisibleCaveatText;

  it.each([
    'y_outputTputPerGpu',
    'y_inputTputPerGpu',
    'y_costhOutput',
    'y_inputTokensPerDollarR',
    'y_outputTputPerMw',
    'y_jOutput',
    'y_jInput',
  ])('offers the toggle on %s, which divides input or output throughput', (metric) => {
    renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} chipBasis={control('pool')} />);
    expect(toggle()).not.toBeNull();
    expect(visibleNote()).toContain('per decode chip or per prefill chip');
  });

  it.each(['y_tpPerGpu', 'y_costh', 'y_jTotal', 'y_tpPerMw'])(
    'keeps the toggle off %s, which is per total chip already',
    (metric) => {
      renderUi(<MetricAssumptionNotes selectedYAxisMetric={metric} chipBasis={control('pool')} />);
      expect(toggle()).toBeNull();
    },
  );

  it('describes the total basis as apples-to-apples', () => {
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_outputTputPerGpu"
        chipBasis={control('total')}
      />,
    );
    expect(visibleNote()).toContain('per total chip count (prefill plus decode chips)');
    expect(visibleNote()).toContain('the output throughput comparison is apples-to-apples');
    expect(visibleNote()).not.toContain('not an apples-to-apples');
  });

  it('switches the basis and tracks the change', () => {
    const onChange = vi.fn();
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_outputTputPerGpu"
        chipBasis={control('pool', onChange)}
      />,
    );
    const total = container.querySelector<HTMLButtonElement>('[data-testid="chip-basis-total"]');
    act(() => total!.click());
    expect(onChange).toHaveBeenCalledWith('total');
    expect(mocks.track).toHaveBeenCalledWith('chip_basis_changed', {
      basis: 'total',
      source: 'inference',
    });
  });

  it('renders Chinese copy for both bases', () => {
    mocks.locale = 'zh';
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_outputTputPerGpu"
        chipBasis={control('total')}
      />,
    );
    expect(visibleNote()).toContain('按芯片总数（预填充芯片 + 解码芯片）计算');
    expect(container.querySelector('[data-testid="chip-basis-pool"]')?.textContent).toBe(
      '按预填充/解码芯片',
    );
    expect(container.querySelector('[data-testid="chip-basis-total"]')?.textContent).toBe(
      '按芯片总数',
    );
  });
});

describe('MetricAssumptionNotes — embed caveats', () => {
  it('describes the basis without the toggle, sources or cost badges', () => {
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_costhOutput"
        chipBasis={{ ...control('total'), readOnly: true }}
        caveatsOnly
      />,
    );
    expect(container.textContent).toContain('per total chip count');
    expect(container.querySelector('[data-testid="chip-basis-toggle"]')).toBeNull();
    expect(container.textContent).not.toContain('TCO $/chip/hr:');
    expect(container.querySelector(`a[href="${TCO_SOURCE_URL}"]`)).toBeNull();
  });

  it('renders nothing for metrics the basis does not change', () => {
    renderUi(
      <MetricAssumptionNotes
        selectedYAxisMetric="y_jTotal"
        chipBasis={{ ...control('pool'), readOnly: true }}
        caveatsOnly
      />,
    );
    expect(container.textContent).toBe('');
  });
});
