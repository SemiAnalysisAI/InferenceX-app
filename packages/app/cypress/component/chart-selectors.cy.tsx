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

describe('Chart Selectors', () => {
  for (const width of [390, 768, 1280]) {
    it(`keeps fixed and selectable values the same height at ${width}px`, () => {
      cy.viewport(width, 900);
      cy.mount(<SelectableContextHarness />);
      const height = width < 768 ? '44px' : '36px';
      const assertHeights = () => {
        cy.get('[data-testid="scenario-selector"]').should('have.css', 'height', height);
        cy.get('[data-testid="precision-multiselect"]').should('have.css', 'height', height);
      };
      cy.get('output').should('have.length', 2);
      assertHeights();
      cy.get('[data-testid="toggle-options"]').click();
      cy.get('[role="combobox"]').should('have.length', 2);
      assertHeights();
      cy.get('[data-testid="scenario-selector"]').click();
      cy.contains('[role="option"]', 'Agentic').click();
      cy.get('[data-testid="scenario-selector"]').should('contain.text', 'Agentic');
      cy.get('[data-slot="select-content"]').should('not.exist');
      for (const precision of ['FP8', 'BF16']) {
        cy.get('[data-testid="precision-multiselect"]').click();
        cy.contains('[role="option"]', precision).click();
        cy.get('[data-slot="select-content"]').should('not.exist');
        assertHeights();
      }
      cy.get('[data-testid="precision-multiselect"] [title]').should(
        'have.attr',
        'title',
        'FP4, FP8, BF16',
      );
      cy.get('[data-testid="precision-multiselect"]').click();
      cy.get('[role="option"][aria-selected="true"]').should('have.length', 3);
      cy.get('body').type('{esc}');
      cy.get('[data-testid="toggle-options"]').click();
      cy.get('output#scenario-select').should('have.text', '8K / 1K');
      cy.get('output#precision-select').should('have.text', 'FP4');
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
    cy.get('output#scenario-select').should('be.visible').and('have.text', '8K / 1K');
    cy.get('label[for="precision-select"]').should('have.text', '精度');
    cy.get('output#precision-select').should('be.visible').and('have.text', 'FP4');
    cy.get('output').each(($value) => {
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
      cy.get('output[data-testid="scenario-selector"]')
        .should('be.visible')
        .and('have.text', '8K / 1K');
      cy.get('label[for="scenario-select"]').should('have.text', 'Scenario');
      cy.get('[role="combobox"]').should('not.exist');
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
      cy.get('output[data-testid="scenario-selector"]')
        .should('be.visible')
        .and('have.text', 'Agentic');
      cy.get('label[for="scenario-select"]').should('have.text', 'Scenario');
      cy.get('[role="combobox"]').should('not.exist');
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

    it('groups a per-model retired scenario under Deprecated (MiniMax M3 8K/1K)', () => {
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
      cy.contains('[data-slot="select-label"]', 'Deprecated').should('be.visible');
      cy.contains('[data-slot="select-label"]', 'Deprecated')
        .nextAll('[role="option"]')
        .first()
        .should('contain.text', '8K / 1K');
    });

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
      cy.get('[data-testid="precision-multiselect"]').should('contain', 'FP8');
    });

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
      cy.get('output[data-testid="precision-multiselect"]')
        .should('be.visible')
        .and('have.text', 'FP8');
      cy.get('label[for="precision-select"]').should('have.text', 'Precision');
      cy.get('[role="combobox"]').should('not.exist');
    });
  });
});
