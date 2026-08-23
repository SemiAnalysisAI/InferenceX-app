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

  it('exposes MP4 export in the chart export menu', () => {
    cy.get('[data-testid="chart-figure"]')
      .first()
      .within(() => {
        cy.get('[data-testid="export-button"]').click();
      });
    cy.get('[data-testid="export-mp4-button"]').should('be.visible');
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

  it('exposes scrubber + play/pause + speed controls when history is available', () => {
    // Wait for history to resolve into either the controls UI or the empty-state message.
    cy.get('[data-testid="replay-panel-chart-0"]').should(($panel) => {
      const hasControls = $panel.find('[data-testid="replay-play-pause"]').length > 0;
      const hasEmpty = /Not enough history/u.test($panel.text());
      expect(hasControls || hasEmpty).to.equal(true);
    });

    cy.get('[data-testid="replay-panel-chart-0"]').then(($panel) => {
      if ($panel.find('[data-testid="replay-play-pause"]').length === 0) {
        cy.log('Replay history fixture has < 2 dates; skipping interactive checks');
        return;
      }
      cy.get('[data-testid="replay-scrubber"]').should('exist');
      // The speed trigger is always present; individual SelectItems are only
      // mounted in the Radix portal while the dropdown is open.
      cy.get('[data-testid="replay-speed-select"]').should('exist');
      cy.get('[data-testid="replay-export-mp4"]').should('exist');

      // Play, then pause, and confirm the button toggles label.
      cy.get('[data-testid="replay-play-pause"]').click().should('contain.text', 'Pause');
      cy.get('[data-testid="replay-play-pause"]').click().should('contain.text', 'Play');
    });
  });

  it('advances the date overlay and scrubber when Play is pressed', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-play-pause"]').length === 0) {
        cy.log('Replay history fixture has < 2 dates; skipping animation check');
        return;
      }
      cy.get('[data-testid="replay-scrubber"]')
        .invoke('val')
        .then((startVal) => {
          cy.get('[data-testid="replay-date-overlay"]')
            .invoke('text')
            .then((startDate) => {
              cy.get('[data-testid="replay-play-pause"]').click();
              cy.get('[data-testid="replay-scrubber"]')
                .should(($scrubber) => {
                  expect(Number(($scrubber[0] as HTMLInputElement).value)).to.be.greaterThan(
                    Number(startVal),
                  );
                })
                .then(() => cy.get('[data-testid="replay-play-pause"]').click());
              cy.get('[data-testid="replay-date-overlay"]')
                .invoke('text')
                .should((endDate) => {
                  expect(endDate).not.to.equal(startDate);
                });
            });
        });
    });
  });

  it('re-renders the replay frame when a parent-chart toggle changes', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-panel-chart-0"]').length === 0) return;
      // The log-scale switch lives in the collapsed-by-default Advanced drawer,
      // so expand it on the parent chart's legend (not the replay panel's).
      cy.get('[data-testid="legend-advanced-toggle"]').then(($toggles) => {
        const parentAdvanced = [...$toggles].find(
          (toggle) => !toggle.closest('[data-testid^="replay-panel-chart-"]'),
        );
        if (!parentAdvanced) throw new Error('Parent chart Advanced toggle is missing');
        if (parentAdvanced.getAttribute('aria-expanded') !== 'true') {
          cy.wrap(parentAdvanced).click({ force: true });
        }
      });
      // Capture the SVG path data for the first roofline as a stable signature.
      cy.get('[data-testid="replay-panel-chart-0"] svg path.roofline-path')
        .first()
        .invoke('attr', 'd')
        .then((beforeD) => {
          // Toggle the control on the parent chart rather than mutating the address
          // bar. Dashboard URL state is intentionally snapshotted on load, so a
          // synthetic popstate is not a supported control update.
          cy.get('[data-testid="scatter-log-scale"]').then(($toggles) => {
            const parentToggle = [...$toggles].find(
              (toggle) => !toggle.closest('[data-testid^="replay-panel-chart-"]'),
            );
            if (!parentToggle) throw new Error('Parent chart log-scale toggle is missing');
            cy.wrap(parentToggle).click({ force: true });
          });
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

  it('closes the modal', () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="replay-panel-chart-0"]').length === 0) return;
      // Radix Dialog closes on Escape — more robust than picking the X by DOM
      // order now that the panel contains its own buttons (Play, Reset, …).
      cy.get('body').type('{esc}');
      cy.get('[data-testid="replay-panel-chart-0"]').should('not.exist');
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
      cy.intercept('GET', '/api/v1/benchmarks/history*', (request) => {
        attempts += 1;
        request.reply(
          attempts <= 2 ? { statusCode: 500, body: {} } : { statusCode: 200, body: history },
        );
      });
      visitChineseReplay();
      cy.get('[data-testid="replay-history-query-error"]')
        .should('contain.text', '基准测试历史加载失败。')
        .and('contain.text', '重试');
      cy.get('[data-testid="replay-history-query-error"]').contains('重试').click();
      cy.get('[data-testid="replay-history-query-error"]').should('not.exist');
      cy.get('[data-testid="replay-play-pause"]').should('be.visible');
      cy.then(() => expect(attempts).to.equal(3));
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
