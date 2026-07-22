// Focused smoke coverage for /overview. In fixtures mode the page is served by
// the synthetic cypress/fixtures/api/overview-rows.json through the real data
// builder, so every expected value below was derived by running the assembler
// over that fixture (the drift guard in overview-data.test.ts locks the same
// values) — never eyeballed. The fixture exercises every 8.7 state: coverage-driven
// primary precision, ranked vs coverage secondary, all not-ranked reasons, and —
// uniquely — a cross-day evidence range the live dataset does not produce.

const MODEL_LABELS = [
  'DeepSeek V4 Pro 1.6T',
  'Kimi K2.5/2.6/2.7-Code 1T',
  'MiniMax M3 428B',
  'GLM5.2',
  'Qwen3.5 397B',
];

/** The page must never scroll sideways: the whole comparison has to fit. */
function expectNoHorizontalOverflow() {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth).to.be.lte(doc.documentElement.clientWidth);
  });
}

/**
 * A narrow document is not enough: a table parked in an `overflow-x` region
 * keeps the document narrow while still scrolling sideways, so nothing inside
 * the surface may be wider than its own box either. `sr-only` clips (1px) and
 * non-replaced inline boxes are exempt — CSSOM reports a spurious `scrollWidth`
 * for inline boxes in Firefox, and `overflow` cannot apply to them anyway.
 */
function expectNoHorizontalScroller(testId: string) {
  cy.get(`[data-testid="${testId}"]`).then(([surface]) => {
    const scrollers = [surface, ...surface.querySelectorAll('*')]
      .filter(
        (el) =>
          !el.classList.contains('sr-only') &&
          getComputedStyle(el).display !== 'inline' &&
          el.scrollWidth > el.clientWidth + 1,
      )
      .map((el) => `${el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
    expect(scrollers, `horizontally scrollable inside ${testId}`).to.deep.equal([]);
  });
}

function desktopModel(model: string) {
  return cy.get(`[data-testid="overview-desktop-model"][data-model="${model}"]`);
}

describe('Overview page', () => {
  it('summarizes every active model without interactive widgets', () => {
    cy.viewport(1280, 800);
    cy.visit('/overview');

    cy.contains('h1', 'AI Inference Overview').should('exist');
    cy.get('[data-testid="overview-desktop-matrix"]').should('be.visible');
    cy.get('[data-testid="overview-desktop-matrix"] h2').should('have.length', MODEL_LABELS.length);
    for (const label of MODEL_LABELS) {
      cy.get('[data-testid="overview-desktop-matrix"]').should('contain.text', label);
    }
    // Database-wide freshness line + the methodology footnote's once-per-page note.
    cy.contains('Database snapshot through Jul 18').should('exist');
    cy.contains(
      'The default precision maximizes comparable hardware coverage. Not ranked does not mean slower.',
    ).should('exist');
    // A one-glance summary, not an interactive widget.
    cy.get('[data-testid="overview-desktop-matrix"]').within(() => {
      cy.get('details, summary, button').should('not.exist');
    });
  });

  it('ranks the primary precision, dates each read, and accounts for every hardware', () => {
    cy.viewport(1280, 800);
    cy.visit('/overview');

    desktopModel('DeepSeek-V4-Pro').within(() => {
      // Primary precision, its leader, and the runner-up's own signed delta (ASCII minus).
      cy.contains('FP4 · PRIMARY @50').should('exist');
      cy.contains('B300').should('exist');
      cy.contains('1,122').should('exist');
      cy.contains('Leader').should('exist');
      cy.contains('-20%').should('exist');
      // FP8 measured one platform → one compact coverage line, not a second table.
      cy.contains('FP8 coverage: GB200 NVL72 measured; insufficient comparable results.').should(
        'exist',
      );
      // Leader @50 is bracketed by two run days (en-dash range); same-day reads and
      // the @100 read (its own leader) collapse to a single date.
      cy.contains('Jun 24–Jul 4').should('exist');
      cy.contains('Jul 18').should('exist');
      cy.contains('381').should('exist');
      cy.contains('Only exact result').should('exist');
      // Every remaining hardware carries one reason, both clamp directions included.
      cy.contains('cannot reach @50').should('exist');
      cy.contains('no exact @50 result').should('exist');
      cy.contains('no 8K/1K data').should('exist');
      cy.contains('standard decode only').should('exist');
      // Each ranked value links into its own pre-filtered dashboard view.
      cy.get('a[href*="i_gpus="]')
        .first()
        .should('have.attr', 'href')
        .and('include', 'g_model=DeepSeek-V4-Pro')
        .and('include', 'i_gpus=b300_sglang_mtp')
        .and('include', 'i_spec=mtp');
    });
  });

  it('opens a ranked secondary only when the other precision adds comparable hardware', () => {
    cy.viewport(1280, 800);
    cy.visit('/overview');

    // Qwen: FP8 ranks a comparable pair AND adds MI355X, so it renders subordinate rows.
    desktopModel('Qwen-3.5-397B-A17B').within(() => {
      cy.contains('FP4 · PRIMARY @50').should('exist');
      cy.contains('FP8 @50').should('exist');
      cy.contains('MI355X').should('exist');
      cy.contains('760').should('exist');
      cy.contains('-16%').should('exist');
    });
    // MiniMax: wider exact-@50 FP8 coverage flips the primary precision to FP8;
    // FP4 falls back to a single-hardware coverage line.
    desktopModel('MiniMax-M3').within(() => {
      cy.contains('FP8 · PRIMARY @50').should('exist');
      cy.contains('FP4 coverage: H200 measured; insufficient comparable results.').should('exist');
    });
  });

  it('stacks on a 390px phone with no sideways scroll', () => {
    cy.viewport(390, 844);
    cy.visit('/overview');

    cy.get('[data-testid="overview-mobile-list"]').should('be.visible');
    cy.get('[data-testid="overview-desktop-matrix"]').should('not.be.visible');
    cy.get('[data-testid="overview-mobile-list"]').within(() => {
      cy.get('details, summary, button').should('not.exist');
    });
    expectNoHorizontalOverflow();
    expectNoHorizontalScroller('overview-mobile-list');
  });

  it('renders the Chinese sibling with the same hierarchy and the per-GPU unit', () => {
    cy.viewport(1280, 800);
    cy.visit('/zh/overview');

    cy.contains('h1', 'AI 推理总览').should('exist');
    cy.contains('输出 tok/s/GPU').should('exist');
    desktopModel('DeepSeek-V4-Pro').within(() => {
      cy.contains('FP4 · 主排名 @50').should('exist');
    });
    cy.contains('默认精度优先覆盖更多可比较硬件。未参与排名不代表性能更低。').should('exist');
  });
});
