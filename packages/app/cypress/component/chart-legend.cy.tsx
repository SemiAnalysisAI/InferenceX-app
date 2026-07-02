import { useState } from 'react';

import LegendPointsDialog from '@/components/inference/ui/LegendPointsDialog';
import type { InferenceData } from '@/components/inference/types';
import { buildLegendPointsRows } from '@/components/inference/utils/legend-points-table';
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

  it('renders no points-table icon when items have no onShowPoints handler', () => {
    cy.get('[data-testid^="legend-points-"]').should('not.exist');
  });
});

// ---------------------------------------------------------------------------
// Per-series points table (inference legend drill-down)
// ---------------------------------------------------------------------------

function mockPoint(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2025-06-15',
    x: 100,
    y: 500,
    tp: 8,
    conc: 16,
    hwKey: 'b300-sxm',
    precision: 'fp4',
    tput_per_gpu: 1500.5,
    median_intvty: 45.2,
    p90_intvty: 38.1,
    median_ttft: 0.42,
    p90_ttft: 0.87,
    tpPerGpu: { y: 1500.5, roof: false },
    tpPerMw: { y: 50, roof: false },
    costh: { y: 1, roof: false },
    costn: { y: 1, roof: false },
    costr: { y: 1, roof: false },
    costhi: { y: 1, roof: false },
    costni: { y: 1, roof: false },
    costri: { y: 1, roof: false },
    ...overrides,
  } as InferenceData;
}

const OFFICIAL_POINTS: InferenceData[] = [
  mockPoint({ conc: 32, benchmark_type: 'agentic_traces', id: 206863, offload_mode: 'on' }),
  mockPoint({ conc: 4, benchmark_type: 'agentic_traces', id: 206860, offload_mode: 'off' }),
];

const OVERLAY_POINTS: InferenceData[] = [
  mockPoint({ conc: 8, run_url: 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/1' }),
];

/** Mirrors ScatterGraph's wiring: legend rows with onShowPoints → dialog. */
function LegendWithPointsTable() {
  const [openSeries, setOpenSeries] = useState<'official' | 'overlay' | null>(null);

  const items: CommonLegendItemProps[] = [
    {
      name: 'b300-sxm',
      hw: 'b300-sxm',
      label: 'B300 (vLLM)',
      color: '#2b83ba',
      isActive: true,
      onClick: () => {},
      onShowPoints: () => setOpenSeries('official'),
    },
    {
      name: '✕ unofficial-run-99',
      hw: 'overlay-run-99',
      label: '✕ my-branch',
      color: '#dc2626',
      isActive: true,
      onClick: () => {},
      onShowPoints: () => setOpenSeries('overlay'),
    },
  ];

  const isOverlay = openSeries === 'overlay';
  return (
    <>
      <ChartLegend
        legendItems={items}
        isLegendExpanded={true}
        onExpandedChange={() => {}}
        variant="sidebar"
      />
      {openSeries && (
        <LegendPointsDialog
          open
          onOpenChange={(open) => {
            if (!open) setOpenSeries(null);
          }}
          title={isOverlay ? '✕ my-branch' : 'B300 (vLLM)'}
          subtitle="DeepSeek V4 Pro · Agentic Traces"
          accentColor={isOverlay ? '#dc2626' : '#2b83ba'}
          rows={buildLegendPointsRows(isOverlay ? OVERLAY_POINTS : OFFICIAL_POINTS, isOverlay)}
          isOverlay={isOverlay}
        />
      )}
    </>
  );
}

describe('ChartLegend points-table icon + dialog', () => {
  beforeEach(() => {
    cy.mount(<LegendWithPointsTable />);
  });

  it('renders the icon only for rows with an onShowPoints handler', () => {
    cy.get('[data-testid="legend-points-b300-sxm"]').should('exist');
    cy.get('[data-testid="legend-points-overlay-run-99"]').should('exist');
  });

  it('opens the dialog with the series points sorted by concurrency, with row links', () => {
    cy.get('[data-testid="legend-points-b300-sxm"]').click();
    cy.get('[data-testid="legend-points-dialog"]').should('be.visible');
    cy.get('[data-testid="legend-points-dialog"]').should('contain.text', 'B300 (vLLM)');
    cy.get('[data-testid="legend-points-dialog"]').should(
      'contain.text',
      'DeepSeek V4 Pro · Agentic Traces',
    );
    // Two rows, conc ascending, linked to the agentic detail pages
    cy.get('[data-testid="legend-points-row"]').should('have.length', 2);
    cy.get('a[data-testid="legend-points-row"]')
      .first()
      .should('have.attr', 'href', '/inference/agentic/206860');
    cy.get('a[data-testid="legend-points-row"]').first().should('contain.text', '4');
    // Offload column present for agentic rows
    cy.get('[data-testid="legend-points-dialog"]').should('contain.text', 'Offload');
  });

  it('overlay series opens a link-free table with the metrics-only caption', () => {
    cy.get('[data-testid="legend-points-overlay-run-99"]').click();
    cy.get('[data-testid="legend-points-dialog"]').should('contain.text', '✕ my-branch');
    cy.get('a[data-testid="legend-points-row"]').should('not.exist');
    cy.get('div[data-testid="legend-points-row"]').should('have.length', 1);
    cy.get('[data-testid="legend-points-dialog"]').should('contain.text', 'metrics only');
    // Metrics still render
    cy.get('[data-testid="legend-points-dialog"]').should('contain.text', '1500.5');
  });

  it('dialog closes and can be reopened', () => {
    cy.get('[data-testid="legend-points-b300-sxm"]').click();
    cy.get('[data-testid="legend-points-dialog"]').should('be.visible');
    cy.get('body').type('{esc}');
    cy.get('[data-testid="legend-points-dialog"]').should('not.exist');
    cy.get('[data-testid="legend-points-overlay-run-99"]').click();
    cy.get('[data-testid="legend-points-dialog"]').should('be.visible');
  });
});
