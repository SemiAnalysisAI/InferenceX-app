import { expandLegendAdvanced } from '../support/legend-advanced';

const openReplayDialog = () => {
  cy.get('[data-testid="chart-figure"]')
    .first()
    .within(() => {
      cy.get('[data-testid="export-button"]').click();
    });
  cy.get('[data-testid="export-mp4-button"]').first().click();
};

const setReplayScrubber = (v: number) =>
  cy.get('[data-testid="replay-scrubber"]').then(($el) => {
    const el = $el[0] as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

const replayAxisExtent = () =>
  cy.get('[data-testid="replay-panel-chart-0"] svg').then(($svg) => replayAxisExtentFrom($svg[0]));

const replayAxisExtentFrom = (svg: Element) => {
  const lastTick = (selector: string) => {
    const elements = [...svg.querySelectorAll(selector)];
    return elements.length > 0 ? (elements.at(-1)!.textContent ?? '').trim() : '';
  };
  return `${lastTick('g.x-axis text')}|${lastTick('g.y-axis text')}`;
};

const visitChineseReplay = (query = '') => {
  cy.viewport(390, 900);
  cy.visit(`/zh/inference?g_model=DeepSeek-R1-0528${query}`, {
    onBeforeLoad(win) {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    },
  });
  openReplayDialog();
};

describe('Inference Replay', () => {
  before(() => {
    cy.window().then((win) => {
      win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
    });
    cy.visit('/inference');
    cy.get('[data-testid="inference-chart-display"]').should('exist');
  });

  it('opens the replay preview modal from the MP4 menu item', () => {
    openReplayDialog();
    cy.get('[data-testid="replay-dialog-chart-0"]').should('be.visible');
    cy.get('[data-testid="replay-panel-chart-0"]').should('exist');
    cy.get('[data-testid="replay-panel-chart-0"]').then(($panel) => {
      const text = $panel.text();
      const hasControls = $panel.find('[data-testid="replay-play-pause"]').length > 0;
      const hasMessage = /Loading benchmark history|Not enough history/u.test(text) || hasControls;
      expect(hasMessage).to.equal(true);
    });
  });

  it('advances the date overlay and scrubber when Play is pressed', () => {
    cy.get('[data-testid="replay-play-pause"]').scrollIntoView().should('be.visible');
    cy.get('[data-testid="replay-reset"]').click();
    cy.get('[data-testid="replay-scrubber"]').should('have.value', '0');
    cy.get('[data-testid="replay-date-overlay"]')
      .invoke('text')
      .then((startDate) => {
        cy.get('[data-testid="replay-play-pause"]').click();
        cy.get('[data-testid="replay-scrubber"]')
          .invoke({ timeout: 10_000 }, 'val')
          .should((endVal) => {
            expect(Number(endVal)).to.be.greaterThan(0);
          });
        cy.get('[data-testid="replay-date-overlay"]')
          .invoke({ timeout: 10_000 }, 'text')
          .should((endDate) => {
            expect(endDate).not.to.equal(startDate);
          });
        cy.get('[data-testid="replay-reset"]').click();
        cy.get('[data-testid="replay-scrubber"]').should('have.value', '0');
      });
  });

  it('re-renders the replay frame when a parent-chart toggle changes', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-panel-chart-0"]').length === 0) return;
      setReplayScrubber(1_000_000);
      cy.get('[data-testid="replay-scrubber"]').should('have.value', '1000');
      cy.get('[data-testid="replay-panel-chart-0"] svg path.roofline-path')
        .first()
        .invoke('attr', 'd')
        .then((beforeD) => {
          cy.get('body').type('{esc}');
          cy.get('[data-testid="replay-panel-chart-0"]').should('not.exist');
          cy.get('[data-testid="chart-figure"]')
            .first()
            .within(() => {
              cy.get('[data-testid="legend-advanced-toggle"]').then(($toggle) => {
                if ($toggle.attr('aria-expanded') !== 'true') cy.wrap($toggle).click();
              });
              cy.get('[data-testid="scatter-log-scale"]').click();
            });
          openReplayDialog();
          setReplayScrubber(1_000_000);
          cy.get('[data-testid="replay-scrubber"]').should('have.value', '1000');
          cy.get('[data-testid="replay-panel-chart-0"] svg path.roofline-path')
            .first()
            .invoke('attr', 'd')
            .should((afterD) => {
              expect(afterD).not.to.equal(beforeD);
            });
        });
    });
  });

  it('renders line labels in the foreground during replay', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-panel-chart-0"]').length === 0) return;
      cy.get('[data-testid="replay-panel-chart-0"]').within(() => {
        expandLegendAdvanced();
        cy.get('[data-testid="scatter-line-labels"]').then(($el) => {
          if ($el.attr('data-state') !== 'checked') cy.wrap($el).click();
        });
      });
      cy.get('[data-testid="replay-panel-chart-0"] svg g.line-label').should(
        'have.length.greaterThan',
        0,
      );
      cy.get('[data-testid="replay-panel-chart-0"] svg').then(($svg) => {
        const svg = $svg[0];
        const dots = svg.querySelectorAll('.dot-group');
        const labels = svg.querySelectorAll('g.line-label');
        if (dots.length === 0 || labels.length === 0) return;
        const lastDot = dots.item(dots.length - 1)!;
        const firstLabel = labels.item(0)!;
        expect(
          lastDot.compareDocumentPosition(firstLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
          'replay line label follows the scatter points (foreground)',
        ).to.be.greaterThan(0);
      });
    });
  });

  it('Fixed axes stay constant across frames; toggling off refits per frame', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-scrubber"]').length === 0) {
        cy.log('Replay history fixture has < 2 dates; skipping fixed-axes check');
        return;
      }
      cy.get('[data-testid="replay-fixed-axes"]').should('have.attr', 'data-state', 'checked');
      setReplayScrubber(0);
      cy.get('[data-testid="replay-scrubber"]').should('have.value', '0');
      replayAxisExtent().then((fixedAtStart) => {
        setReplayScrubber(1_000_000);
        cy.get('[data-testid="replay-scrubber"]').should('have.value', '1000');
        cy.get('[data-testid="replay-panel-chart-0"] svg').should(($svg) => {
          expect(
            replayAxisExtentFrom($svg[0]),
            'fixed axes are identical at the first and last frame',
          ).to.equal(fixedAtStart);
        });

        cy.get('[data-testid="replay-fixed-axes"]').click();
        setReplayScrubber(0);
        cy.get('[data-testid="replay-scrubber"]').should('have.value', '0');
        cy.get('[data-testid="replay-panel-chart-0"] svg')
          .should(($svg) => {
            expect(
              replayAxisExtentFrom($svg[0]),
              'per-frame axes at the first frame differ from the whole-run fixed extent',
            ).not.to.equal(fixedAtStart);
          })
          .then(() => cy.get('[data-testid="replay-fixed-axes"]').click());
      });
    });
  });
});

