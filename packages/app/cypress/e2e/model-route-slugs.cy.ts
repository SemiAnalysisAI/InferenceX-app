import {
  MODEL_SELECTION_DB_KEYS,
  modelSelectionAvailability,
  modelSelectionBenchmarks,
} from '../support/model-selection-fixtures';

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

describe('GLM-5.3-Flash registration without published observations', () => {
  for (const locale of ['', '/zh']) {
    for (const width of [1280, 375]) {
      it(`keeps ${locale}/inference/glm-5-3-flash distinct at ${width}px`, () => {
        cy.viewport(width, 900);
        cy.intercept('GET', '/api/v1/availability', { body: [] });
        cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
          if (new URL(request.url).searchParams.get('model') === 'GLM-5.3-Flash') {
            request.alias = 'flashBenchmarks';
          }
          request.reply({ body: [] });
        });
        cy.visit(`${locale}/inference/kimi-k3`, {
          onBeforeLoad(win) {
            visitOptions.onBeforeLoad(win);
            win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1');
          },
        });
        cy.get('[data-testid="model-selector"]').click();
        cy.get('[role="option"]').contains('GLM 5.3 Flash').click();
        cy.wait('@flashBenchmarks');
        cy.get('[data-testid="model-selector"]').should('contain.text', 'GLM 5.3 Flash');
        cy.get('[data-testid="inference-page-heading"]').should('contain.text', 'GLM');
        cy.location('pathname').should('eq', `${locale}/inference/glm-5-3-flash`);
        cy.get('[data-testid="inference-chart"] [data-layer="scatter"] circle').should('not.exist');
        cy.get('[data-testid="model-architecture-link"]').should('not.exist');
        cy.reload();
        cy.get('[data-testid="model-selector"]').should('contain.text', 'GLM 5.3 Flash');
        cy.get('[data-testid="model-architecture-link"]').should('not.exist');
        cy.location('pathname').should('eq', `${locale}/inference/glm-5-3-flash`);
        cy.window().then((win) => {
          win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
          win.dispatchEvent(new win.Event('inferencex:feature-gate:locked'));
        });
        cy.get('[data-testid="model-selector"]').should('not.contain.text', 'GLM 5.3 Flash');
        cy.location('pathname').should('not.contain', 'glm-5-3-flash');
      });
    }
  }

  for (const locale of ['', '/zh']) {
    for (const route of ['/inference/glm-5-3-flash', '/inference?g_model=GLM-5.3-Flash']) {
      it(`requests only Flash from the first unlocked ${locale}${route} render and reload`, () => {
        const requestedModels: (string | null)[] = [];
        cy.intercept('GET', '/api/v1/availability*', { body: [] });
        cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
          const model = new URL(request.url).searchParams.get('model');
          requestedModels.push(model);
          expect(model, 'every benchmark request, including the first').to.eq('GLM-5.3-Flash');
          request.reply({ body: [] });
        }).as('initialFlashBenchmarks');
        // A non-seeded date forces a real client request rather than relying
        // on the latest model route's fresh SSR query data.
        cy.visit(`${locale}${route}${route.includes('?') ? '&' : '?'}g_rundate=2026-10-01`, {
          onBeforeLoad(win) {
            visitOptions.onBeforeLoad(win);
            win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1');
          },
        });
        cy.wait('@initialFlashBenchmarks');
        cy.location('pathname').should('eq', `${locale}/inference/glm-5-3-flash`);
        cy.get('[data-testid="model-selector"]').should('contain.text', 'GLM 5.3 Flash');
        cy.reload();
        cy.wait('@initialFlashBenchmarks');
        cy.get('[data-testid="model-selector"]').should('contain.text', 'GLM 5.3 Flash');
        cy.then(() => {
          expect(requestedModels.length).to.be.at.least(2);
          expect([...new Set(requestedModels)]).to.deep.equal(['GLM-5.3-Flash']);
        });
      });
    }

    it(`does not let an unofficial Flash run unlock ${locale || 'en'} selection`, () => {
      cy.fixture('api/muse-spark-unofficial-run.json').then((run) => {
        cy.intercept('GET', '/api/unofficial-run*', {
          body: {
            ...run,
            benchmarks: run.benchmarks.map((row: Record<string, unknown>) => ({
              ...row,
              model: 'glm5.3flash',
              precision: 'fp8',
              spec_method: 'mtp',
            })),
            evaluations: [],
          },
        }).as('flashOverlay');
      });
      cy.intercept('GET', '/api/v1/availability*', { body: [] });
      cy.intercept('GET', '/api/v1/benchmarks*', { body: [] });
      cy.visit(`${locale}/inference?unofficialrun=38825822770`, {
        onBeforeLoad(win) {
          visitOptions.onBeforeLoad(win);
          win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
        },
      });
      cy.wait('@flashOverlay');
      cy.get('[data-testid="model-selector"]').should('not.contain.text', 'GLM 5.3 Flash');
      cy.window().then((win) => {
        win.localStorage.setItem('inferencex-feature-gate-konami-v1', '1');
        win.dispatchEvent(new win.Event('inferencex:feature-gate:unlocked'));
      });
      cy.get('[data-testid="model-selector"]').should('contain.text', 'GLM 5.3 Flash');
      cy.get('[data-testid="scatter-graph"] .unofficial-overlay-pt').should(
        'have.length.greaterThan',
        0,
      );
    });

    it(`blocks a locked Flash route and saved selection in ${locale || 'en'}`, () => {
      const kimiAvailability = modelSelectionAvailability
        .filter((row) => row.model === 'dsv4-pro')
        .map((row) => ({ ...row, model: 'kimik3' }));
      cy.intercept('GET', '/api/v1/availability*', { body: kimiAvailability });
      cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
        expect(
          new URL(request.url).searchParams.get('model'),
          'first and later locked requests',
        ).to.eq('Kimi-K3');
        request.reply({ body: [] });
      });
      const locked = {
        onBeforeLoad(win: Cypress.AUTWindow) {
          visitOptions.onBeforeLoad(win);
          win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
        },
      };
      cy.visit(`${locale}/inference/glm-5-3-flash`, locked);
      cy.location('pathname').should('eq', `${locale}/inference/kimi-k3`);
      cy.get('[data-testid="model-selector"]').should('contain.text', 'Kimi K3');
      cy.get('[data-testid="model-selector"]').click();
      cy.contains('[role="option"]', 'GLM 5.3 Flash').should('not.exist');
      cy.get('body').type('{esc}');
      cy.visit(`${locale}/inference?g_model=GLM-5.3-Flash`, locked);
      cy.location('pathname').should('eq', `${locale}/inference/kimi-k3`);
      cy.get('[data-testid="model-selector"]').should('not.contain.text', 'GLM 5.3 Flash');
    });
  }
});

