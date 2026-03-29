import { useState } from 'react';

import ChartLegend, { type CommonLegendItemProps } from '@/components/ui/chart-legend';

const MOCK_ITEMS: CommonLegendItemProps[] = [
  {
    name: 'h100-sxm',
    hw: 'h100-sxm',
    label: 'NVIDIA H100 SXM',
    color: '#76b900',
    isActive: true,
    onClick: () => {},
  },
  {
    name: 'h200-sxm',
    hw: 'h200-sxm',
    label: 'NVIDIA H200 SXM',
    color: '#1a9641',
    isActive: true,
    onClick: () => {},
  },
  {
    name: 'mi300x',
    hw: 'mi300x',
    label: 'AMD MI300X',
    color: '#ed1c24',
    isActive: true,
    onClick: () => {},
  },
  {
    name: 'b200-sxm',
    hw: 'b200-sxm',
    label: 'NVIDIA B200 SXM',
    color: '#2b83ba',
    isActive: true,
    onClick: () => {},
  },
];

function ChartLegendWrapper({ items = MOCK_ITEMS }: { items?: CommonLegendItemProps[] }) {
  const [expanded, setExpanded] = useState(true);
  const [legendItems, setLegendItems] = useState(items);

  const handleItemClick = (name: string) => {
    setLegendItems((prev) =>
      prev.map((item) => (item.name === name ? { ...item, isActive: !item.isActive } : item)),
    );
  };

  const itemsWithHandler = legendItems.map((item) => ({
    ...item,
    onClick: handleItemClick,
  }));

  return (
    <ChartLegend
      legendItems={itemsWithHandler}
      isLegendExpanded={expanded}
      onExpandedChange={setExpanded}
      variant="sidebar"
      actions={
        itemsWithHandler.some((i) => !i.isActive)
          ? [{ id: 'reset-filter', label: 'Reset filter', onClick: () => setLegendItems(items) }]
          : []
      }
    />
  );
}

describe('ChartLegend (sidebar variant)', () => {
  beforeEach(() => {
    cy.mount(<ChartLegendWrapper />);
  });

  it('renders legend with items', () => {
    cy.get('.sidebar-legend').should('be.visible');
    cy.get('.sidebar-legend label').should('have.length', 4);
  });

  it('legend items have colored dots', () => {
    cy.get('.sidebar-legend label').first().find('span').first().should('exist');
  });

  it('search input filters legend items by hiding non-matches', () => {
    cy.get('.sidebar-legend input[placeholder="Search..."]').should('exist');
    cy.get('.sidebar-legend input[placeholder="Search..."]').clear().type('MI300');
    // Non-matching items are hidden via overflow-hidden class, not removed from DOM
    cy.get('.sidebar-legend li.overflow-hidden').should('have.length', 3);
    cy.get('.sidebar-legend li:not(.overflow-hidden)').should('have.length', 1);
    cy.get('.sidebar-legend li:not(.overflow-hidden)').should('contain.text', 'AMD MI300X');
  });

  it('search clear button resets search', () => {
    cy.get('.sidebar-legend input[placeholder="Search..."]').type('test');
    cy.get('button[aria-label="Clear search"]').should('be.visible');
    cy.get('button[aria-label="Clear search"]').click();
    cy.get('.sidebar-legend input[placeholder="Search..."]').should('have.value', '');
    cy.get('button[aria-label="Clear search"]').should('not.exist');
  });

  it('clicking a legend item toggles its active state', () => {
    cy.get('.sidebar-legend label').first().click();
    // After clicking, "Reset filter" should appear since one item is inactive
    cy.contains('Reset filter').should('be.visible');
  });

  it('reset filter restores all items', () => {
    cy.get('.sidebar-legend label').first().click();
    cy.contains('Reset filter').should('be.visible');
    cy.contains('Reset filter').click();
    cy.contains('Reset filter').should('not.exist');
  });

  it('expand/collapse button toggles legend state', () => {
    cy.get('.sidebar-legend').should('have.class', 'bg-accent');
    cy.get('.sidebar-legend button')
      .filter(':contains("Collapse"), :contains("Expand")')
      .first()
      .click();
    cy.get('.sidebar-legend').should('not.have.class', 'bg-accent');
  });
});