describe('Inference Replay — Simplified Chinese', () => {
  it('waits for fixture history and exercises every localized replay control', () => {
    cy.fixture('api/benchmarks-history.json').then((history) => {
      cy.intercept('GET', '/api/v1/benchmarks/history*', { body: history }).as('zhReplayHistory');
      visitChineseReplay();
      cy.wait('@zhReplayHistory');

      cy.get('[data-testid="replay-panel-chart-0"]')
        .should('contain.text', '按时间回放')
        .and('not.contain.text', '正在加载基准测试历史');
      cy.get('[data-testid="replay-play-pause"]')
        .should('have.attr', 'aria-label', '播放回放')
        .and('contain.text', '播放');
      cy.get('[data-testid="replay-reset"]').should('have.attr', 'aria-label', '重置到起点');
      cy.get('[data-testid="replay-scrubber"]').should('have.attr', 'aria-label', '回放时间线');
      cy.get('[data-testid="replay-fixed-axes"]').should('have.attr', 'data-state', 'checked');

      cy.get('[data-testid="replay-scrubber"]')
        .invoke('val')
        .then((startValue) => {
          cy.get('[data-testid="replay-play-pause"]').click();
          cy.get('[data-testid="replay-scrubber"]').should(($scrubber) => {
            expect(Number(($scrubber[0] as HTMLInputElement).value)).to.be.greaterThan(
              Number(startValue),
            );
          });
          cy.get('[data-testid="replay-play-pause"]')
            .should('have.attr', 'aria-label', '暂停回放')
            .click();
        });

      cy.get('[data-testid="replay-reset"]').click();
      cy.get('[data-testid="replay-scrubber"]').should('have.value', '0');
      setReplayScrubber(1000);
      cy.get('[data-testid="replay-scrubber"]')
        .should('have.value', '1000')
        .and('have.attr', 'aria-valuetext')
        .and('match', /年/u);

      cy.get('[data-testid="replay-fixed-axes"]')
        .click()
        .should('have.attr', 'data-state', 'unchecked')
        .click()
        .should('have.attr', 'data-state', 'checked');
    });
  });

  it('shows an error, retries after analytics, and then renders controls', () => {
    cy.fixture('api/benchmarks-history.json').then((history) => {
      let attempts = 0;
      let failHistory = true;
      let attemptsBeforeRetry = 0;
      cy.intercept('GET', '/api/v1/benchmarks/history*', (request) => {
        attempts += 1;
        request.reply(
          failHistory ? { statusCode: 500, body: {} } : { statusCode: 200, body: history },
        );
      });
      visitChineseReplay();
      cy.get('[data-testid="replay-history-query-error"]')
        .should('contain.text', '基准测试历史加载失败。')
        .and('contain.text', '重试');
      cy.then(() => {
        attemptsBeforeRetry = attempts;
        failHistory = false;
      });
      cy.get('[data-testid="replay-history-query-error"]').contains('button', '重试').click();
      cy.get('[data-testid="replay-history-query-error"]').should('not.exist');
      cy.get('[data-testid="replay-play-pause"]').scrollIntoView().should('be.visible');
      cy.then(() => expect(attempts).to.be.greaterThan(attemptsBeforeRetry));
    });
  });

  it('renders the insufficient-history state only after a successful response', () => {
    cy.fixture<unknown[]>('api/benchmarks-history.json').then((history) => {
      const firstDate = (history[0] as { date: string }).date;
      const oneDate = history.filter((row) => (row as { date: string }).date === firstDate);
      cy.intercept('GET', '/api/v1/benchmarks/history*', { statusCode: 200, body: oneDate });
      // Pin FP8: the default now selects every precision, and DeepSeek R1's
      // bundled supplemental FP4 history rows would add later replay dates.
      visitChineseReplay('&i_prec=fp8');
      cy.contains('历史数据不足，暂时无法回放该图表——至少需要两个不同的基准测试日期。').should(
        'be.visible',
      );
      cy.get('[data-testid="replay-play-pause"]').should('not.exist');
      cy.get('[data-testid="replay-history-query-error"]').should('not.exist');
    });
  });
});
