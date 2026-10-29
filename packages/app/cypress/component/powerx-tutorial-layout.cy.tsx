import { FlowWidget } from '@/components/powerx/widgets/flow-widget';
import { LadderWidget } from '@/components/powerx/widgets/ladder-widget';
import { MeasuredVsModeledWidget } from '@/components/powerx/widgets/measured-vs-modeled-widget';
import { PowerLadder } from '@/components/powerx/widgets/power-ladder';
import { WorkedExampleWidget } from '@/components/powerx/widgets/worked-example-widget';
import type { Locale } from '@/lib/i18n/i18n';
import { buildLadder, LADDER_HARDWARE } from '@/lib/powerx/ladder';

function series(gpu: string, label: string, ys: number[]) {
  return {
    hwKey: `${gpu}_test`,
    gpu,
    label,
    points: ys.map((y, index) => ({
      id: index + 1,
      x: 40 + index * 20,
      y,
      concurrency: 2 ** (index + 3),
      date: '2026-10-20',
    })),
  };
}

const VIEWS: Record<string, ReturnType<typeof series>[]> = {
  y_measuredAvgPower: [
    series('b200', 'B200 (vLLM)', [690, 760, 830]),
    series('gb200', 'GB200 NVL72 (Dynamo TRT)', [880, 980, 1060]),
    series('mi355x', 'MI355X (SGLang)', [980, 1080, 1170]),
  ],
  y_measuredJPerTotalToken: [
    series('b200', 'B200 (vLLM)', [0.3, 0.5, 0.9]),
    series('mi355x', 'MI355X (SGLang)', [0.4, 0.7, 1.2]),
  ],
  y_utilityModeledJPerTotalToken: [
    series('b200', 'B200 (vLLM)', [0.45, 0.75, 1.3]),
    series('mi355x', 'MI355X (SGLang)', [0.6, 1, 1.7]),
  ],
};

/** The data-driven widgets in page order, each followed by a marker that must never move. */
function Widgets({ locale }: { locale: Locale }) {
  return (
    <div lang={locale} className="space-y-8 p-4">
      <LadderWidget locale={locale} alt="ladder" />
      <hr data-marker />
      <FlowWidget locale={locale} alt="flow" />
      <hr data-marker />
      <MeasuredVsModeledWidget locale={locale} alt="measured vs modeled" />
      <hr data-marker />
      <WorkedExampleWidget locale={locale} alt="worked example" />
      <hr data-marker />
    </div>
  );
}

const positions = (selector: string) =>
  cy.get(selector).then(($elements) =>
    [...$elements].map((element) => {
      const box = element.getBoundingClientRect();
      const view = element.ownerDocument.defaultView!;
      return [Math.round(box.left + view.scrollX), Math.round(box.top + view.scrollY)];
    }),
  );

/** Layout shifts the browser reports from now on; empty where the API is unsupported. */
const recordShifts = () =>
  cy.window().then((win) => {
    const shifts: number[] = [];
    if (win.PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      new win.PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          shifts.push((entry as unknown as { value: number }).value);
      }).observe({ type: 'layout-shift' });
    }
    return shifts;
  });

