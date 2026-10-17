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

// Combined "<last-x-tick>|<last-y-tick>" signature so a change in EITHER axis is
// detected. The run can grow in x, y, or both between frames, so asserting on
// the y-axis alone would falsely fail when only x expands.
const replayAxisExtent = () =>
  cy.get('[data-testid="replay-panel-chart-0"] svg').then(($svg) => replayAxisExtentFrom($svg[0]));

const replayAxisExtentFrom = (svg: Element) => {
  const lastTick = (selector: string) => {
    const elements = [...svg.querySelectorAll(selector)];
    return elements.length > 0 ? (elements.at(-1)!.textContent ?? '').trim() : '';
  };
  return `${lastTick('g.x-axis text')}|${lastTick('g.y-axis text')}`;
};

const visitChineseReplay = () => {
  cy.viewport(390, 900);
  cy.visit('/zh/inference?g_model=DeepSeek-R1-0528', {
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
    // Assert the dialog itself is visible. ChartDisplay now opens the launcher
    // via an imperative ref; the optional-chain `?.open()` would silently
    // no-op if the ref ever failed to attach, so this guards against that.
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
    // The committed fixture has multiple dates; loading cannot count as a pass.
    cy.get('[data-testid="replay-play-pause"]').scrollIntoView().should('be.visible');
    // Rewind first: earlier tests in this file (and failed retry attempts —
    // testIsolation is off) leave the playhead wherever they stopped, and a
    // playhead at the end would turn Play into a restart-from-zero whose
    // scrubber value can never exceed the recorded start.
    cy.get('[data-testid="replay-reset"]').click();
    cy.get('[data-testid="replay-scrubber"]').should('have.value', '0');
    cy.get('[data-testid="replay-date-overlay"]')
      .invoke('text')
      .then((startDate) => {
        cy.get('[data-testid="replay-play-pause"]').click();
        // Poll both signals BEFORE pausing, each with headroom for the
        // slowest path. Scrubber: reduced motion (the chromium e2e launch
        // flag) steps discretely at 1.2s per date, so any fixed wait
        // shorter than one step fails deterministically. Date overlay: the
        // continuous path (Firefox has no reduced-motion flag) commits
        // scrubber ticks every few ms but only flips the label when the
        // eased playhead crosses a whole segment — pausing as soon as the
        // scrubber moves would freeze the label on the first date forever.
        // The timeout must ride on .invoke: a cy.get timeout does not
        // extend the retries of chained queries.
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
        // Park paused at the origin so later tests start from a known frame.
        cy.get('[data-testid="replay-reset"]').click();
        cy.get('[data-testid="replay-scrubber"]').should('have.value', '0');
      });
  });

  it('seeks observed snapshots on an export-visible calendar rail and restarts', () => {
    cy.get('[data-testid="replay-date-timeline"]')
      .should('be.visible')
      .and(($rail) => {
        expect($rail.closest('.no-export')).to.have.length(0);
      });
    cy.get('[data-testid="replay-snapshot-select"] option:not([disabled])').then(($options) => {
      const dates = [...$options].map((option) => (option as HTMLOptionElement).value);
      expect(dates.length).to.be.greaterThan(1);
      const first = dates[0];
      const last = dates.at(-1)!;
      cy.get('[data-testid="replay-snapshot-select"]').select(last);
      cy.get('[data-testid="replay-date-overlay"]').should('have.text', last);
      cy.get('[data-testid="replay-scrubber"]').should('have.value', '1000');
      cy.get('[data-testid="replay-date-playhead"]')
        .should('have.attr', 'style')
        .and('contain', '100%');
      cy.get('[data-testid="replay-date-tick"]').each(($tick, i) => {
        const expected =
          ((Date.parse(dates[i]) - Date.parse(first)) / (Date.parse(last) - Date.parse(first))) *
          100;
        expect(parseFloat(($tick[0] as HTMLElement).style.left)).to.be.closeTo(expected, 0.001);
      });
      cy.get('[data-testid="replay-scrubber"]').focus().type('{home}');
      cy.get('[data-testid="replay-date-overlay"]').should('have.text', first);
      cy.get('[data-testid="replay-scrubber"]').type('{rightarrow}');
      cy.get('[data-testid="replay-date-overlay"]').should('have.text', dates[1]);
      cy.get('[data-testid="replay-reset"]').click();
      cy.get('[data-testid="replay-snapshot-select"]').should('have.value', first);
      cy.get('[data-testid="replay-snapshot-status"]').should('contain.text', 'Observed');
      // Between snapshots the select offers an explicit placeholder, so choosing
      // the lower snapshot still emits change and seeks instead of doing nothing.
      setReplayScrubber(1);
      cy.get('[data-testid="replay-snapshot-select"]')
        .should(($select) => {
          expect(($select[0] as HTMLSelectElement).value).to.equal('');
        })
        .select(first);
      cy.get('[data-testid="replay-scrubber"]').should('have.value', '0');
      cy.viewport(375, 900);
      cy.get('[data-testid="replay-panel-chart-0"]').should(($panel) => {
        const dialog = $panel[0].closest('[role="dialog"]')!.getBoundingClientRect();
        const panel = $panel[0].getBoundingClientRect();
        const rail = $panel[0]
          .querySelector('[data-testid="replay-date-timeline"]')!
          .getBoundingClientRect();
        expect(panel.width).to.be.at.most(dialog.width);
        expect(rail.right).to.be.at.most(dialog.right);
      });
      cy.get('[data-testid="replay-date-timeline"]').then(($rail) => {
        const snapshotHeight = $rail[0].getBoundingClientRect().height;
        setReplayScrubber(1);
        cy.get('[data-testid="replay-date-timeline"]').should(($transitionRail) => {
          expect($transitionRail[0].getBoundingClientRect().height).to.equal(snapshotHeight);
        });
      });
      cy.viewport(1280, 720);
      cy.get('[data-testid="replay-date-timeline"]').should(($rail) => {
        expect($rail[0].getBoundingClientRect().width).to.be.greaterThan(375);
      });
      cy.get('[data-testid="replay-reset"]').click();
    });
  });

  it('re-renders the replay frame when a parent-chart toggle changes', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-panel-chart-0"]').length === 0) return;
      // Rooflines only draw once a hw/precision group has >1 visible point,
      // so move off frame 0 — the earliest date can render a single point.
      setReplayScrubber(1_000_000); // clamps to the scrubber max → last frame
      cy.get('[data-testid="replay-scrubber"]').should('have.value', '1000');
      // Capture the SVG path data for the first roofline as a stable signature.
      cy.get('[data-testid="replay-panel-chart-0"] svg path.roofline-path')
        .first()
        .invoke('attr', 'd')
        .then((beforeD) => {
          // The parent chart's controls sit behind the dialog, and any outside
          // interaction closes it — so close, toggle log scale on the parent,
          // and reopen instead of force-clicking through the overlay.
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
      // Enable line labels inside the replay panel (scoped — the parent chart
      // renders the same control behind the dialog).
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
      // The shared-renderer foreground raise must apply to the replay chart too.
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
      // Fixed axes is the default — the extent is the whole-run box, so the first
      // and last frame share the same axes (this is the feature's core invariant,
      // independent of which axis the frontier grows along).
      cy.get('[data-testid="replay-fixed-axes"]').should('have.attr', 'data-state', 'checked');
      setReplayScrubber(0);
      cy.get('[data-testid="replay-scrubber"]').should('have.value', '0');
      replayAxisExtent().then((fixedAtStart) => {
        setReplayScrubber(1_000_000); // clamps to the scrubber max → last frame
        cy.get('[data-testid="replay-scrubber"]').should('have.value', '1000');
        cy.get('[data-testid="replay-panel-chart-0"] svg').should(($svg) => {
          expect(
            replayAxisExtentFrom($svg[0]),
            'fixed axes are identical at the first and last frame',
          ).to.equal(fixedAtStart);
        });

        // Turn fixed axes off → the first frame refits to just that frame's
        // (smaller) frontier, so the extent differs from the whole-run box in
        // at least one axis (compared as an x|y pair, not y alone).
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
      // The dialog scrolls internally at 390px — the controls row can sit
      // below the fold, so bring it into view before asserting visibility.
      cy.get('[data-testid="replay-play-pause"]').scrollIntoView().should('be.visible');
      cy.then(() => expect(attempts).to.be.greaterThan(attemptsBeforeRetry));
    });
  });

  it('renders the insufficient-history state only after a successful response', () => {
    cy.fixture<unknown[]>('api/benchmarks-history.json').then((history) => {
      const firstDate = (history[0] as { date: string }).date;
      const oneDate = history.filter((row) => (row as { date: string }).date === firstDate);
      cy.intercept('GET', '/api/v1/benchmarks/history*', { statusCode: 200, body: oneDate });
      visitChineseReplay();
      cy.contains('历史数据不足，暂时无法回放该图表——至少需要两个不同的基准测试日期。').should(
        'be.visible',
      );
      cy.get('[data-testid="replay-play-pause"]').should('not.exist');
      cy.get('[data-testid="replay-history-query-error"]').should('not.exist');
    });
  });
});