describe('Per-model dashboard routes', () => {
  for (const locale of ['', '/zh']) {
    it(`retains an explicit legacy model across ${locale}/evaluation`, () => {
      cy.visit(`${locale}/inference/deepseek-v4`, visitOptions);
      cy.get('[data-testid="model-selector"]').should('contain.text', 'DeepSeek V4 Pro');
      cy.get('[data-testid="tab-trigger-evaluation"]').click();
      cy.location('pathname').should('eq', `${locale}/evaluation`);
      cy.get('[data-testid="tab-trigger-inference"]')
        .should('have.attr', 'href', `${locale}/inference?g_model=DeepSeek-V4-Pro`)
        .click();
      cy.get('[data-testid="model-selector"]').should('contain.text', 'DeepSeek V4 Pro');
    });

    it(`renders Kimi K3 chart data from bare ${locale}/inference`, () => {
      cy.intercept('GET', '/api/v1/availability', {
        body: modelSelectionAvailability
          .filter((row) => row.model === 'dsv4')
          .map((row) => ({ ...row, model: 'kimik3' })),
      });
      cy.intercept('GET', '/api/v1/benchmarks*', (request) => {
        expect(new URL(request.url).searchParams.get('model')).to.eq('Kimi-K3');
        request.reply({
          body: modelSelectionBenchmarks
            .filter((row) => row.model === 'dsv4')
            .map((row) => ({ ...row, model: 'kimik3' })),
        });
      });
      cy.visit(`${locale}/inference`, visitOptions);
      cy.location('pathname').should('eq', `${locale}/inference/kimi-k3`);
      cy.get('[data-testid="model-selector"]').should('contain.text', 'Kimi K3');
      cy.get('[data-testid="scatter-graph"] svg .dot-group').should('have.length.greaterThan', 0);
    });

    it(`opens bare ${locale}/inference on Kimi K3 without dropping shared filters`, () => {
      const query = '?i_seq=agentic-traces&i_prec=fp4&utm_source=default-model-test';
      cy.request({ url: `${locale}/inference${query}`, followRedirect: false }).then((response) => {
        expect(response.status).to.eq(307);
        const destination = new URL(
          String(response.headers.location),
          String(Cypress.config('baseUrl')),
        );
        expect(destination.pathname).to.eq(`${locale}/inference/kimi-k3`);
        expect(destination.search).to.eq(query);
      });
      cy.visit(`${locale}/inference${query}`, visitOptions);
      cy.location('pathname').should('eq', `${locale}/inference/kimi-k3`);
      cy.get('[data-testid="model-selector"]').should('contain.text', 'Kimi K3');
      cy.get('[data-testid="inference-page-heading"]').should('contain.text', 'Kimi K3');
    });

    it(`retains the current model when navigating from ${locale}/evaluation`, () => {
      cy.visit(`${locale}/evaluation`, visitOptions);
      cy.get('[data-testid="tab-trigger-inference"]').click();
      cy.location('pathname').should('eq', `${locale}/inference`);
      cy.get('[data-testid="model-selector"]').should('contain.text', 'DeepSeek V4 Pro');
    });
  }

  it('seeds /historical/<slug> to the routed model and rewrites the URL on switch without a reload', () => {
    cy.visit('/historical/minimax-m3', visitOptions);
    cy.get('[data-testid="historical-trends-display"]').should('be.visible');
    cy.get('[data-testid="model-selector"]').should('contain.text', 'MiniMax');

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
    cy.get('[data-testid="historical-trends-display"]').then(([display]) => {
      cy.get('[data-testid="zh-tab-intro"]').then(([intro]) => {
        // The intro sits below the dashboard so the chart and selectors load first.
        expect(
          display.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).to.be.above(0);
      });
    });
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
  // Opening the dialog while a select popover or the previous dialog is still exiting can leave
  // it under Radix's pointer-events lock; a person cannot click that fast, so let them unmount.
  cy.get('[data-radix-popper-content-wrapper], [role="dialog"]').should('not.exist');
  cy.get('[data-testid="scatter-quick-filters"]').click();
  cy.get('[data-testid="quick-filter-best-per-sku"]').should(
    'have.attr',
    'data-state',
    enabled ? 'checked' : 'unchecked',
  );
  cy.get('[data-testid="quick-filters-dialog"]').contains('button', 'Done').click();
  // Reopening mid exit-animation reuses the old content under a new overlay, which then covers it.
  cy.get('[data-testid="quick-filters-dialog"]').should('not.exist');
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
        win.localStorage.removeItem('inferencex-feature-gate-konami-v1');
      },
    },
  );
}

