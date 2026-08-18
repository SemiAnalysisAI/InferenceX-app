import { useState } from 'react';

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

describe('Chart Selectors', () => {
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

    it('explains the agentic workload in a tooltip that links to /datasets', () => {
      cy.mount(<ScenarioSelectorHarness />);
      cy.get('[data-testid="scenario-agentic-info"]').trigger('pointermove', {
        pointerType: 'mouse',
      });

      cy.contains('Realistic Long Context Multi Turn Agentic Workload with Sub Agents.').should(
        'be.visible',
      );
      cy.get('[data-testid="scenario-agentic-info-link"]')
        .should('be.visible')
        .and('have.attr', 'href', '/datasets');
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
  });
});
