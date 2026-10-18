import {
  MODEL_SELECTION_DB_KEYS,
  modelSelectionAvailability,
  modelSelectionBenchmarks,
} from '../support/model-selection-fixtures';

/**
 * Per-model SEO routes: /historical/<model> and /calculator/<model> (and
 * their /zh siblings) render the tab seeded to the routed model. Switching
 * models on the page rewrites the pathname in place via history.replaceState
 * — no full page reload and no App Router remount.
 */
const visitOptions = {
  onBeforeLoad(win: Cypress.AUTWindow) {
    win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
  },
};

type MarkerWindow = Cypress.AUTWindow & { __modelRouteNoReloadMarker?: boolean };

const unlockPointerEvents = () => {
  cy.document().then((doc) => {
    delete doc.body.dataset.scrollLocked;
    doc.body.style.removeProperty('pointer-events');
  });
};

describe('Per-model dashboard routes', () => {
  it('seeds /historical/<slug> to the routed model and rewrites the URL on switch without a reload', () => {
    cy.visit('/historical/minimax-m3', visitOptions);
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
    cy.get('[data-testid="model-selector"]').should('contain.text', 'MiniMax');

    // A full page load (or App Router remount via hard navigation) would wipe
    // this marker; the in-place history.replaceState rewrite must keep it.
    cy.window().then((win) => {
      (win as MarkerWindow).__modelRouteNoReloadMarker = true;
    });
    unlockPointerEvents();
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[role="option"]').not('[aria-selected="true"]').first().click();

    cy.location('pathname').should('not.eq', '/historical/minimax-m3');
    cy.location('pathname').should('match', /^\/historical\/[a-z0-9-]+$/u);
    cy.window().its('__modelRouteNoReloadMarker').should('eq', true);
  });

  it('moves from the bare tab path to a slugged path when a non-default model is chosen', () => {
    cy.visit('/historical', visitOptions);
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
    unlockPointerEvents();
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[role="option"]').not('[aria-selected="true"]').first().click();
    cy.location('pathname').should('match', /^\/historical\/[a-z0-9-]+$/u);
  });

  it('redirects alias slugs to the canonical model slug, keeping share-link params', () => {
    cy.visit('/calculator/kimi?i_seq=8k%2F1k', visitOptions);
    cy.location('pathname').should('eq', '/calculator/kimi-k26');
    cy.location('search').should('contain', 'i_seq=8k%2F1k');
  });

  it('language toggle follows the in-place rewritten per-model path', () => {
    cy.visit('/historical/minimax-m3', visitOptions);
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
    unlockPointerEvents();
    cy.get('[data-testid="model-selector"]').click();
    cy.get('[role="option"]').not('[aria-selected="true"]').first().click();
    cy.location('pathname')
      .should('match', /^\/historical\/[a-z0-9-]+$/u)
      .then((rewritten) => {
        cy.get('[data-testid="language-toggle"]').click();
        cy.location('pathname').should('eq', `/zh${rewritten}`);
      });
  });

  it('returns 404 for unknown model slugs', () => {
    cy.request({ url: '/historical/not-a-model', failOnStatusCode: false })
      .its('status')
      .should('eq', 404);
  });

  it('renders the /zh sibling with a model-specific Chinese intro', () => {
    cy.visit('/zh/historical/minimax-m3', visitOptions);
    cy.get('[data-testid="zh-tab-intro"]').should('be.visible').and('contain.text', 'MiniMax M3');
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
  });
});

const checked = '[data-testid="chart-legend"] ul input[type="checkbox"]:checked';
const FLASH = 'DeepSeek V4.1 Flash 552B';
const PRO = 'DeepSeek V4 Pro 0813 1.6T';

function expectSelection(ids: string[]) {
  cy.get(checked).should(($inputs) => {
    expect([...$inputs].map((input) => input.id).toSorted()).to.deep.equal(ids.toSorted());
  });
}