describe('Inference model presentation', () => {
  for (const locale of ['', '/zh']) {
    for (const width of [1280, 375]) {
      it(`updates model copy and metadata without reloading on ${locale || '/'} at ${width}px`, () => {
        cy.viewport(width, 900);
        cy.intercept('GET', '/api/v1/availability', {
          body: ['kimik3', 'glm5.3', 'dsv41flash'].map((model) => ({
            ...modelSelectionAvailability[0],
            model,
          })),
        });
        cy.visit(
          `${locale}/inference/kimi-k3?i_seq=agentic-traces&i_xmode=interactivity#benchmark`,
          visitOptions,
        );
        cy.window().then((win) => {
          (win as MarkerWindow).__modelRouteNoReloadMarker = true;
        });
        const heading = '[data-testid="inference-page-heading"]';
        const suffix = locale ? '推理基准测试' : 'Inference Benchmarks';
        const expectModel = (name: string, slug: string) => {
          const title = `${name} ${suffix}`;
          cy.get(heading).should('have.text', title);
          cy.title().should('eq', `${title} | InferenceX`);
          cy.get('meta[name="description"]').should('have.attr', 'content').and('contain', name);
          cy.get('meta[property="og:title"]').should(
            'have.attr',
            'content',
            `${title} | InferenceX`,
          );
          cy.get('meta[name="twitter:description"]')
            .should('have.attr', 'content')
            .and('contain', name);
          const path = `${locale}/inference/${slug}`;
          cy.location('pathname').should('eq', path);
          cy.get('link[rel="canonical"]').should(
            'have.attr',
            'href',
            `https://inferencex.semianalysis.com${path}`,
          );
          cy.get('meta[property="og:url"]').should(
            'have.attr',
            'content',
            `https://inferencex.semianalysis.com${path}`,
          );
          cy.get('link[hreflang="zh-CN"]').should(
            'have.attr',
            'href',
            `https://inferencex.semianalysis.com/zh/inference/${slug}`,
          );
        };

        expectModel('Kimi K3', 'kimi-k3');
        selectModel('GLM5.2/GLM5.3 744B');
        expectModel('GLM-5.3', 'glm-5-3');
        cy.document().then((document) => {
          document.querySelector('title')!.firstChild!.nodeValue = `Kimi K3 ${suffix} | InferenceX`;
          document.querySelector('meta[name="description"]')!.setAttribute('content', 'Kimi K3');
        });
        expectModel('GLM-5.3', 'glm-5-3');
        selectModel(FLASH);
        expectModel('DeepSeek V4.1 Flash', 'deepseek-v41-flash');
        selectModel('Kimi K3 2.8T');
        expectModel('Kimi K3', 'kimi-k3');
        cy.window().its('__modelRouteNoReloadMarker').should('eq', true);
        cy.location('search').should('contain', 'i_seq=agentic-traces');
        cy.location('search').should('contain', 'i_xmode=interactivity');
        cy.location('hash').should('eq', '#benchmark');
        cy.reload();
        expectModel('Kimi K3', 'kimi-k3');
        cy.viewport(1280, 900);
        cy.get(`a[href="${locale}/evaluation"]`).filter(':visible').first().click();
        cy.location('pathname').should('eq', `${locale}/evaluation`);
        cy.title().should('not.contain', 'Kimi K3');
        cy.go('back');
        expectModel('Kimi K3', 'kimi-k3');
      });
    }

    it(`updates a bare ${locale}/inference intro when the selector creates a model route`, () => {
      visitModel('DeepSeek-V4.1-Flash', '', `${locale}/inference`);
      selectModel(PRO);
      cy.get('[data-testid="inference-page-heading"]').should('contain.text', 'DeepSeek V4 Pro');
      cy.title().should('contain', 'DeepSeek V4 Pro');
    });

    it(`follows an explicit query-model override on ${locale}/inference/kimi-k3`, () => {
      visitModel('DeepSeek-V4.1-Flash', '', `${locale}/inference/kimi-k3`);
      cy.get('[data-testid="model-selector"]').should('contain.text', FLASH);
      cy.get('[data-testid="inference-page-heading"]').should(
        'contain.text',
        'DeepSeek V4.1 Flash',
      );
      cy.title().should('contain', 'DeepSeek V4.1 Flash');
    });

    it(`keeps model copy in server-rendered HTML on ${locale}/inference/kimi-k3`, () => {
      cy.request(`${locale}/inference/kimi-k3`).then(({ body }) => {
        const document = new DOMParser().parseFromString(body, 'text/html');
        expect(document.querySelector('h1')?.textContent).to.eq(
          locale ? 'Kimi K3 推理基准测试' : 'Kimi K3 Inference Benchmarks',
        );
        expect(document.title).to.contain('Kimi K3');
      });
    });
  }
});

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
