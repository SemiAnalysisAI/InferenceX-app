import { useState } from 'react';

import { ModelSelector, SequenceSelector, PrecisionSelector } from '@/components/ui/chart-selectors';
import { TooltipProvider } from '@/components/ui/tooltip';

function ModelSelectorHarness() {
  const [value, setValue] = useState('DeepSeek-R1-0528');
  return (
    <TooltipProvider>
      <ModelSelector
        value={value}
        onChange={setValue}
        availableModels={['DeepSeek-R1-0528', 'Llama-4-Maverick', 'Qwen3-235B']}
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

    it('renders with data-testid', () => {
      cy.get('[data-testid="model-selector"]').should('be.visible');
    });

    it('shows options when clicked', () => {
      cy.get('[data-testid="model-selector"]').click();
      cy.get('[role="option"]').should('have.length.greaterThan', 0);
    });

    it('selecting an option updates the displayed value', () => {
      cy.get('[data-testid="model-selector"]').click();
      cy.get('[role="option"]').contains('Qwen3-235B').click();
      cy.get('[data-testid="model-selector"]').should('contain', 'Qwen3-235B');
    });
  });

  describe('SequenceSelector', () => {
    beforeEach(() => {
      cy.mount(<SequenceSelectorHarness />);
    });

    it('renders with data-testid', () => {
      cy.get('[data-testid="sequence-selector"]').should('be.visible');
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

  describe('PrecisionSelector', () => {
    beforeEach(() => {
      cy.mount(<PrecisionSelectorHarness />);
    });

    it('renders with data-testid', () => {
      cy.get('[data-testid="precision-multiselect"]').should('be.visible');
    });

    it('shows current selection', () => {
      cy.get('[data-testid="precision-multiselect"]').should('contain', 'FP8');
    });
  });
});