function selectModel(label: string) {
  cy.get('[data-testid="model-selector"]').click();
  cy.contains('[role="option"]', label).click();
  cy.get('[data-testid="model-selector"]').should('contain.text', label);
}

function expectBestPerSku(enabled: boolean) {
  cy.get('[data-testid="scatter-quick-filters"]').click();
  cy.get('[data-testid="quick-filter-best-per-sku"]').should(
    'have.attr',
    'data-state',
    enabled ? 'checked' : 'unchecked',
  );
  cy.contains('button', 'Done').click();
}

function visitModel(model: string, extra = '', path = '/inference') {
  cy.intercept('GET', '/api/v1/availability', { body: modelSelectionAvailability });
  cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
    const requested = new URL(request.url).searchParams.get('model') ?? '';
    request.reply({
      delay: 150,
      body: modelSelectionBenchmarks.filter(
        (row) => row.model === (MODEL_SELECTION_DB_KEYS[requested] ?? requested),
      ),
    });
  });
  cy.visit(
    `${path}?g_model=${model}&i_seq=agentic-traces&i_prec=fp4&i_xmode=interactivity&i_metric=y_tpPerGpu${extra}`,
    {
      onBeforeLoad(win) {
        win.localStorage.setItem('inferencex-star-modal-dismissed', String(Date.now()));
        win.localStorage.removeItem('inferencex-feature-gate');
      },
    },
  );
}

describe('Model-local manual legend selection', () => {
  it('restores destination winners after soloing an engine on another model', () => {
    visitModel('DeepSeek-V4.1-Flash');
    expectSelection(['checkbox-b200_vllm', 'checkbox-gb300_vllm']);

    selectModel(PRO);
    expectSelection(['checkbox-b200_vllm', 'checkbox-gb300_dynamo-sglang']);
    cy.get('label[for="checkbox-gb300_dynamo-sglang"]').click();
    expectSelection(['checkbox-gb300_dynamo-sglang']);
    expectBestPerSku(false);

    selectModel(FLASH);
    expectSelection(['checkbox-b200_vllm', 'checkbox-gb300_vllm']);
    expectBestPerSku(true);
    cy.get('.dot-group[data-hw-key="gb300_vllm"]').should('have.css', 'opacity', '1');
    cy.get('.dot-group[data-hw-key="gb300_dynamo-sglang"]').should('have.css', 'opacity', '0');

    // Returning to the source model must not resurrect its earlier manual mode.
    selectModel(PRO);
    expectSelection(['checkbox-b200_vllm', 'checkbox-gb300_dynamo-sglang']);
    expectBestPerSku(true);
  });

  it('preserves a shared manual selection across axes but not across models', () => {
    visitModel('DeepSeek-V4-Pro', '&i_best=0&i_active=gb300_dynamo-sglang');
    expectSelection(['checkbox-gb300_dynamo-sglang']);
    expectBestPerSku(false);

    cy.get('[data-testid="yaxis-metric-selector"]').click('right', { force: true });
    cy.contains('[data-select-option]', /^Cost per Million Total Tokens$/u).click({ force: true });
    expectSelection(['checkbox-gb300_dynamo-sglang']);
    expectBestPerSku(false);

    // Flash has not loaded yet: the reset must survive an empty-data interval.
    selectModel(FLASH);
    expectSelection(['checkbox-b200_vllm', 'checkbox-gb300_vllm']);
    expectBestPerSku(true);
  });

  for (const path of ['/inference', '/inference/deepseek-v4-pro']) {
    it(`preserves non-default query-model share state on ${path}`, () => {
      visitModel('DeepSeek-V4.1-Flash', '&i_best=0&i_active=gb300_dynamo-sglang', path);
      cy.get('[data-testid="model-selector"]').should('contain.text', FLASH);
      expectSelection(['checkbox-gb300_dynamo-sglang']);
      expectBestPerSku(false);
      selectModel(PRO);
      expectSelection(['checkbox-b200_vllm', 'checkbox-gb300_dynamo-sglang']);
      expectBestPerSku(true);
    });
  }
});
