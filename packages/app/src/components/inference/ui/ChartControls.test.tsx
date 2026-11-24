// @test-environment jsdom
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { Suspense, use, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';

import { ResultContext } from '@/components/ui/result-context';
import { Model, Sequence } from '@/lib/catalog/data-mappings';
import { stubGlobal, useFakeTimers, useRealTimers } from '@/test/helpers';
import {
  $,
  $$,
  click,
  contains,
  dispatch,
  eventually,
  findContaining,
  get,
  isVisible,
  press,
  render,
  setViewport,
  tick,
  type,
} from '@/test/dom';
import { stubs, withProviders, type ProviderOverrides } from '@/test/mock-providers';

import InferenceChartControls from './ChartControls';
import { TcoBasisCaption } from './TcoBasisCaption';
import WorkflowInfoDisplay from './WorkflowInfoDisplay';

const FEATURE_GATE = 'inferencex-feature-gate-konami-v1';

function CostControls({ showTcoBasis = false }: { showTcoBasis?: boolean }) {
  return (
    <>
      <InferenceChartControls showXAxisMode />
      <ResultContext
        locale="en"
        costTier="Owning at Large Hyperscaler Volume"
        tcoBasis={
          <TcoBasisCaption
            hardwareKeys={new Set(showTcoBasis ? ['tpuv7_vllm'] : ['b200_sglang'])}
            source="inference"
          />
        }
      />
    </>
  );
}

const mount = (tree: ReactElement, overrides: ProviderOverrides) =>
  render(withProviders(tree, overrides));
const mountControls = () =>
  mount(<InferenceChartControls showXAxisMode />, { inference: {}, unofficial: {} });
const testId = (id: string) => get(`[data-testid="${id}"]`);
const selectItems = () => $$('[data-slot="select-item"]');
const openMenu = async (id: string) => {
  click(testId(id));
  await eventually(() => expect($('[data-slot="select-content"]')).not.toBeNull());
};
const searchInput = () => get<HTMLInputElement>('input[aria-label="Search options"]');
const pointer = (element: Element, kind: 'pointerover' | 'pointerout') =>
  dispatch(element, new PointerEvent(kind, { bubbles: true, pointerType: 'mouse' }));
const expanded = (id: string) => testId(id).getAttribute('aria-expanded');

afterEach(() => {
  localStorage.removeItem(FEATURE_GATE);
  useRealTimers();
});

describe('Inference ChartControls', () => {
  beforeEach(() => {
    mountControls();
  });

  it('offers pending Flash only while the shared feature gate is unlocked', async () => {
    await openMenu('model-selector');
    expect(findContaining('[role="option"]', 'GLM 5.3 Flash')).toBeNull();
    press('Escape');
    await eventually(() => expect($('[data-slot="select-content"]')).toBeNull());
    localStorage.setItem(FEATURE_GATE, '1');
    dispatch(window, new Event('inferencex:feature-gate:unlocked'));
    await openMenu('model-selector');
    click(await eventually(() => contains('[role="option"]', 'GLM 5.3 Flash')));
    expect(stubs.setSelectedModel).toHaveBeenCalledWith(Model.GLM_5_3_Flash);
    localStorage.removeItem(FEATURE_GATE);
    dispatch(window, new Event('inferencex:feature-gate:locked'));
    await openMenu('model-selector');
    await eventually(() => expect(findContaining('[role="option"]', 'GLM 5.3 Flash')).toBeNull());
  });

  it('offers no measured power or energy metrics; they live on the PowerX tab', async () => {
    localStorage.setItem(FEATURE_GATE, '1');
    mountControls();
    await openMenu('yaxis-metric-selector');
    expect(findContaining('Throughput')).not.toBeNull();
    expect($('[data-select-option][data-value^="y_measured"]')).toBeNull();
    expect($('[data-select-option][data-value^="y_utilityModeled"]')).toBeNull();
    type(searchInput(), 'Measured');
    await eventually(() => expect($('[data-select-option]')).toBeNull());
    expect($('[data-testid="measured-metric-controls"]')).toBeNull();
  });

  it('lists each tiered metric once in the Y-axis selector, without the tier suffix', async () => {
    await openMenu('yaxis-metric-selector');
    const labels = selectItems().map((item) => item.textContent?.trim() ?? '');
    expect(labels.filter((label) => label.startsWith('Total Tokens per $1 TCO'))).toEqual([
      'Total Tokens per $1 TCO',
    ]);
    expect(labels.filter((label) => label.startsWith('Cost per Million Total Tokens'))).toEqual([
      'Cost per Million Total Tokens',
    ]);
    expect(labels.filter((label) => label.includes('(Custom User Values)'))).toEqual([
      'Token Throughput per All in Utility MW (Custom User Values)',
    ]);
    expect(labels.some((label) => label.includes('Owning at Large Hyperscaler Volume'))).toBe(
      false,
    );
    expect(labels.some((label) => label.includes('Rent – 3-Year Commit'))).toBe(false);
    expect($('[data-testid="locked-tier-badge"]')).toBeNull();
  });

  it('opens tiered metrics on the hyperscaler tier from an untiered metric', async () => {
    await openMenu('yaxis-metric-selector');
    click(contains('[data-slot="select-item"]', /^Cost per Million Total Tokens$/u));
    expect(stubs.setSelectedYAxisMetric).toHaveBeenCalledExactlyOnceWith('y_costh');
  });

  it('selects an axis through the existing action and closes the menu', async () => {
    await openMenu('x-axis-mode-selector');
    click(testId('x-axis-mode-ttft'));
    expect(stubs.setSelectedXAxisMode).toHaveBeenCalledExactlyOnceWith('ttft');
    await eventually(() => expect(expanded('x-axis-mode-selector')).toBe('false'));
  });

  it('localizes the mobile secondary changed-count label', () => {
    setViewport(390, 844);
    mount(
      <PathnameContext.Provider value="/zh/infx/inference">
        <InferenceChartControls showXAxisMode />
      </PathnameContext.Provider>,
      { inference: {}, unofficial: {} },
    );
    const toggle = get('[data-testid="inference-secondary-controls"] > button').textContent;
    expect(toggle).toContain('更多图表设置');
    expect(toggle).toContain('项已更改');
  });
});

const mountCost = (
  model: Model,
  sequence: Sequence,
  selectedYAxisMetric = 'y_costh',
  showTcoBasis = true,
) =>
  mount(<CostControls showTcoBasis={showTcoBasis} />, {
    unofficial: {},
    inference: { selectedYAxisMetric, selectedModel: model, selectedSequence: sequence },
    globalFilters: { selectedModel: model, effectiveSequence: sequence },
  });

const expectBasisSwitch = () => {
  expect(testId('tco-basis-internal').getAttribute('aria-pressed')).toBe('true');
  click(testId('tco-basis-external'));
  expect(stubs.setTcoBasis_global).toHaveBeenCalledTimes(1);
  expect(stubs.setTcoBasis_global.mock.calls[0]).toEqual(['external']);
};

describe('Inference ChartControls cost metrics', () => {
  beforeEach(() => {
    mountCost(Model.Qwen3_5, Sequence.EightK_OneK);
  });

  for (const sequence of [Sequence.EightK_OneK, Sequence.AgenticTraces]) {
    it(`switches the global TCO basis for Kimi K3 on ${sequence}`, () => {
      mountCost(Model.Kimi_K3, sequence);
      expectBasisSwitch();
    });
  }

  for (const model of [Model.Muse_Spark_Open, Model.GLM_5_2, Model.GLM_5_3_Flash]) {
    it(`switches the global TCO basis for ${model} on AgentX`, () => {
      mountCost(model, Sequence.AgenticTraces);
      expectBasisSwitch();
    });
  }

  it('hides the TCO basis toggle for other models and scenarios', () => {
    mountCost(Model.DeepSeek_V4_Pro, Sequence.EightK_OneK);
    expect($('[data-testid="yaxis-metric-selector"]')).not.toBeNull();
    expect($('[data-testid="tco-basis-toggle"]')).toBeNull();
    mountCost(Model.Qwen3_5, Sequence.OneK_OneK);
    expect($('[data-testid="tco-basis-toggle"]')).toBeNull();
  });

  for (const selectedYAxisMetric of ['y_tpPerGpu', 'y_tpPerMw'] as const) {
    it(`hides TCO for ${selectedYAxisMetric} even with visible TPU hardware`, () => {
      mountCost(Model.Qwen3_5, Sequence.EightK_OneK, selectedYAxisMetric);
      expect(isVisible(testId('yaxis-metric-selector'))).toBe(true);
      expect($('[data-testid="tco-basis-toggle"]')).toBeNull();
    });
  }

  it('hides TCO for a cost metric when no TPU hardware is visible', () => {
    mountCost(Model.Qwen3_5, Sequence.EightK_OneK, 'y_costh', false);
    expect(isVisible(testId('yaxis-metric-selector'))).toBe(true);
    expect($('[data-testid="tco-basis-toggle"]')).toBeNull();
  });

  it('shows cost per million and tokens per dollar as separate Y-axis options', async () => {
    await openMenu('yaxis-metric-selector');
    for (const label of [
      /^Cost per Million Total Tokens$/u,
      /^Total Tokens per \$1 TCO$/u,
      /^Output Tokens per \$1 TCO$/u,
      /^Input Tokens per \$1 TCO$/u,
    ])
      expect(findContaining('[data-slot="select-item"]', label)).not.toBeNull();
  });

  it('selects tokens per dollar through the Y-axis metric control on the active tier', async () => {
    await openMenu('yaxis-metric-selector');
    click(contains('[data-slot="select-item"]', /^Total Tokens per \$1 TCO$/u));
    expect(stubs.setSelectedYAxisMetric).toHaveBeenCalledWith('y_tokensPerDollarH');
  });
});

describe('Inference ChartControls infrastructure tokens per dollar', () => {
  beforeEach(() => {
    mount(<InferenceChartControls showXAxisMode />, {
      unofficial: {},
      inference: { selectedYAxisMetric: 'y_tokensPerDollarR' },
      globalFilters: {},
    });
  });

  it('keeps the rental tier when switching between tiered metrics', async () => {
    expect($('[data-testid="cost-tier-selector"]')).toBeNull();
    await openMenu('yaxis-metric-selector');
    click(contains('[data-slot="select-item"]', /^Cost per Million Output Tokens$/u));
    expect(stubs.setSelectedYAxisMetric).toHaveBeenCalledExactlyOnceWith('y_costrOutput');
  });

  it('does not show the token sale-price source control', () => {
    expect(findContaining('Token Price Source')).toBeNull();
    expect($('[data-testid="token-revenue-price-source"]')).toBeNull();
  });
});

describe('Inference ChartControls with GPUs selected', () => {
  it('shows the date range picker when GPUs are selected', () => {
    mount(<InferenceChartControls showXAxisMode />, {
      unofficial: {},
      inference: { selectedGPUs: ['h100'], selectedDateRange: { startDate: '', endDate: '' } },
    });
    expect(isVisible(contains('Comparison Date Range'))).toBe(true);
  });

  it('leaves the optional date range unflagged for a selected current config', () => {
    mount(<InferenceChartControls showXAxisMode />, {
      unofficial: {},
      inference: {
        selectedGPUs: ['h100'],
        selectedDateRange: { startDate: '', endDate: '' },
        selectedDates: [],
      },
    });
    const picker = contains('button', 'Select date range');
    expect(picker.classList.contains('animate-pulse')).toBe(false);
    expect(picker.classList.contains('border-red-500')).toBe(false);
  });

  it('leaves the date range unflagged when exact comparison entries are pinned', () => {
    mount(<InferenceChartControls showXAxisMode />, {
      unofficial: {},
      inference: {
        selectedGPUs: ['b200_sglang', 'b200_vllm'],
        selectedDateRange: { startDate: '', endDate: '' },
        selectedDates: ['2026-08-07', '2026-07-09~r27489075807'],
      },
    });
    expect(contains('button', 'Select date range').classList.contains('animate-pulse')).toBe(false);
  });
});

const consentPending = Promise.withResolvers<void>().promise;
let openConsent: () => void = () => {};

/** Stands in for the engine-comparison consent dialog, still loading while the test looks. */
function ConsentDialog() {
  const [open, setOpen] = useState(false);
  openConsent = () => setOpen(true);
  if (open) use(consentPending);
  return null;
}

describe('Inference ChartControls GPU picks the provider does not apply', () => {
  it('keeps the GPU trigger on the committed selection while consent opens', () => {
    mount(
      <>
        <InferenceChartControls showXAxisMode />
        <Suspense fallback={null}>
          <ConsentDialog />
        </Suspense>
      </>,
      {
        unofficial: {},
        inference: {
          selectedGPUs: [],
          setSelectedGPUs: () => {
            openConsent();
            return false;
          },
        },
      },
    );
    const trigger = get('[data-testid="gpu-multiselect"] [data-slot="select-trigger"]');
    click(trigger);
    click(contains('[role="option"]', /^H100$/u));
    expect(trigger.textContent).not.toContain('H100');
    expect(trigger.textContent).toContain('Select Chip Config');
  });
});

describe('Inference ChartControls with hideGpuComparison', () => {
  it('hides GPU config selector when hideGpuComparison is true', () => {
    mount(<InferenceChartControls hideGpuComparison />, { unofficial: {}, inference: {} });
    expect(findContaining('Chip Config')).toBeNull();
    expect($('[data-testid="gpu-multiselect"]')).toBeNull();
  });
});

describe('Inference axis selector — Chinese Agentic controls', () => {
  it('keeps every full option name and a localized FAQ link on phones', async () => {
    setViewport(390, 844);
    mount(
      <PathnameContext.Provider value="/zh/infx/inference">
        <InferenceChartControls showXAxisMode />
      </PathnameContext.Provider>,
      {
        unofficial: {},
        inference: { selectedSequence: Sequence.AgenticTraces, selectedXAxisMode: 'interactivity' },
      },
    );
    click(get('[data-testid="inference-secondary-controls"] > button'));
    expect(testId('x-axis-mode-selector').textContent).toContain('交互性');
    await openMenu('x-axis-mode-selector');
    expect($$('[role="grid"] [data-select-option]')).toHaveLength(4);
    expect(testId('x-axis-mode-e2e-normalized-interactivity').textContent).toBe(
      '端到端归一化交互性',
    );
    click(testId('option-help-e2e-normalized-interactivity'));
    const link = await eventually(() =>
      get('[role="dialog"] [data-testid="normalized-interactivity-faq-link"]'),
    );
    expect(link.textContent).toBe('什么是端到端归一化交互性？');
    expect(link.getAttribute('href')).toBe('/zh/about#faq-normalized-interactivity');
  });
});

describe('Axis option help', () => {
  beforeEach(() => {
    mountControls();
  });

  it('keeps metric help in the open #y-axis-select menu, not the closed control', async () => {
    expect(
      get('#y-axis-select').parentElement!.querySelector('[data-slot="info-help"]'),
    ).toBeNull();
    click(get('#y-axis-select'));
    const help = await eventually(() => testId('option-help-y_tpPerGpu'));
    expect(isVisible(help)).toBe(true);
    pointer(help, 'pointerover');
    const content = await eventually(() => testId('option-help-content-y_tpPerGpu'));
    expect(isVisible(content)).toBe(true);
    expect(content.textContent).toContain('Rate of total tokens');
    expect(get('#y-axis-select').getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps hover help readable across the pointer gap without taking search focus', async () => {
    await openMenu('yaxis-metric-selector');
    type(searchInput(), 'Total Tokens per $1 TCO');
    await eventually(() => testId('option-help-y_tokensPerDollarH'));
    useFakeTimers();
    pointer(testId('option-help-y_tokensPerDollarH'), 'pointerover');
    expect(isVisible(testId('option-help-content-y_tokensPerDollarH'))).toBe(true);
    expect(document.activeElement).toBe(searchInput());
    pointer(testId('option-help-y_tokensPerDollarH'), 'pointerout');
    tick(100);
    pointer(testId('option-help-content-y_tokensPerDollarH'), 'pointerover');
    tick(300);
    const content = testId('option-help-content-y_tokensPerDollarH');
    expect(isVisible(content)).toBe(true);
    expect(content.textContent).toContain('infrastructure spend');
    pointer(content, 'pointerout');
    tick(300);
    expect($('[data-testid="option-help-content-y_tokensPerDollarH"]')).toBeNull();
    expect(document.activeElement).toBe(searchInput());
    expect(searchInput().value).toBe('Total Tokens per $1 TCO');
    expect(stubs.setSelectedYAxisMetric).not.toHaveBeenCalled();
    expect(expanded('yaxis-metric-selector')).toBe('true');
  });

  it('dismisses hover help with Escape and still allows clicking it to keep it open', async () => {
    await openMenu('x-axis-mode-selector');
    pointer(testId('option-help-e2e'), 'pointerover');
    await eventually(() => expect(isVisible(testId('option-help-content-e2e'))).toBe(true));
    press('Escape');
    await eventually(() => expect($('[data-testid="option-help-content-e2e"]')).toBeNull());
    expect(expanded('x-axis-mode-selector')).toBe('true');
    useFakeTimers();
    const help = testId('option-help-e2e');
    pointer(help, 'pointerout');
    pointer(help, 'pointerover');
    click(help);
    pointer(help, 'pointerout');
    tick(300);
    useRealTimers();
    const content = await eventually(() => testId('option-help-content-e2e'));
    expect(isVisible(content)).toBe(true);
    type(content, '{esc}');
    await eventually(() => expect(document.activeElement).toBe(testId('option-help-e2e')));
    expect(stubs.setSelectedXAxisMode).not.toHaveBeenCalled();
  });

  it('opens descriptions and formulas without selecting an option or losing the search', async () => {
    await openMenu('yaxis-metric-selector');
    type(searchInput(), 'Total Tokens per $1 TCO');
    click(await eventually(() => testId('option-help-y_tokensPerDollarH')));
    const content = await eventually(() => testId('option-help-content-y_tokensPerDollarH'));
    expect(isVisible(content)).toBe(true);
    expect(content.textContent).toContain('infrastructure spend');
    expect(get('code', content).textContent).toBe(
      'tok/$ = (total tok/s/chip × 3,600) ÷ all-in cost per chip-hour ($)',
    );
    expect(stubs.setSelectedYAxisMetric).not.toHaveBeenCalled();
    expect(expanded('yaxis-metric-selector')).toBe('true');
    type(content, '{esc}');
    await eventually(() =>
      expect(document.activeElement).toBe(testId('option-help-y_tokensPerDollarH')),
    );
    expect(searchInput().value).toBe('Total Tokens per $1 TCO');
    click(get('[data-select-option][data-value="y_tokensPerDollarH"]'));
    expect(stubs.setSelectedYAxisMetric).toHaveBeenCalledExactlyOnceWith('y_tokensPerDollarH');
    await eventually(() => expect(expanded('yaxis-metric-selector')).toBe('false'));
  });

  it('navigates to help with arrow keys and restores focus on Escape', async () => {
    await openMenu('x-axis-mode-selector');
    await eventually(() =>
      expect(document.activeElement).toBe(testId('x-axis-mode-interactivity')),
    );
    type(testId('x-axis-mode-interactivity'), '{downarrow}{rightarrow}');
    await eventually(() => expect(document.activeElement).toBe(testId('option-help-e2e')));
    click(testId('option-help-e2e'));
    const content = await eventually(() => testId('option-help-content-e2e'));
    expect(content.textContent).toContain('total wall-clock time');
    type(content, '{esc}');
    await eventually(() => expect(document.activeElement).toBe(testId('option-help-e2e')));
    type(testId('option-help-e2e'), '{leftarrow}');
    await eventually(() => expect(document.activeElement).toBe(testId('x-axis-mode-e2e')));
    type(testId('x-axis-mode-e2e'), '{esc}');
    await eventually(() => {
      expect(document.activeElement).toBe(testId('x-axis-mode-selector'));
      expect(expanded('x-axis-mode-selector')).toBe('false');
    });
    expect(stubs.setSelectedXAxisMode).not.toHaveBeenCalled();
  });
});

describe('Workflow run dropdown', () => {
  const availableRuns = {
    '12345678': {
      runId: '12345678',
      runDate: '2025-03-01',
      runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/12345678',
      conclusion: 'success',
    },
    '12345679': {
      runId: '12345679',
      runDate: '2025-03-01',
      runUrl: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/12345679',
      conclusion: 'failure',
    },
  };

  it('steps between runs and keeps date navigation, status, run selection, and external links', async () => {
    mount(<WorkflowInfoDisplay />, { inference: { availableRuns }, globalFilters: {} });
    expect(get<HTMLButtonElement>('[aria-label="Previous run"]').disabled).toBe(true);
    expect(isVisible(get('[aria-label="Previous available date"]'))).toBe(true);
    expect(isVisible(get('[aria-label="Next available date"]'))).toBe(true);
    expect(get('#run-select').textContent).toContain('Run 1/2');
    expect($('#run-select [aria-label="Run succeeded"]')).not.toBeNull();
    const openRun = vi.fn();
    stubGlobal('open', openRun);
    click(get('#run-select [data-external-link] svg'));
    expect(get('#run-select').getAttribute('aria-expanded')).toBe('false');
    expect(openRun).toHaveBeenCalledExactlyOnceWith(
      availableRuns['12345678'].runUrl,
      '_blank',
      'noopener,noreferrer',
    );
    click(get('#run-select'));
    click(await eventually(() => contains('[role="option"]', 'Run 2/2')));
    expect(stubs.setSelectedRunId).toHaveBeenCalledExactlyOnceWith('12345679');
    await eventually(() => expect(get('#run-select').getAttribute('aria-expanded')).toBe('false'));
    click(get('[aria-label="Next run"]'));
    expect(stubs.setSelectedRunId).toHaveBeenCalledWith('12345679');
  });
});