describe('PowerX tutorial layout stability', () => {
  it('keeps every widget box in place while the views API loads', () => {
    cy.viewport(390, 844);
    cy.intercept({ pathname: '/api/v1/views/inference' }, (request) => {
      const metric = new URL(request.url).searchParams.get('metric') ?? '';
      request.reply({
        delay: 2000,
        body: {
          series: VIEWS[metric] ?? [],
          xAxis: { label: 'Interactivity' },
          metric: { label: metric, labelZh: metric, unit: null },
          count: (VIEWS[metric] ?? []).length,
        },
      });
    });
    // Phone-width columns and a desktop-width column, in both locales.
    cy.mount(
      <div>
        <Widgets locale="en" />
        <Widgets locale="zh" />
        <div style={{ width: 960 }}>
          <Widgets locale="en" />
          <Widgets locale="zh" />
        </div>
      </div>,
    );

    cy.get('[data-node]').should('have.length', 32);
    cy.get('[data-testid="powerx-ladder-source"]').each(($source) =>
      expect($source.text()).to.match(/Loading|正在加载/u),
    );
    recordShifts().then((shifts) =>
      positions('[data-marker], [data-testid="powerx-ladder-source"]').then((before) => {
        cy.get('[data-testid="powerx-ladder-source"]').should(($sources) => {
          for (const source of $sources) expect(source.textContent).to.contain('tok/s/user');
        });
        cy.get('[data-testid="powerx-widget-measured-vs-modeled"] svg circle').should('exist');
        positions('[data-marker], [data-testid="powerx-ladder-source"]').should(
          'deep.equal',
          before,
        );
        // The ladders build and count up for about two seconds after the data lands.
        cy.wait(2500);
        positions('[data-marker], [data-testid="powerx-ladder-source"]').should(
          'deep.equal',
          before,
        );
        cy.then(() => expect(shifts, 'layout shifts').to.deep.equal([]));
      }),
    );
  });

  it('reserves the same box for any GPU draw, at most one label row taller than drawn', () => {
    cy.viewport(1100, 900);
    const widths = [288, 358, 447, 448, 575, 576, 895, 896, 1000];
    const cases = (['en', 'zh'] as const).flatMap((locale) =>
      LADDER_HARDWARE.flatMap((hardware) =>
        [false, true].flatMap((compact) =>
          widths.map((width) => ({ locale, hardware, compact, width })),
        ),
      ),
    );
    cy.mount(
      <div>
        {cases.map(({ locale, hardware, compact, width }) => (
          <div key={`${locale}-${hardware}-${compact}-${width}`} data-case style={{ width }}>
            {[0.35, 0.6, 0.95].map((draw) => (
              <PowerLadder
                key={draw}
                ladder={buildLadder(hardware, buildLadder(hardware, 1)!.tdpWatts * draw)!}
                color="#16a34a"
                locale={locale}
                compact={compact}
              />
            ))}
          </div>
        ))}
      </div>,
    );
    cy.get('svg[role="img"]').should('have.length', cases.length * 3);
    cy.get('[data-case]').each(($case) => {
      const boxes = [...$case[0].querySelectorAll('svg[role="img"]')].map((element) => {
        const svg = element as SVGSVGElement;
        return {
          drawn: svg.height.baseVal.value,
          reserved: Number.parseFloat(getComputedStyle(svg.parentElement!).minHeight),
        };
      });
      expect(new Set(boxes.map((box) => box.reserved)).size, 'one reserve per case').to.equal(1);
      for (const { drawn, reserved } of boxes) {
        expect(drawn).to.be.at.most(reserved);
        expect(reserved - drawn).to.be.at.most(15);
      }
    });
  });

  for (const width of [390, 1280]) {
    it(`holds the flow diagram and caption still while hovering at ${width}px`, () => {
      cy.viewport(width, 900);
      cy.mount(
        <div className="p-4">
          <FlowWidget locale="en" alt="flow" />
          <hr data-marker />
        </div>,
      );
      cy.get('[data-node]').should('have.length', 8);
      cy.get('[data-testid="powerx-widget-flow"] svg').then(($svg) => {
        const svg = $svg[0] as unknown as SVGSVGElement;
        const reserved = Number.parseFloat(getComputedStyle(svg.parentElement!).minHeight);
        expect(svg.height.baseVal.value).to.equal(reserved);
      });
      recordShifts().then((shifts) =>
        positions('[data-marker], [data-testid="powerx-flow-caption"]').then((before) => {
          cy.get('[data-node]').each(($node) => {
            // Cypress hit-tests the <g> against its own SVG; the event itself is what React sees.
            cy.wrap($node).trigger('mouseover', { force: true });
            cy.get('[data-testid="powerx-flow-caption"]').should(
              'contain',
              $node.find('text').first().text(),
            );
            positions('[data-marker], [data-testid="powerx-flow-caption"]').should(
              'deep.equal',
              before,
            );
          });
          cy.then(() => expect(shifts, 'layout shifts').to.deep.equal([]));
        }),
      );
    });
  }
});
