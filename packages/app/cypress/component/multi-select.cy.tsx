import { useState } from 'react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

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
  options = OPTIONS,
  maxSelections,
  minSelections,
  searchable = true,
  useDefaults = false,
}: {
  initial?: string[];
  options?: MultiSelectOption[];
  maxSelections?: number;
  minSelections?: number;
  searchable?: boolean;
  useDefaults?: boolean;
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <MultiSelect
      options={options}
      value={value}
      onChange={setValue}
      placeholder={useDefaults ? undefined : 'Select Chips...'}
      maxSelections={maxSelections}
      minSelections={minSelections}
      searchable={searchable}
    />
  );
}

describe('MultiSelect', () => {
  it('selects with the keyboard, skips unavailable values, and restores trigger focus', () => {
    cy.mount(
      <MultiSelectWrapper
        options={[
          { value: 'unavailable', label: 'Unavailable', disabled: true },
          { value: 'h100', label: 'H100' },
          { value: 'h200', label: 'H200' },
        ]}
      />,
    );
    cy.get('[role="combobox"]').focus().type('{downarrow}');
    cy.get('[role="listbox"]').should('have.attr', 'aria-multiselectable', 'true');
    cy.focused().should('have.attr', 'aria-label', 'Search options').type('{downarrow}');
    cy.contains('[role="option"]', 'Unavailable').should('be.disabled');
    cy.focused().should('have.text', 'H100').type('{downarrow}{enter}');
    cy.focused().should('have.attr', 'role', 'combobox').and('have.attr', 'aria-expanded', 'false');
    cy.get('[role="listbox"]').should('not.exist');
    cy.focused().type('{downarrow}');
    cy.focused().type('{downarrow}');
    cy.focused().should('have.text', 'H100').type('{enter}');
    cy.get('[role="combobox"]').should('contain.text', 'H200').and('contain.text', 'H100');
    cy.focused().should('have.attr', 'role', 'combobox');
    cy.get('[role="listbox"]').should('not.exist');
  });

  it('closes after each selection and deselection, preserving the other selected values', () => {
    cy.mount(<MultiSelectWrapper />);
    cy.get('[role="combobox"]').click();
    cy.get('[data-slot="multi-select-done"]').should('not.exist');
    cy.get('input[aria-label="Search options"]').type('NVIDIA');
    cy.contains('[role="option"]', 'H100').click();
    cy.get('[role="listbox"]').should('not.exist');
    cy.get('[role="combobox"]').should('have.attr', 'aria-expanded', 'false').click();
    cy.get('input[aria-label="Search options"]').should('have.value', '');
    cy.contains('[role="option"]', 'H100').should('have.attr', 'aria-selected', 'true');
    cy.contains('[role="option"]', 'H200').click();
    cy.get('[role="listbox"]').should('not.exist');
    cy.get('[role="combobox"]').should('contain.text', 'H100').and('contain.text', 'H200').click();
    cy.contains('[role="option"]', 'H100').should('have.attr', 'aria-selected', 'true');
    cy.contains('[role="option"]', 'H200').should('have.attr', 'aria-selected', 'true');
    cy.contains('[role="option"]', 'H100').click();
    cy.get('[role="listbox"]').should('not.exist');
    cy.get('[role="combobox"]')
      .should('have.attr', 'aria-expanded', 'false')
      .and('contain.text', 'H200')
      .and('not.contain.text', 'H100');
  });

  it('keeps single-value selectors a one-click replacement', () => {
    cy.mount(<MultiSelectWrapper initial={['h100-sxm']} maxSelections={1} minSelections={1} />);
    cy.get('[role="combobox"]').click();
    cy.get('[data-slot="multi-select-done"]').should('not.exist');
    cy.contains('[role="option"]', 'H200').click();
    cy.get('[role="combobox"]')
      .should('have.attr', 'aria-expanded', 'false')
      .and('contain.text', 'H200')
      .and('not.contain.text', 'H100');
  });

  it('still closes with Escape when the open menu has lost element focus', () => {
    cy.mount(<MultiSelectWrapper />);
    cy.get('[role="combobox"]').click();
    cy.focused().blur();
    cy.get('[role="combobox"]').should('have.attr', 'aria-expanded', 'true');
    cy.get('body').type('{esc}');
    cy.get('[role="listbox"]').should('not.exist');
    cy.focused().should('have.attr', 'role', 'combobox');
  });

  it('keeps disabled choices in grouped menus unavailable', () => {
    cy.mount(
      <MultiSelect
        sections={[
          {
            id: 'hardware',
            header: 'Hardware',
            options: [
              { value: 'h100', label: 'H100', disabled: true },
              { value: 'h200', label: 'H200' },
            ],
          },
        ]}
        onChange={cy.stub().as('choose')}
        searchable={false}
      />,
    );
    cy.get('[role="combobox"]').click();
    cy.focused().should('have.text', 'H200').type('{enter}');
    cy.get('@choose').should('have.been.calledOnceWith', ['h200']);
  });

  it('renders placeholder when no selections', () => {
    cy.mount(<MultiSelectWrapper />);
    cy.contains('Select Chips...').should('be.visible');
    cy.get('[data-slot="select-trigger"]').should(($trigger) => {
      expect($trigger[0].getBoundingClientRect().height, 'default field height').to.equal(36);
    });
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
    cy.contains('Select Chips...').should('be.visible');
  });

  it('keeps long selected labels contained in the shared trigger density', () => {
    cy.viewport(320, 720);
    const longLabel = 'DeepSeek V4 Pro 0813 1.6T FP4 Agentic long-context deployment configuration';
    cy.mount(
      <div style={{ width: 280 }}>
        <MultiSelectWrapper options={[{ value: 'long', label: longLabel }]} initial={['long']} />
      </div>,
    );

    cy.get('[data-slot="select-trigger"]').should(($trigger) => {
      const trigger = $trigger[0];
      const bounds = trigger.getBoundingClientRect();
      expect(bounds.width).to.equal(280);
      expect(bounds.height, 'selected field keeps the shared phone touch target').to.equal(44);
      expect(trigger.scrollWidth, 'selected chip does not overflow the trigger').to.be.at.most(
        trigger.clientWidth,
      );
      const label = trigger.querySelector('span[title]') as HTMLElement;
      expect(label.title, 'full label remains available').to.equal(longLabel);
      expect(label.scrollWidth, 'long label is visually truncated').to.be.greaterThan(
        label.clientWidth,
      );
    });
    cy.get(`[aria-label="Remove ${longLabel}"]`).click();
    cy.contains('Select Chips...').should('be.visible');
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
    cy.contains('[data-slot="select-item"]', 'NVIDIA H100 SXM').should('be.disabled');
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
    cy.contains('Select Chips...').should('be.visible');
  });

  it('localizes visible and accessible defaults on Chinese routes', () => {
    cy.mount(
      <PathnameContext.Provider value="/zh/inference">
        <MultiSelectWrapper initial={['h100-sxm']} maxSelections={2} useDefaults />
      </PathnameContext.Provider>,
    );

    cy.get('[aria-label="移除 NVIDIA H100 SXM"]').should('exist');
    cy.get('[aria-label="清除所有选择"]').should('exist');
    cy.get('[data-slot="select-trigger"]').click();
    cy.get('input[placeholder="搜索..."]')
      .should('have.attr', 'aria-label', '搜索选项')
      .type('不存在');
    cy.contains('没有结果').should('be.visible');
    cy.contains('1 / 2 项已选择').should('be.visible');
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
