// @test-environment jsdom
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { useState } from 'react';
import { describe, expect, it, vi } from 'bun:test';

import { Model, MODEL_OPTIONS, Scenario } from '@/lib/catalog/data-mappings';
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
  render,
  type,
} from '@/test/dom';

import { ModelSelector, PrecisionSelector, ScenarioSelector } from './chart-selectors';
import { TooltipProvider } from './tooltip';

function ModelSelectorHarness() {
  const [value, setValue] = useState('DeepSeek-R1-0528');
  return (
    <TooltipProvider>
      <ModelSelector
        value={value}
        onChange={setValue}
        availableModels={[
          Model.DeepSeek_R1,
          Model.GptOss,
          Model.Qwen3_5,
          Model.MiniMax_M2_5,
          Model.Llama3_3_70B,
        ]}
        data-testid="model-selector"
      />
    </TooltipProvider>
  );
}

function PrecisionSelectorHarness() {
  const [value, setValue] = useState(['FP8']);
  return (
    <TooltipProvider>
      <PrecisionSelector
        value={value}
        onChange={setValue}
        availablePrecisions={['FP8', 'FP4', 'BF16']}
        data-testid="precision-multiselect"
      />
    </TooltipProvider>
  );
}

const options = () => $$('[role="option"]');
const visibleText = (text: string | RegExp) => expect(isVisible(contains(text))).toBe(true);
const focused = () => document.activeElement as HTMLElement;
const host = () => get('[data-testid="selector-host"]');
const selected = () => get('[data-testid="selected-scenario"]').textContent;
const chips = () => $$('[data-testid="precision-multiselect"] [data-slot="select-chip"]');
const hoverHelp = (testId: string) =>
  dispatch(
    get(`[data-testid="${testId}"]`),
    new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }),
  );
const openSelect = async (testId: string) => {
  click(get(`[data-testid="${testId}"]`));
  await eventually(() => expect($('[data-slot="select-content"]')).not.toBeNull());
};

