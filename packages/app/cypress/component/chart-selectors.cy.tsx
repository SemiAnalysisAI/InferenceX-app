import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

import {
  ModelSelector,
  ScenarioSelector,
  SequenceSelector,
  PrecisionSelector,
} from '@/components/ui/chart-selectors';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Model, Sequence } from '@/lib/data-mappings';

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

function SequenceSelectorHarness() {
  const [value, setValue] = useState('1024_128');
  return (
    <TooltipProvider>
      <SequenceSelector
        value={value}
        onChange={setValue}
        availableSequences={['1024_128', '1024_8192', '8192_1024']}
        data-testid="sequence-selector"
      />
    </TooltipProvider>
  );
}

function ScenarioSelectorHarness({ initial = Sequence.AgenticTraces }: { initial?: Sequence }) {
  const [value, setValue] = useState<string>(initial);
  return (
    <TooltipProvider delayDuration={0}>
      <ScenarioSelector
        value={value}
        onChange={setValue}
        availableSequences={[Sequence.EightK_OneK, Sequence.AgenticTraces]}
        data-testid="scenario-selector"
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

function SelectableContextHarness() {
  const [multipleOptions, setMultipleOptions] = useState(false);
  const [scenario, setScenario] = useState(Sequence.EightK_OneK);
  const [precisions, setPrecisions] = useState(['fp4']);
  return (
    <TooltipProvider>
      <button
        data-testid="toggle-options"
        onClick={() => {
          setMultipleOptions(!multipleOptions);
          setScenario(Sequence.EightK_OneK);
          setPrecisions(['fp4']);
        }}
      >
        Change available configurations
      </button>
      <div className="grid grid-cols-2 gap-3 p-4">
        <ScenarioSelector
          value={scenario}
          onChange={setScenario}
          availableSequences={
            multipleOptions
              ? [Sequence.EightK_OneK, Sequence.AgenticTraces]
              : [Sequence.EightK_OneK]
          }
          data-testid="scenario-selector"
        />
        <PrecisionSelector
          value={precisions}
          onChange={setPrecisions}
          availablePrecisions={multipleOptions ? ['fp4', 'fp8', 'bf16'] : ['fp4']}
          data-testid="precision-multiselect"
        />
      </div>
    </TooltipProvider>
  );
}

function assertAgenticInfoInside(height: number) {
  cy.get('[data-testid="scenario-selector"]').should(($control) => {
    const control = $control[0];
    const bounds = control.getBoundingClientRect();
    const info = control.querySelector('[data-testid="scenario-agentic-info"]');
    expect(info, 'explainer is inside the scenario control').not.to.equal(null);
    const icon = info!.getBoundingClientRect();
    const label = control.firstElementChild!.firstElementChild!.getBoundingClientRect();
    expect(icon.left - label.right, 'explainer is directly beside Agentic').to.be.closeTo(6, 1);
    expect(icon.left).to.be.greaterThan(bounds.left);
    expect(icon.right).to.be.lessThan(bounds.right);
    expect(icon.top).to.be.greaterThan(bounds.top);
    expect(icon.bottom).to.be.lessThan(bounds.bottom);
    expect(bounds.height, 'control keeps its shared height').to.equal(height);
  });
}

function assertDisabledBenchmarkControls() {
  cy.get('[role="combobox"]')
    .should('have.length', 2)
    .each(($control) => {
      cy.wrap($control)
        .should('be.disabled')
        .and('have.css', 'cursor', 'not-allowed')
        .and('have.attr', 'aria-expanded', 'false')
        .then(() => {
          $control[0].click();
          $control[0].focus();
          expect($control[0].ownerDocument.activeElement).not.to.equal($control[0]);
        });
    });
  cy.get('[data-slot="select-content"]').should('not.exist');
}

describe('Chart Selectors', () => {
  for (const width of [390, 768, 1280]) {
    it(`keeps fixed and selectable values the same height when disabled and enabled at ${width}px`, () => {
      cy.viewport(width, 900);
      cy.mount(<SelectableContextHarness />);
      const height = width < 768 ? '44px' : '36px';
      const assertHeights = () => {
        cy.get('[data-testid="scenario-selector"]').should('have.css', 'height', height);
        cy.get('[data-testid="precision-multiselect"]').should('have.css', 'height', height);
      };
      assertDisabledBenchmarkControls();
      assertHeights();
      cy.get('[data-testid="toggle-options"]').click();
      cy.get('[role="combobox"]')
        .should('have.length', 2)
        .each(($control) => {
          cy.wrap($control).should('be.enabled');
        });
      assertHeights();
      cy.get('[data-testid="scenario-selector"]').click();
      cy.contains('[role="option"]', 'Agentic').click();
      cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic');
      cy.get('[data-slot="select-content"]').should('not.exist');
      for (const precision of ['FP8', 'BF16']) {
        cy.get('[data-testid="precision-multiselect"]').click('right');
        cy.contains('[role="option"]', precision).click();
        cy.get('[data-slot="select-content"]').should('not.exist');
        assertHeights();
      }
      cy.get('[data-testid="precision-multiselect"] [title]').should(
        'have.attr',
        'title',
        'FP4, FP8, BF16',
      );
      cy.get('[data-testid="precision-multiselect"] [data-slot="select-chip"]')
        .should('have.length', 3)
        .should(($chips) => {
          const tops = [...$chips].map((chip) => chip.getBoundingClientRect().top);
          expect(new Set(tops).size, 'precision chips stay on a single row').to.equal(1);
        });
      if (width === 390) {
        cy.get('[data-testid="precision-multiselect"] [data-slot="select-values"]').should(
          ($values) => {
            const values = $values[0];
            expect(
              values.scrollWidth,
              'all chips remain reachable by horizontal scrolling',
            ).to.be.greaterThan(values.clientWidth);
            expect(values.ownerDocument.defaultView!.getComputedStyle(values).overflowX).to.equal(
              'auto',
            );
          },
        );
      }
      cy.get('[data-testid="precision-multiselect"]').click('right');
      cy.get('[role="option"][aria-selected="true"]').should('have.length', 3);
      cy.get('[data-testid="toggle-options"]').click();
      cy.get('button#scenario-select').should('have.text', '8K / 1K');
      cy.get('button#precision-select').should('have.text', 'FP4');
      assertDisabledBenchmarkControls();
      assertHeights();
    });
  }

  it('keeps single-value benchmark context readable on Chinese phones', () => {
    cy.viewport(390, 720);
    cy.mount(
      <PathnameContext.Provider value="/zh/inference">
        <TooltipProvider delayDuration={0}>
          <div className="grid gap-3 p-4">
            <ScenarioSelector
              value={Sequence.EightK_OneK}
              onChange={() => {}}
              availableSequences={[Sequence.EightK_OneK]}
            />
            <PrecisionSelector value={['fp4']} onChange={() => {}} availablePrecisions={['fp4']} />
          </div>
        </TooltipProvider>
      </PathnameContext.Provider>,
    );
    cy.get('label[for="scenario-select"]').should('have.text', '场景');
    cy.get('button#scenario-select').should('be.visible').and('have.text', '8K / 1K');
    cy.get('label[for="precision-select"]').should('have.text', '精度');
    cy.get('button#precision-select').should('be.visible').and('have.text', 'FP4');
    cy.get('[role="combobox"]').each(($value) => {
      const bounds = $value[0].getBoundingClientRect();
      expect(bounds.height).to.be.at.least(44);
      expect(bounds.right).to.be.at.most(390);
    });
  });

  describe('ModelSelector', () => {
    beforeEach(() => {
      cy.mount(<ModelSelectorHarness />);
    });

    it('shows options when clicked', () => {
      cy.get('[data-testid="model-selector"]').click();
      cy.get('[role="option"]').should('have.length.greaterThan', 0);
    });

    it('selecting an option updates the displayed value', () => {
      cy.get('[data-testid="model-selector"]').click();
      cy.get('[role="option"]').contains('Qwen3.5 397B').click();
      cy.get('[data-testid="model-selector"]').should('contain', 'Qwen3.5 397B');
    });

    for (const locale of ['en', 'zh']) {
      it(`searches across model groups, recovers from no results, and selects by keyboard (${locale})`, () => {
        cy.viewport(locale === 'zh' ? 390 : 1280, 720);
        cy.mount(
          <PathnameContext.Provider value={locale === 'zh' ? '/zh/inference' : '/inference'}>
            <ModelSelectorHarness />
          </PathnameContext.Provider>,
        );
        const searchLabel = locale === 'zh' ? '搜索选项' : 'Search options';
        const clearLabel = locale === 'zh' ? '清除搜索' : 'Clear search';
        cy.get('[data-testid="model-selector"]').click();
        cy.focused().should('have.attr', 'aria-label', searchLabel).type('lLaMa');
        cy.get('[role="option"]')
          .should('have.length', 1)
          .and('contain.text', 'Llama 3.3 70B Instruct');
        cy.contains(locale === 'zh' ? '已弃用' : 'Deprecated').should('be.visible');
        cy.contains(locale === 'zh' ? '维护模式' : 'Maintenance Mode').should('not.exist');
        cy.get(`button[aria-label="${clearLabel}"]`).click();
        cy.get('[role="option"]').should('have.length', 5);
        cy.focused().should('have.attr', 'aria-label', searchLabel).type('no-such-model');
        cy.get('[role="option"]').should('not.exist');
        cy.contains(locale === 'zh' ? '没有结果' : 'No results').should('be.visible');
        cy.get(`button[aria-label="${clearLabel}"]`).click();
        cy.focused().type('QwEn3.5{downarrow}{enter}');
        cy.get('[data-testid="model-selector"]')
          .should('contain.text', 'Qwen3.5 397B')
          .and('have.attr', 'aria-expanded', 'false');
        cy.get('[data-slot="select-content"]').should('not.exist');
        cy.get('[data-testid="model-selector"]').click();
        cy.get(`input[aria-label="${searchLabel}"]`).should('have.value', '');
        cy.get('[role="option"]').should('have.length', 5);
      });
    }

    it('groups maintenance models separately from deprecated models', () => {
      cy.get('[data-testid="model-selector"]').click();

      cy.contains('Maintenance Mode').should('be.visible');
      cy.contains('[role="option"]', 'DeepSeek R1 0528 671B').should('be.visible');
      cy.contains('[role="option"]', 'gpt-oss 120B').should('be.visible');
      cy.contains('Deprecated').should('be.visible');
      cy.contains('[role="option"]', 'Llama 3.3 70B Instruct').should('be.visible');
    });

    it('explains maintenance mode in a tooltip', () => {
      cy.get('[data-testid="model-selector"]').click();
      cy.get('[data-testid="selector-category-maintenance-mode-info"]').trigger('pointermove', {
        pointerType: 'mouse',
      });

      cy.contains('Updated at a lower priority because these models are irrelevant.').should(
        'be.visible',
      );
    });

    it('localizes model category labels and reasons on Chinese routes', () => {
      cy.mount(
        <PathnameContext.Provider value="/zh/inference">
          <ModelSelectorHarness />
        </PathnameContext.Provider>,
      );
      cy.get('[data-testid="model-selector"]').click();
      cy.contains('维护模式').should('be.visible');
      cy.contains('已弃用').should('be.visible');
      cy.contains('Maintenance Mode').should('not.exist');
      cy.get('[data-testid="selector-category-maintenance-mode-info"]').trigger('pointermove', {
        pointerType: 'mouse',
      });
      cy.contains('这些模型的相关性较低，因此以较低优先级更新。').should('be.visible');
    });
  });

  describe('SequenceSelector', () => {
    beforeEach(() => {
      cy.mount(<SequenceSelectorHarness />);
    });

    it('shows options when clicked', () => {
      cy.get('[data-testid="sequence-selector"]').click();
      cy.get('[role="option"]').should('have.length', 3);
    });

    it('selecting an option updates the displayed value', () => {
      cy.get('[data-testid="sequence-selector"]').click();
      cy.get('[role="option"]').last().click();
      cy.get('[data-testid="sequence-selector"]').should('not.contain', '1K / 128');
    });
  });

  describe('ScenarioSelector', () => {
    it('labels the agentic scenario "Agentic"', () => {
      cy.mount(<ScenarioSelectorHarness />);
      cy.get('[data-testid="scenario-selector"]').should('have.text', 'Agentic');
      cy.get('[data-testid="scenario-selector"]').click();
      cy.contains('[role="option"]', 'Agentic').should('be.visible');
      cy.contains('[role="option"]', 'Agentic Traces').should('not.exist');
      // The lone agentic entry needs no "Agentic" heading above it.
      cy.get('[data-slot="select-content"]')
        .find('[data-slot="select-label"]')
        .should('not.contain.text', 'Agentic');
    });

    it('explains the agentic workload in a tooltip that links to /agentx', () => {
      cy.mount(<ScenarioSelectorHarness />);
      assertAgenticInfoInside(36);
      cy.get('[data-testid="scenario-agentic-info"]').trigger('pointermove', {
        pointerType: 'mouse',
      });

      cy.contains('Realistic Long Context Multi Turn Agentic Workload with Sub Agents.').should(
        'be.visible',
      );
      cy.get('[data-testid="scenario-agentic-info-link"]')
        .should('be.visible')
        .and('have.attr', 'href', '/agentx')
        .then(($link) => {
          const followLink = cy.spy().as('followAgenticLink');
          $link[0].addEventListener('click', (event) => {
            followLink(event.defaultPrevented);
            // Keep the component runner mounted while checking native link activation.
            event.preventDefault();
          });
        })
        .click();
      cy.get('@followAgenticLink').should('have.been.calledOnceWith', false);
      cy.get('[data-testid="scenario-selector"]').should('have.attr', 'aria-expanded', 'false');
      cy.get('[data-testid="scenario-agentic-info"]').click();
      cy.get('[data-testid="scenario-selector"]').should('have.attr', 'aria-expanded', 'false');
      cy.get('[data-testid="scenario-selector"]').click();
      cy.contains('[role="option"]', '8K / 1K').should('be.visible');
    });

    it('keeps the fixed-sequence scenario visible without a one-option menu', () => {
      cy.mount(
        <TooltipProvider delayDuration={0}>
          <div data-testid="selector-host">
            <ScenarioSelector
              value={Sequence.EightK_OneK}
              onChange={() => {}}
              availableSequences={[Sequence.EightK_OneK]}
              data-testid="scenario-selector"
            />
          </div>
        </TooltipProvider>,
      );
      cy.get('[data-testid="selector-host"]').should('exist');
      cy.get('button[data-testid="scenario-selector"]')
        .should('be.visible')
        .and('have.text', '8K / 1K');
      cy.get('label[for="scenario-select"]').should('have.text', 'Scenario');
      cy.get('[role="combobox"]').should('be.disabled').and('have.css', 'cursor', 'not-allowed');
    });

    it('keeps the agentic scenario and its explanation visible with one option', () => {
      cy.mount(
        <TooltipProvider delayDuration={0}>
          <div data-testid="selector-host">
            <ScenarioSelector
              value={Sequence.AgenticTraces}
              onChange={() => {}}
              availableSequences={[Sequence.AgenticTraces]}
              data-testid="scenario-selector"
            />
          </div>
        </TooltipProvider>,
      );
      cy.get('[data-testid="selector-host"]').should('exist');
      cy.get('button[data-testid="scenario-selector"]')
        .should('be.visible')
        .and('have.text', 'Agentic');
      cy.get('label[for="scenario-select"]').should('have.text', 'Scenario');
      cy.get('[role="combobox"]').should('be.disabled').and('have.css', 'cursor', 'not-allowed');
      assertAgenticInfoInside(36);
      cy.get('[data-testid="scenario-agentic-info"]').trigger('pointermove', {
        pointerType: 'mouse',
      });
      cy.get('[data-testid="scenario-agentic-info-link"]')
        .should('be.visible')
        .and('have.attr', 'href', '/agentx');
    });

    for (const fixed of [true, false]) {
      it(`keeps the ${fixed ? 'fixed' : 'selectable'} Agentic explainer inside on Chinese phones`, () => {
        cy.viewport(390, 720);
        cy.mount(
          <PathnameContext.Provider value="/zh/inference">
            <TooltipProvider delayDuration={0}>
              <div className="w-40 p-3">
                <ScenarioSelector
                  value={Sequence.AgenticTraces}
                  onChange={() => {}}
                  availableSequences={
                    fixed
                      ? [Sequence.AgenticTraces]
                      : [Sequence.AgenticTraces, Sequence.EightK_OneK]
                  }
                  data-testid="scenario-selector"
                />
              </div>
            </TooltipProvider>
          </PathnameContext.Provider>,
        );
        assertAgenticInfoInside(44);
        cy.get('[data-testid="scenario-agentic-info"]').trigger('pointermove', {
          pointerType: 'mouse',
        });
        cy.contains('真实的长上下文、多轮、带子智能体（sub-agent）的智能体工作负载。').should(
          'be.visible',
        );
        cy.get('[data-testid="scenario-agentic-info-link"]')
          .should('be.visible')
          .and('have.attr', 'href', '/zh/agentx');
      });
    }

    it('combines the fixed-length and deprecated headings for a retired scenario', () => {
      // MiniMax M3's single-turn 8k1k sweep was retired on 2026-08-04
      // (InferenceX#2493): with the model passed in, 8K / 1K moves out of the
      // default fixed-seq group into the Deprecated group.
      cy.mount(
        <TooltipProvider delayDuration={0}>
          <ScenarioSelector
            value={Sequence.AgenticTraces}
            onChange={() => {}}
            availableSequences={[Sequence.EightK_OneK, Sequence.AgenticTraces]}
            model={Model.MiniMax_M3}
            data-testid="scenario-selector"
          />
        </TooltipProvider>,
      );
      cy.get('[data-testid="scenario-selector"]').click();
      cy.get('[data-slot="select-label"]')
        .should('have.length', 1)
        .and('have.text', 'Fixed Sequence Length (Deprecated)');
      cy.contains('[data-slot="select-label"]', 'Fixed Sequence Length (Deprecated)')
        .nextAll('[role="option"]')
        .first()
        .should('contain.text', '8K / 1K');
    });

    for (const locale of ['en', 'zh']) {
      it(`keeps active and deprecated fixed-length choices in separate groups (${locale})`, () => {
        cy.viewport(390, 720);
        cy.mount(
          <PathnameContext.Provider value={locale === 'zh' ? '/zh/inference' : '/inference'}>
            <TooltipProvider delayDuration={0}>
              <div className="w-44 p-3">
                <ScenarioSelector
                  value={Sequence.AgenticTraces}
                  onChange={cy.stub().as('changeScenario')}
                  availableSequences={[
                    Sequence.AgenticTraces,
                    Sequence.EightK_OneK,
                    Sequence.OneK_OneK,
                  ]}
                  model={Model.DeepSeek_V4_Pro}
                  data-testid="scenario-selector"
                />
              </div>
            </TooltipProvider>
          </PathnameContext.Provider>,
        );
        cy.get('[data-testid="scenario-selector"]').click('right');
        const active = locale === 'zh' ? '固定序列长度' : 'Fixed Sequence Length';
        const deprecated =
          locale === 'zh' ? '固定序列长度（已弃用）' : 'Fixed Sequence Length (Deprecated)';
        cy.get('[data-slot="select-label"]').should('have.length', 2);
        cy.contains('[data-slot="select-label"]', new RegExp(`^${active}$`, 'u'))
          .parent()
          .find('[role="option"]')
          .should('have.length', 1)
          .and('have.text', '8K / 1K');
        cy.contains('[data-slot="select-label"]', deprecated)
          .should('be.visible')
          .parent()
          .find('[role="option"]')
          .should('have.length', 1)
          .and('have.text', '1K / 1K');
        cy.get('[data-testid="selector-category-deprecated-info"]').trigger('pointermove', {
          pointerType: 'mouse',
        });
        cy.get('[role="tooltip"]').should(
          'contain.text',
          locale === 'zh'
            ? 'CI 容量已重新分配给智能体编程和多轮对话场景。'
            : 'CI capacity was reallocated to agentic coding and multi-turn chat scenarios.',
        );
        cy.contains('[role="option"]', '1K / 1K').click();
        cy.get('@changeScenario').should('have.been.calledOnceWith', Sequence.OneK_OneK);
      });
    }

    it('keeps 8K/1K in the default group for models still sweeping it', () => {
      cy.mount(
        <TooltipProvider delayDuration={0}>
          <ScenarioSelector
            value={Sequence.AgenticTraces}
            onChange={() => {}}
            availableSequences={[Sequence.EightK_OneK, Sequence.AgenticTraces]}
            model={Model.DeepSeek_V4_Pro}
            data-testid="scenario-selector"
          />
        </TooltipProvider>,
      );
      cy.get('[data-testid="scenario-selector"]').click();
      cy.contains('[role="option"]', '8K / 1K').should('be.visible');
      cy.get('[data-slot="select-content"]').should('not.contain.text', 'Deprecated');
    });

    it('hides the agentic explainer on fixed-sequence scenarios', () => {
      cy.mount(<ScenarioSelectorHarness initial={Sequence.EightK_OneK} />);
      cy.get('[data-testid="scenario-selector"]').should('contain.text', '8K / 1K');
      cy.get('[data-testid="scenario-agentic-info"]').should('not.exist');

      // ...and appears as soon as the user picks the agentic scenario.
      cy.get('[data-testid="scenario-selector"]').click();
      cy.contains('[role="option"]', 'Agentic').click();
      cy.get('[data-testid="scenario-agentic-info"]').should('exist');
    });
  });

  describe('PrecisionSelector', () => {
    beforeEach(() => {
      cy.mount(<PrecisionSelectorHarness />);
    });

    it('shows current selection', () => {
      cy.get('[data-testid="precision-multiselect"] [data-slot="select-chip"]').should(
        'have.text',
        'FP8',
      );
    });

    it('removes a precision from its chip without opening the menu or losing other selections', () => {
      cy.get('[data-testid="precision-multiselect"]').click('right');
      cy.contains('[role="option"]', 'FP4').click();
      cy.get('[data-testid="precision-multiselect"] [data-slot="select-chip"]').should(
        'have.length',
        2,
      );
      cy.get('[aria-label="Remove FP8"]').click();
      cy.get('[data-testid="precision-multiselect"] [data-slot="select-chip"]').should(
        'have.text',
        'FP4',
      );
      cy.get('[data-testid="precision-multiselect"]').should('have.attr', 'aria-expanded', 'false');
      cy.get('[aria-label="Remove FP4"]').should('not.be.visible');
    });

    for (const locale of ['en', 'zh']) {
      it(`separates the compact selection count from the minimum and keeps it accurate (${locale})`, () => {
        cy.viewport(locale === 'zh' ? 390 : 1280, 720);
        cy.mount(
          <PathnameContext.Provider value={locale === 'zh' ? '/zh/inference' : '/inference'}>
            <div className="w-44">
              <PrecisionSelectorHarness />
            </div>
          </PathnameContext.Provider>,
        );
        const assertSummary = (count: number) => {
          cy.get('[data-slot="select-summary"]').should(($summary) => {
            const [selected, minimum] = [...$summary[0].children] as HTMLElement[];
            const win = selected.ownerDocument.defaultView!;
            expect(selected.textContent).to.equal(
              locale === 'zh' ? `${count} 项已选择` : `${count} selected`,
            );
            expect(minimum.textContent).to.equal(locale === 'zh' ? '最少：1' : 'Minimum: 1');
            expect(win.getComputedStyle(selected).fontSize).to.equal('12px');
            expect(win.getComputedStyle(minimum).fontSize).to.equal('12px');
            const countBounds = selected.getBoundingClientRect();
            const minimumBounds = minimum.getBoundingClientRect();
            expect(minimumBounds.top).to.equal(countBounds.top);
            expect(minimumBounds.left - countBounds.right).to.be.at.least(12);
            expect(minimumBounds.right).to.be.at.most($summary[0].getBoundingClientRect().right);
          });
        };
        cy.get('[data-testid="precision-multiselect"]').click('right');
        assertSummary(1);
        cy.contains('[role="option"]', 'FP8').should('be.disabled');
        cy.contains('[role="option"]', 'FP4').click();
        cy.get('[data-slot="select-content"]').should('not.exist');
        cy.get('[data-testid="precision-multiselect"]').click('right');
        assertSummary(2);
        cy.contains('[role="option"]', 'FP8').click();
        cy.get('[data-slot="select-content"]').should('not.exist');
        cy.get('[data-testid="precision-multiselect"]').click('right');
        assertSummary(1);
        cy.contains('[role="option"]', 'FP4').should('be.disabled');
      });
    }

    it('keeps the fixed precision visible without a one-option menu', () => {
      cy.mount(
        <TooltipProvider>
          <div data-testid="selector-host">
            <PrecisionSelector
              value={['FP8']}
              onChange={() => {}}
              availablePrecisions={['FP8']}
              data-testid="precision-multiselect"
            />
          </div>
        </TooltipProvider>,
      );
      cy.get('[data-testid="selector-host"]').should('exist');
      cy.get('button[data-testid="precision-multiselect"]')
        .should('be.visible')
        .and('have.text', 'FP8');
      cy.get('label[for="precision-select"]').should('have.text', 'Precision');
      cy.get('[role="combobox"]').should('be.disabled').and('have.css', 'cursor', 'not-allowed');
    });
  });
});
