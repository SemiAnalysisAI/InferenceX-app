import { useState } from 'react';

import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';

const OPTIONS: MultiSelectOption[] = [
  { value: 'h100-sxm', label: 'NVIDIA H100 SXM' },
  { value: 'h200-sxm', label: 'NVIDIA H200 SXM' },
  { value: 'mi300x', label: 'AMD MI300X' },
  { value: 'b200-sxm', label: 'NVIDIA B200 SXM' },
  { value: 'b300-sxm', label: 'NVIDIA B300 SXM' },
];

function MultiSelectWrapper({
  initial = [],
  maxSelections,
  minSelections,
  searchable = true,
}: {
  initial?: string[];
  maxSelections?: number;
  minSelections?: number;
  searchable?: boolean;
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <MultiSelect
      options={OPTIONS}
      value={value}
      onChange={setValue}
      placeholder="Select GPUs..."
      maxSelections={maxSelections}
      minSelections={minSelections}
      searchable={searchable}
    />
  );
}

describe('MultiSelect', () => {
  it('renders placeholder when no selections', () => {
    cy.mount(<MultiSelectWrapper />);
    cy.contains('Select GPUs...').should('be.visible');
  });

  it('click trigger opens dropdown', () => {
    cy.mount(<MultiSelectWrapper />);
    cy.get('[data-slot="select-trigger"]').click();
    cy.get('[data-slot="select-content"]').should('be.visible');
  });

  it('selecting an item adds a badge', () => {
    cy.mount(<MultiSelectWrapper />);
    cy.get('[data-slot="select-trigger"]').click();
    cy.get('[data-slot="select-item"]').contains('NVIDIA H100 SXM').click();
    // Badge should appear in the trigger area
    cy.get('[data-slot="select-trigger"]').within(() => {
      cy.contains('NVIDIA H100 SXM').should('be.visible');
    });
  });

  it('deselecting removes badge', () => {
    cy.mount(<MultiSelectWrapper initial={['h100-sxm']} />);
    // Badge should be visible initially
    cy.get('[data-slot="select-trigger"]').within(() => {
      cy.contains('NVIDIA H100 SXM').should('be.visible');
    });
    // Open dropdown and click the selected item to deselect
    cy.get('[data-slot="select-trigger"]').click();
    cy.get('[data-slot="select-item"]').contains('NVIDIA H100 SXM').click();
    // Badge should be gone, placeholder should return
    cy.contains('Select GPUs...').should('be.visible');
  });

  it('search filters options', () => {
    cy.mount(<MultiSelectWrapper searchable={true} />);
    cy.get('[data-slot="select-trigger"]').click();
    cy.get('input[placeholder="Search..."]').type('MI300');
    // Only AMD MI300X should be visible
    cy.get('[data-slot="select-item"]').should('have.length', 1);
    cy.get('[data-slot="select-item"]').contains('AMD MI300X').should('be.visible');
  });

  it('maxSelections prevents selecting more items', () => {
    cy.mount(<MultiSelectWrapper initial={['h100-sxm', 'h200-sxm']} maxSelections={2} />);
    cy.get('[data-slot="select-trigger"]').click();
    // The counter should show 2 / 2 selected
    cy.contains('2 / 2 selected').should('be.visible');
    // Unselected options should have opacity-50 (disabled appearance)
    cy.get('[data-slot="select-item"]')
      .contains('AMD MI300X')
      .parent()
      .should('have.class', 'opacity-50');
  });

  it('minSelections prevents deselecting below minimum', () => {
    cy.mount(<MultiSelectWrapper initial={['h100-sxm']} minSelections={1} />);
    // Try to deselect via dropdown
    cy.get('[data-slot="select-trigger"]').click();
    cy.get('[data-slot="select-item"]').contains('NVIDIA H100 SXM').click();
    // Should still be selected since we can't go below 1
    cy.get('[data-slot="select-trigger"]').within(() => {
      cy.contains('NVIDIA H100 SXM').should('be.visible');
    });
  });

  it('clear all removes all selections', () => {
    cy.mount(<MultiSelectWrapper initial={['h100-sxm', 'h200-sxm']} />);
    // Badges should be visible
    cy.get('[data-slot="select-trigger"]').within(() => {
      cy.contains('NVIDIA H100 SXM').should('be.visible');
      cy.contains('NVIDIA H200 SXM').should('be.visible');
    });
    // Click clear all button
    cy.get('[aria-label="Clear all selections"]').click();
    // Placeholder should return
    cy.contains('Select GPUs...').should('be.visible');
  });

  it('click outside closes dropdown', () => {
    cy.mount(
      <div>
        <div data-testid="outside-area" style={{ padding: '50px' }}>
          Outside
        </div>
        <MultiSelectWrapper />
      </div>,
    );
    cy.get('[data-slot="select-trigger"]').click();
    cy.get('[data-slot="select-content"]').should('be.visible');
    // Click outside the component
    cy.get('[data-testid="outside-area"]').click({ force: true });
    cy.get('[data-slot="select-content"]').should('not.exist');
  });
});