describe('Chart Selectors', () => {
  describe('ModelSelector', () => {
    it('keeps default models in the requested selector order (en)', async () => {
      const selectModel = vi.fn();
      render(
        <PathnameContext.Provider value="/infx/inference">
          <TooltipProvider>
            <ModelSelector
              value={Model.Muse_Spark_Open}
              onChange={selectModel}
              availableModels={MODEL_OPTIONS}
              data-testid="model-selector"
            />
          </TooltipProvider>
        </PathnameContext.Provider>,
      );
      expect(get('[data-testid="model-selector"]').textContent).toContain('Muse Spark 1.3/Open');
      await openSelect('model-selector');
      expect(
        options()
          .slice(0, 8)
          .map((option) => option.textContent?.trim()),
      ).toEqual([
        'Kimi K3.1 Pro 2.8T',
        'DeepSeek V4.1 Flash 552B',
        'GLM5.2/GLM5.3 744B',
        'GLM 5.3 Flash',
        'MiniMax M3.1 Flash 428B',
        'Muse Spark 1.3/Open 816B',
        'Qwen3.5 397B',
        'Qwen3.8 Flash Next 176B',
      ]);
      click(contains('[role="option"]', 'Kimi K3 2.8T'));
      expect(selectModel).toHaveBeenCalledExactlyOnceWith(Model.Kimi_K3);
    });

    for (const locale of ['en', 'zh']) {
      it(`searches across model groups, recovers from no results, and selects by keyboard (${locale})`, async () => {
        render(
          <PathnameContext.Provider
            value={locale === 'zh' ? '/zh/infx/inference' : '/infx/inference'}
          >
            <ModelSelectorHarness />
          </PathnameContext.Provider>,
        );
        const searchLabel = locale === 'zh' ? '搜索选项' : 'Search options';
        const clearLabel = locale === 'zh' ? '清除搜索' : 'Clear search';
        await openSelect('model-selector');
        await eventually(() => expect(focused().getAttribute('aria-label')).toBe(searchLabel));
        type(focused(), 'lLaMa');
        await eventually(() => {
          expect(options()).toHaveLength(1);
          expect(options()[0].textContent).toContain('Llama 3.3 70B Instruct');
        });
        visibleText(locale === 'zh' ? '已弃用' : 'Deprecated');
        expect(findContaining(locale === 'zh' ? '维护模式' : 'Maintenance Mode')).toBeNull();
        click(get(`button[aria-label="${clearLabel}"]`));
        await eventually(() => expect(options()).toHaveLength(5));
        await eventually(() => expect(focused().getAttribute('aria-label')).toBe(searchLabel));
        type(focused(), 'no-such-model');
        await eventually(() => expect(options()).toHaveLength(0));
        visibleText(locale === 'zh' ? '没有结果' : 'No results');
        click(get(`button[aria-label="${clearLabel}"]`));
        await eventually(() => expect(options()).toHaveLength(5));
        type(focused(), 'QwEn3.5{downarrow}{enter}');
        await eventually(() => {
          const selector = get('[data-testid="model-selector"]');
          expect(selector.textContent).toContain('Qwen3.5 397B');
          expect(selector.getAttribute('aria-expanded')).toBe('false');
          expect($('[data-slot="select-content"]')).toBeNull();
        });
        await openSelect('model-selector');
        expect(get<HTMLInputElement>(`input[aria-label="${searchLabel}"]`).value).toBe('');
        expect(options()).toHaveLength(5);
      });
    }

    it('groups maintenance models separately from deprecated models', async () => {
      render(<ModelSelectorHarness />);
      await openSelect('model-selector');
      visibleText('Maintenance Mode');
      expect(isVisible(contains('[role="option"]', 'DeepSeek R1 0528 671B'))).toBe(true);
      expect(isVisible(contains('[role="option"]', 'gpt-oss 120B'))).toBe(true);
      visibleText('Deprecated');
      expect(isVisible(contains('[role="option"]', 'Llama 3.3 70B Instruct'))).toBe(true);
    });

    it('explains maintenance mode in a tooltip', async () => {
      render(<ModelSelectorHarness />);
      await openSelect('model-selector');
      hoverHelp('selector-category-maintenance-mode-info');
      await eventually(() =>
        visibleText('Updated at a lower priority because these models are irrelevant.'),
      );
    });

    it('localizes model category labels and reasons on Chinese routes', async () => {
      render(
        <PathnameContext.Provider value="/zh/infx/inference">
          <ModelSelectorHarness />
        </PathnameContext.Provider>,
      );
      await openSelect('model-selector');
      visibleText('维护模式');
      visibleText('已弃用');
      expect(findContaining('Maintenance Mode')).toBeNull();
      hoverHelp('selector-category-maintenance-mode-info');
      await eventually(() => visibleText('这些模型的相关性较低，因此以较低优先级更新。'));
    });
  });

  describe('ScenarioSelector', () => {
    for (const variant of ['field', 'caption'] as const) {
      for (const scenario of [Scenario.AgenticTraces, Scenario.EightK_OneK]) {
        it(`omits the entire ${variant} for sole scenario ${scenario}`, () => {
          const changeScenario = vi.fn();
          render(
            <TooltipProvider delayDuration={0}>
              <div data-testid="selector-host">
                <ScenarioSelector
                  variant={variant}
                  value={scenario}
                  onChange={changeScenario}
                  availableScenarios={[scenario]}
                  data-testid="scenario-selector"
                />
              </div>
            </TooltipProvider>,
          );
          expect(get('[data-testid="selector-host"]').childNodes).toHaveLength(0);
          expect(changeScenario).not.toHaveBeenCalled();
        });
      }

      const Harness = () => {
        const [multiple, setMultiple] = useState(false);
        const [value, setValue] = useState(Scenario.AgenticTraces);
        return (
          <TooltipProvider delayDuration={0}>
            <button onClick={() => setMultiple(!multiple)}>Toggle scenarios</button>
            <output data-testid="selected-scenario">{value}</output>
            <div data-testid="selector-host">
              <ScenarioSelector
                variant={variant}
                value={value}
                onChange={setValue}
                availableScenarios={
                  multiple ? [Scenario.AgenticTraces, Scenario.EightK_OneK] : [value]
                }
                data-testid="scenario-selector"
              />
            </div>
          </TooltipProvider>
        );
      };

      it(`restores the ${variant} selector when another scenario becomes available`, async () => {
        render(<Harness />);
        expect(host().childNodes).toHaveLength(0);
        click(contains('button', 'Toggle scenarios'));
        const selector = await eventually(() =>
          get<HTMLButtonElement>('[data-testid="scenario-selector"]'),
        );
        expect(selector.disabled).toBe(false);
        click(selector);
        click(await eventually(() => contains('[data-select-option]', '8K / 1K')));
        await eventually(() => expect(selected()).toBe(Scenario.EightK_OneK));
        click(contains('button', 'Toggle scenarios'));
        await eventually(() => expect(host().childNodes).toHaveLength(0));
        expect(selected()).toBe(Scenario.EightK_OneK);
      });
    }

    it('omits the sole scenario on Chinese phones', () => {
      render(
        <PathnameContext.Provider value="/zh/infx/inference">
          <TooltipProvider delayDuration={0}>
            <div className="w-40 p-3">
              <ScenarioSelector
                value={Scenario.AgenticTraces}
                onChange={() => {}}
                availableScenarios={[Scenario.AgenticTraces]}
                data-testid="scenario-selector"
              />
            </div>
          </TooltipProvider>
        </PathnameContext.Provider>,
      );
      expect($('[data-testid="scenario-selector"]')).toBeNull();
      expect($('[data-testid="option-help-agentic-traces"]')).toBeNull();
    });

    it('marks model-specific retired scenarios in their option labels', async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <ScenarioSelector
            value={Scenario.AgenticTraces}
            onChange={() => {}}
            availableScenarios={[Scenario.EightK_OneK, Scenario.AgenticTraces]}
            model={Model.MiniMax_M3}
            data-testid="scenario-selector"
          />
        </TooltipProvider>,
      );
      await openSelect('scenario-selector');
      const labels = $$('[data-slot="select-label"]');
      expect(labels).toHaveLength(1);
      expect(labels[0].textContent).toBe('Fixed Sequence Length');
      const group = contains('[data-slot="select-label"]', 'Fixed Sequence Length').closest(
        '[role="rowgroup"]',
      )!;
      expect(get('[data-select-option]', group).textContent).toBe('8K / 1K (deprecated)');
    });

    it('keeps 8K/1K in the default group for models still sweeping it', async () => {
      render(
        <TooltipProvider delayDuration={0}>
          <ScenarioSelector
            value={Scenario.AgenticTraces}
            onChange={() => {}}
            availableScenarios={[Scenario.EightK_OneK, Scenario.AgenticTraces]}
            model={Model.Qwen3_5}
            data-testid="scenario-selector"
          />
        </TooltipProvider>,
      );
      await openSelect('scenario-selector');
      expect(isVisible(contains('[data-select-option]', '8K / 1K'))).toBe(true);
      expect(get('[data-slot="select-content"]').textContent).not.toContain('Deprecated');
    });
  });

  describe('PrecisionSelector', () => {
    it('removes a precision from its chip without opening the menu or losing other selections', async () => {
      render(<PrecisionSelectorHarness />);
      await openSelect('precision-multiselect');
      click(contains('[role="option"]', 'FP4'));
      await eventually(() => expect(chips()).toHaveLength(2));
      click(get('[aria-label="Remove FP8"]'));
      await eventually(() =>
        expect(
          chips()
            .map((chip) => chip.textContent)
            .join(''),
        ).toBe('FP4'),
      );
      expect(get('[data-testid="precision-multiselect"]').getAttribute('aria-expanded')).toBe(
        'false',
      );
      expect(isVisible(get('[aria-label="Remove FP4"]'))).toBe(false);
    });
  });
});
