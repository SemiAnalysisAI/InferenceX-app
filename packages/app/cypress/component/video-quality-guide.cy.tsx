import { ReferencePsnrWidget } from '@/components/video-benchmark/quality-guide/reference-psnr-widget';
import { TradeoffWidget } from '@/components/video-benchmark/quality-guide/tradeoff-widget';
import type { Locale } from '@/lib/i18n/i18n';
import type { ReferencePsnrEvidence } from '@/lib/video/reference-psnr-evidence';

/** Test-only scores, not measurements; near-equal values force the strip into several lanes. */
const PROMPTS = ['ping-pong', 'kettle-pour', 'paper-fold', 'zipper-close', 'candle-light'];
const score = (caseId: string, psnrDb: number) => ({ caseId, prompt: `${caseId} prompt`, psnrDb });
const EVIDENCE: ReferencePsnrEvidence = {
  runId: '123',
  hardware: [
    {
      hardwareKey: 'b200',
      scores: [12.9, 19.5, 16.86, 16.95, 27.4].map((value, i) => score(PROMPTS[i], value)),
    },
    {
      hardwareKey: 'h100',
      scores: [12.88, 19.65, 16.8, 16.9, 27.9].map((value, i) => score(PROMPTS[i], value)),
    },
  ],
};

/** The guide's widgets in page order, each followed by a marker that must never move. */
function Widgets({ locale }: { locale: Locale }) {
  return (
    <div lang={locale} className="space-y-8 p-4">
      <ReferencePsnrWidget locale={locale} alt="reference psnr" evidence={EVIDENCE} />
      <hr data-marker />
      <ReferencePsnrWidget
        locale={locale}
        alt="reference psnr unavailable"
        evidence={{ runId: '123', hardware: null }}
      />
      <hr data-marker />
      <TradeoffWidget locale={locale} alt="tradeoff" />
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

interface LayoutShift {
  value: number;
  sources: { node: Node | null }[];
}

/**
 * Layout shifts the browser reports from now on, except the hover tooltip, which floats above
 * the page and follows the pointer; empty where the API is unsupported.
 */
const recordShifts = () =>
  cy.window().then((win) => {
    const shifts: number[] = [];
    const floating = (node: Node | null) =>
      node instanceof win.Element && node.closest('[data-testid$="-tooltip"]') !== null;
    if (win.PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      new win.PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as LayoutShift[])
          if (!entry.sources.every((source) => floating(source.node))) shifts.push(entry.value);
      }).observe({ type: 'layout-shift' });
    }
    return shifts;
  });

describe('VideoGenX quality guide widgets', () => {
  for (const width of [390, 1280]) {
    it(`never move the page while hovering clips or switching scores at ${width}px`, () => {
      cy.viewport(width, 900);
      cy.mount(
        <div>
          <Widgets locale="en" />
          <Widgets locale="zh" />
        </div>,
      );
      cy.get('[data-testid="video-quality-guide-psnr-unavailable"]').should('have.length', 2);
      recordShifts().then((shifts) =>
        positions('[data-marker]').then((before) => {
          cy.get('[data-testid="video-quality-guide-psnr-dot"]').each(($dot) => {
            // Cypress hit-tests the <g> against its own SVG; the event itself is what React sees.
            cy.wrap($dot).trigger('pointerover', { force: true, pointerType: 'mouse' });
          });
          // The last dot hovered is H100's candle-light in the zh copy; B200's twin is listed too.
          cy.get('[data-testid="video-quality-guide-psnr-tooltip"]')
            .last()
            .should('contain', 'candle-light')
            .and('contain', 'B200')
            .and('contain', '27.40 dB')
            .and('contain', 'H100')
            .and('contain', '27.90 dB');
          cy.get('[data-testid="video-widget-tradeoff"]').each(($widget) => {
            for (const metric of ['SSIM', 'LPIPS', 'PSNR']) {
              cy.wrap($widget).contains('[role="radio"]', metric).click();
              cy.wrap($widget)
                .find('[data-testid="video-quality-guide-tradeoff-x-title"] span:not(.invisible)')
                .should('contain', metric);
            }
            cy.wrap($widget)
              .find('[data-testid="video-quality-guide-tradeoff-mark"]')
              .each(($mark) => cy.wrap($mark).click({ force: true }));
          });
          positions('[data-marker]').should('deep.equal', before);
          cy.then(() => expect(shifts, 'layout shifts').to.deep.equal([]));
        }),
      );
    });
  }
});
