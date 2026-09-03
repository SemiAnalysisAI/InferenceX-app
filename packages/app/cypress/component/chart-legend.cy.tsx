import { Profiler, useRef, useState } from 'react';

import LegendPointsDialog from '@/components/inference/ui/LegendPointsDialog';
import { OffloadHaloLegendKey } from '@/components/inference/ui/OffloadHaloLegendKey';
import type { InferenceData } from '@/components/inference/types';
import { buildLegendPointsRows } from '@/components/inference/utils/legend-points-table';
import ChartLegend, { type CommonLegendItemProps } from '@/components/ui/chart-legend';
import { D3ChartWrapper } from '@/components/ui/d3-chart-wrapper';

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

function ChartLegendWrapper({
  items = MOCK_ITEMS,
  inChart = false,
  grouped = false,
  onQuickFilters = () => {},
}: {
  items?: CommonLegendItemProps[];
  inChart?: boolean;
  grouped?: boolean;
  onQuickFilters?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [legendItems, setLegendItems] = useState(items);
  const [optimal, setOptimal] = useState(true);
  const [gradientLabels, setGradientLabels] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleItemClick = (name: string) => {
    setLegendItems((prev) =>
      prev.map((item) =>
        (item.hw || item.name) === name ? { ...item, isActive: !item.isActive } : item,
      ),
    );
  };

  const itemsWithHandler = legendItems.map((item) => ({
    ...item,
    onClick: handleItemClick,
  }));

  const legend = (
    <ChartLegend
      legendItems={itemsWithHandler}
      isLegendExpanded={expanded}
      onExpandedChange={setExpanded}
      variant="sidebar"
      grouped={grouped}
      switches={
        inChart
          ? [
              {
                id: 'optimal',
                label: 'Optimal Only',
                checked: optimal,
                onCheckedChange: setOptimal,
                infoTooltip: 'Only show the optimal data points.',
              },
              {
                id: 'gradient-labels',
                label: 'Gradient Labels',
                checked: gradientLabels,
                onCheckedChange: setGradientLabels,
              },
              {
                id: 'log-scale',
                label: 'Log Scale',
                checked: logScale,
                onCheckedChange: setLogScale,
                advanced: true,
              },
            ]
          : undefined
      }
      actions={[
        ...(itemsWithHandler.some((i) => !i.isActive)
          ? [{ id: 'reset-filter', label: 'Reset filter', onClick: () => setLegendItems(items) }]
          : []),
        ...(inChart
          ? [{ id: 'quick-filters', label: 'Quick Filters', onClick: onQuickFilters }]
          : []),
      ]}
    />
  );

  return inChart ? (
    <D3ChartWrapper
      chartId="legend-layout-chart"
      svgRef={svgRef}
      tooltipRef={tooltipRef}
      setContainerRef={() => {}}
      dimensions={{ width: 600, height: 575 }}
      pinnedPoint={null}
      isPinned={() => false}
      dismissTooltip={() => {}}
      hideTooltipElements={() => {}}
      legendElement={legend}
    />
  ) : (
    legend
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

  it('derives long unofficial labels without a nested update', () => {
    const branch = 'qwen3.5-fp4-gb200-dynamo-sglang-agentic-mtp-pareto-refresh';
    const onRender = cy.spy().as('legendRender');

    cy.mount(
      <Profiler id="long-unofficial-run-legend" onRender={onRender}>
        <ChartLegend
          legendItems={[
            {
              ...MOCK_ITEMS[0],
              name: 'unofficial-run-32177976542',
              label: `✕ ${branch}`,
            },
          ]}
          isLegendExpanded={true}
          onExpandedChange={() => {}}
          variant="sidebar"
        />
      </Profiler>,
    );

    cy.get('[data-testid="chart-legend"]').should('contain.text', branch);
    cy.get('@legendRender').should((renderSpy) => {
      // Cypress loses the Sinon spy type when resolving an alias.
      const profilerSpy = renderSpy as unknown as {
        getCalls: () => { args: unknown[] }[];
      };
      const calls = profilerSpy.getCalls();
      expect(
        calls.map(({ args }) => args[1]),
        'React render phases',
      ).not.to.include('nested-update');
    });
  });

  it('legend items have colored dots', () => {
    cy.get('.sidebar-legend label').first().find('span').first().should('exist');
  });

  it('renders no search input (removed from the sidebar panel)', () => {
    cy.get('.sidebar-legend input[type="text"]').should('not.exist');
  });

  it('fits the longest single-line name with a compact, aligned points-button column', () => {
    const showPoints = cy.stub().as('showPoints');
    const items = [
      { ...MOCK_ITEMS[0], label: 'GB300 NVL72 (Dynamo vLLM)', onShowPoints: showPoints },
      { ...MOCK_ITEMS[1], label: 'H200 (vLLM)', onShowPoints: showPoints },
      {
        ...MOCK_ITEMS[2],
        name: 'unofficial-run-99',
        hw: 'overlay-run-99',
        label: '✕ comparison-run',
        isRemovable: false,
        onShowPoints: showPoints,
      },
    ];
    cy.viewport(1280, 900);
    cy.mount(<ChartLegendWrapper inChart items={items} />);
    cy.get('[data-testid="chart-legend"]').should(($legend) => {
      const panel = $legend[0].getBoundingClientRect();
      const labels = [...$legend[0].querySelectorAll<HTMLLabelElement>('label[for^="checkbox-"]')];
      const icons = labels.map((label) => label.nextElementSibling!.getBoundingClientRect());
      const widestLabel = labels[0].getBoundingClientRect();
      expect(panel.width, 'only panel padding around the name and button').to.be.lessThan(
        widestLabel.width + icons[0].width + 24,
      );
      for (const [index, label] of labels.entries()) {
        const text = label.lastElementChild as HTMLElement;
        expect(text.scrollWidth, `${label.textContent} is not truncated`).to.be.at.most(
          text.clientWidth,
        );
        expect(text.getBoundingClientRect().height, 'single-line name').to.equal(20);
        expect(icons[index].x, 'aligned points buttons').to.be.closeTo(icons[0].x, 1);
        expect(icons[index].width, 'unchanged click target').to.be.at.least(21);
      }
      const range = labels[0].ownerDocument.createRange();
      range.selectNodeContents(labels[0].lastElementChild!);
      const glyph = labels[0].nextElementSibling!.querySelector('svg')!.getBoundingClientRect();
      expect(glyph.left - range.getBoundingClientRect().right, 'name-to-icon gap').to.be.closeTo(
        8,
        1,
      );
      const optimal = $legend.find('[data-testid="optimal"]')[0].getBoundingClientRect();
      const gradient = $legend.find('[data-testid="gradient-labels"]')[0].getBoundingClientRect();
      expect(gradient.top, 'display controls have separate rows').to.be.greaterThan(optimal.bottom);
    });
    cy.get('[data-testid="legend-points-h100-sxm"]').click();
    cy.get('@showPoints').should('have.been.calledWith', 'h100-sxm');
    cy.get('#checkbox-h100-sxm').should('be.checked');
    cy.get('[data-testid="legend-points-overlay-run-99"]').click();
    cy.get('@showPoints').should('have.been.calledWith', 'overlay-run-99');
    cy.get('[data-testid="gradient-labels"]').click().should('have.attr', 'aria-checked', 'true');
  });

  for (const width of [390, 1280]) {
    it(`keeps long unofficial names and their points action inside the panel at ${width}px`, () => {
      const label = '✕ qwen3.5-fp4-gb200-dynamo-sglang-agentic-mtp-pareto-refresh';
      cy.viewport(width, 900);
      cy.mount(
        <ChartLegendWrapper
          inChart
          items={[
            ...MOCK_ITEMS,
            {
              ...MOCK_ITEMS[0],
              name: 'unofficial-run-99',
              hw: 'overlay-run-99',
              label,
              isRemovable: false,
              onShowPoints: cy.stub().as('overlayPoints'),
            },
          ]}
        />,
      );
      cy.get('[data-testid="legend-points-overlay-run-99"]')
        .should(($button) => {
          const panel = $button.closest('.sidebar-legend')[0].getBoundingClientRect();
          expect($button[0].getBoundingClientRect().right).to.be.at.most(panel.right);
          expect(panel.right).to.be.at.most(width);
        })
        .click();
      cy.get('@overlayPoints').should('have.been.calledWith', 'overlay-run-99');
      cy.get('label[for="checkbox-overlay-run-99"]')
        .should('have.attr', 'title', label)
        .and('contain.text', label);
    });

    it(`keeps the same toggle and hit area in place across collapse and reopen at ${width}px`, () => {
      cy.viewport(width, 900);
      cy.mount(<ChartLegendWrapper inChart />);
      cy.get('[data-testid="legend-close-button"]')
        .should('have.attr', 'aria-expanded', 'true')
        .then(($button) => {
          const button = $button[0];
          const bounds = button.getBoundingClientRect();
          const plotWidth = Cypress.$('[data-testid="d3-chart-svg"]')[0].getBoundingClientRect()
            .width;
          cy.wrap($button).click({ scrollBehavior: false });
          cy.get('[data-testid="legend-open-button"]')
            .should('have.focus')
            .and('have.attr', 'aria-expanded', 'false')
            .and('have.attr', 'aria-label', 'Show legend')
            .should(($toggle) => {
              expect($toggle[0], 'same focused DOM button').to.equal(button);
              const collapsed = $toggle[0].getBoundingClientRect();
              for (const edge of ['x', 'y', 'width', 'height'] as const) {
                expect(collapsed[edge], `collapsed ${edge}`).to.be.closeTo(bounds[edge], 1);
              }
              if (width >= 1024) {
                expect(
                  Cypress.$('[data-testid="d3-chart-svg"]')[0].getBoundingClientRect().width,
                ).to.be.greaterThan(plotWidth);
              }
            })
            .find('svg')
            .should('have.class', 'lucide-panel-right-open');
          cy.get('[data-testid="legend-open-button"]').click({ scrollBehavior: false });
          cy.get('[data-testid="legend-close-button"]')
            .should('have.focus')
            .and('have.attr', 'aria-label', 'Hide legend')
            .should(($toggle) => {
              expect($toggle[0]).to.equal(button);
              const reopened = $toggle[0].getBoundingClientRect();
              expect(reopened.x).to.be.closeTo(bounds.x, 1);
              expect(reopened.y).to.be.closeTo(bounds.y, 1);
            })
            .find('svg')
            .should('have.class', 'lucide-panel-right-close');
        });
    });

    it(`fits a short list and keeps actions with the close button at ${width}px`, () => {
      cy.viewport(width, 900);
      cy.mount(<ChartLegendWrapper inChart onQuickFilters={cy.stub().as('quickFilters')} />);
      cy.get('[data-testid="chart-legend"]')
        .scrollIntoView()
        .should(($legend) => {
          const panel = $legend[0].getBoundingClientRect();
          const list = $legend.find('ul')[0].getBoundingClientRect();
          const controls = $legend
            .find('[data-testid="legend-display-controls"]')[0]
            .getBoundingClientRect();
          expect(panel.height).to.be.lessThan(280);
          expect(controls.top - list.bottom).to.be.lessThan(16);
          expect(panel.right).to.be.at.most(width);
        });
      cy.get('[data-testid="legend-toolbar"]').within(() => {
        cy.get('[data-testid="quick-filters"]').click();
        cy.get('[data-testid="legend-close-button"]').should('be.visible');
      });
      cy.get('@quickFilters').should('have.been.calledOnce');
      cy.get('.sidebar-legend label').contains('NVIDIA H100 SXM').click();
      cy.get('[data-testid="legend-toolbar"] [data-testid="reset-filter"]').click();
      cy.get('.sidebar-legend input[type="checkbox"]').should('be.checked');
      cy.get('[data-testid="legend-advanced-toggle"]').click();
      cy.get('[data-testid="log-scale"]').click().should('have.attr', 'aria-checked', 'true');
      cy.get('[data-testid="legend-close-button"]').click();
      cy.get('[data-testid="legend-open-button"]').click();
      cy.get('[data-testid="log-scale"]').should('have.attr', 'aria-checked', 'true');
    });

    for (const grouped of [false, true]) {
      it(`scrolls a long ${grouped ? 'grouped' : 'flat'} list without hiding controls at ${width}px`, () => {
        const items = Array.from({ length: 40 }, (_, index) => ({
          ...MOCK_ITEMS[index % MOCK_ITEMS.length],
          name: `hardware-${Math.floor(index / 5)} run-${index}`,
          hw: `series-${index}`,
          label: `Run ${index + 1} — hardware comparison`,
          title: `Hardware ${Math.floor(index / 5) + 1}`,
        }));
        cy.viewport(width, 900);
        cy.mount(<ChartLegendWrapper inChart grouped={grouped} items={items} />);
        cy.get('[data-testid="chart-legend"]')
          .scrollIntoView()
          .should(($legend) => {
            const panel = $legend[0].getBoundingClientRect();
            const scroller = $legend.find('.custom-scrollbar')[0];
            const controls = $legend
              .find('[data-testid="legend-display-controls"]')[0]
              .getBoundingClientRect();
            expect(panel.height).to.be.at.most(width < 1024 ? 384 : 575);
            expect(scroller.scrollHeight).to.be.greaterThan(scroller.clientHeight);
            expect(controls.bottom).to.be.at.most(panel.bottom);
          });
        cy.get('.sidebar-legend label').contains('Run 40 —').scrollIntoView().click();
        cy.get('#checkbox-series-39').should('not.be.checked');
        cy.get('[data-testid="optimal"]')
          .should('be.visible')
          .click()
          .should('have.attr', 'aria-checked', 'false');
        cy.get('[data-testid="legend-toolbar"] [data-testid="reset-filter"]').click();
        cy.get('#checkbox-series-39').should('be.checked');
      });
    }
  }

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

  it('close button hides the panel and the reopen button restores it', () => {
    cy.get('.sidebar-legend').should('exist');
    cy.get('[data-testid="legend-close-button"]').click();
    cy.get('.sidebar-legend').should('not.exist');
    cy.get('[data-testid="legend-open-button"]').should('be.visible');
    cy.get('[data-testid="legend-open-button"]').click();
    cy.get('.sidebar-legend').should('exist');
    cy.get('[data-testid="legend-open-button"]').should('not.exist');
  });

  it('renders no points-table icon when items have no onShowPoints handler', () => {
    cy.get('[data-testid^="legend-points-"]').should('not.exist');
  });

  it('renders an exportable key explaining the agentic offload halo', () => {
    cy.mount(
      <ChartLegend
        legendItems={MOCK_ITEMS}
        isLegendExpanded={true}
        onExpandedChange={() => {}}
        variant="sidebar"
        keyIndicators={<OffloadHaloLegendKey />}
      />,
    );

    cy.get('[data-testid="offload-halo-key"]')
      .should('be.visible')
      .and('contain.text', 'KV offload ON')
      .and('not.contain.text', 'Dashed halo:')
      .and('not.have.class', 'no-export');
    cy.get('[data-testid="offload-halo-key"] circle[stroke-dasharray="3 2"]').should('exist');
    cy.get('[data-testid="chart-legend"]').then(($legend) => {
      const exportClone = $legend[0].cloneNode(true) as HTMLElement;
      expect(exportClone.querySelector('[data-testid="offload-halo-key"]')).not.to.equal(null);
    });
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
          subtitle="DeepSeek V4 Pro · Agentic"
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
      'DeepSeek V4 Pro · Agentic',
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
