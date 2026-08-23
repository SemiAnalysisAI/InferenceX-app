import { unlockAgenticGate } from '../support/e2e';

const EMPTY_CONVERSATION = {
  conv_id: 'retry-conversation',
  models: [],
  num_turns: 0,
  num_subagent_groups: 0,
  total_in: 0,
  total_out: 0,
  total_cached: 0,
  structure: {
    blockSize: 64,
    totals: { in: 0, out: 0, cached: 0, uncached: 0, numTurns: 0, numSubagentGroups: 0 },
    nodes: [],
  },
};

describe('Dataset conversation flamegraph timing', () => {
  beforeEach(() => {
    cy.intercept('GET', '/api/v1/datasets/test-dataset/conversations/conversation-1', {
      body: {
        conv_id: 'conversation-1',
        models: ['model-a'],
        num_turns: 2,
        num_subagent_groups: 1,
        total_in: 1000,
        total_out: 100,
        total_cached: 500,
        structure: {
          blockSize: 64,
          totals: {
            in: 1000,
            out: 100,
            cached: 500,
            uncached: 500,
            numTurns: 2,
            numSubagentGroups: 1,
          },
          nodes: [
            {
              kind: 'turn',
              turnIndex: 0,
              startS: 0,
              endS: 1.2,
              model: 'model-a',
              in: 100,
              out: 10,
              cached: 0,
              uncached: 100,
            },
            {
              kind: 'subagent',
              label: 'Explore',
              agentId: 'agent-1',
              startS: 3661.2,
              endS: 3782.6,
              durationMs: 121_400,
              in: 800,
              out: 80,
              cached: 500,
              uncached: 300,
              children: [
                {
                  kind: 'turn',
                  turnIndex: 1,
                  startS: 3661.2,
                  endS: 3668.2,
                  model: 'model-a',
                  in: 300,
                  out: 30,
                  cached: 150,
                  uncached: 150,
                },
                {
                  kind: 'turn',
                  turnIndex: 2,
                  startS: 3665.2,
                  endS: 3671.2,
                  model: 'model-a',
                  in: 300,
                  out: 30,
                  cached: 200,
                  uncached: 100,
                },
                {
                  kind: 'turn',
                  turnIndex: 3,
                  startS: 3670.2,
                  endS: 3675.2,
                  model: 'model-a',
                  in: 200,
                  out: 20,
                  cached: 150,
                  uncached: 50,
                },
              ],
            },
            {
              kind: 'turn',
              turnIndex: 2,
              startS: 65.4,
              endS: 67.4,
              model: 'model-a',
              in: 100,
              out: 10,
              cached: 0,
              uncached: 100,
            },
          ],
        },
      },
    });
    cy.visit('/agentx/test-dataset/conversations/conversation-1', {
      onBeforeLoad: unlockAgenticGate,
    });
  });

  it('shows turn offsets and a collapsed subagent time range', () => {
    cy.get('[data-testid="flamegraph-time-t-0"]').should('have.text', '+00:00–00:01');
    cy.get('[data-testid="flamegraph-time-t-2"]').should('have.text', '+01:05–01:07');
    cy.get('[data-testid="flamegraph-time-g-1"]').should('have.text', '+1:01:01–1:03:03');
    cy.get('[data-testid="flamegraph-time-g-1-c-0"]').should('not.exist');
  });

  it('shows subturn offsets when the subagent group is expanded', () => {
    cy.contains('button', 'Explore').click();
    cy.get('[data-testid="flamegraph-time-g-1-c-0"]').should('have.text', '+1:01:01–1:01:08');
    // Parallel groups render as left-gutter brackets; each member row carries
    // one bracket segment per group it belongs to (non-transitive chains keep
    // their own segments/lanes).
    cy.get('[data-testid="flamegraph-overlap-g-1-c-0"]')
      .should('have.length', 1)
      .and('have.attr', 'data-overlap-group', 'subagent-1-1');
    cy.get('[data-testid="flamegraph-overlap-g-1-c-1"]')
      .should('have.length', 2)
      .then(($segs) => {
        expect([...$segs].map((seg) => seg.dataset.overlapGroup).toSorted()).to.deep.equal([
          'subagent-1-1',
          'subagent-1-2',
        ]);
      });
    cy.get('[data-testid="flamegraph-overlap-g-1-c-2"]')
      .should('have.length', 1)
      .and('have.attr', 'data-overlap-group', 'subagent-1-2');
  });

  it('localizes generated flamegraph labels on the Chinese conversation route', () => {
    cy.visit('/zh/agentx/test-dataset/conversations/conversation-1', {
      onBeforeLoad: unlockAgenticGate,
    });

    cy.get('[data-rowkey="t-0"]').should('contain.text', '第 1 轮');
    cy.get('[data-testid="flamegraph-bar-t-0"]')
      .should('have.attr', 'role', 'meter')
      .and('have.attr', 'aria-label', '第 1 轮')
      .and('have.attr', 'aria-valuetext')
      .and('include', '缓存前缀：0；未缓存输入：100；输出：10');
    cy.get('[data-testid="flamegraph-bar-t-0"]')
      .focus()
      .should('have.attr', 'aria-describedby', 'flamegraph-tooltip');
    cy.get('[role="tooltip"]')
      .should('exist')
      .and('contain.text', '缓存前缀0')
      .and('contain.text', '未缓存输入100');
    cy.get('[data-testid="flamegraph-bar-t-0"]').blur();
    cy.get('[data-testid="flamegraph-bar-g-1"]').trigger('mousemove', {
      clientX: 600,
      clientY: 400,
    });
    cy.get('[data-testid="flamegraph-tooltip"]').should('contain.text', '3 轮');
    cy.contains('button', 'Explore').click();
    cy.get('[data-rowkey="g-1-c-0"]').should('contain.text', '子轮次 1');
  });

  it('publishes bidirectional hreflang metadata for noindex conversation pages', () => {
    cy.visit('/zh/agentx/test-dataset/conversations/conversation-1', {
      onBeforeLoad: unlockAgenticGate,
    });

    cy.get('link[rel="alternate"][hreflang="en"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/agentx/test-dataset/conversations/conversation-1',
    );
    cy.get('link[rel="alternate"][hreflang="zh-CN"]').should(
      'have.attr',
      'href',
      'https://inferencex.semianalysis.com/zh/agentx/test-dataset/conversations/conversation-1',
    );
  });

  it('keeps the flamegraph reachable through internal scrolling at 375px', () => {
    cy.viewport(375, 812);
    cy.visit('/zh/agentx/test-dataset/conversations/conversation-1', {
      onBeforeLoad: unlockAgenticGate,
    });

    cy.get('[data-testid="flamegraph-scroll"]').should(($scroll) => {
      const element = $scroll[0];
      expect(getComputedStyle(element).overflowX).to.eq('auto');
      expect(element.scrollWidth).to.be.greaterThan(element.clientWidth);
    });
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth);
    });
  });
});

describe('Dataset conversation request states', () => {
  it('renders a localized request error and retries at 375px', () => {
    let attempts = 0;
    cy.intercept(
      'GET',
      '/api/v1/datasets/test-dataset/conversations/retry-conversation',
      (request) => {
        attempts += 1;
        request.reply(
          attempts <= 2
            ? { statusCode: 503, body: {} }
            : { statusCode: 200, body: EMPTY_CONVERSATION },
        );
      },
    );

    cy.viewport(375, 812);
    cy.visit('/zh/agentx/test-dataset/conversations/retry-conversation', {
      onBeforeLoad: unlockAgenticGate,
    });
    cy.get('[data-testid="conversation-view-error"]', { timeout: 10_000 })
      .should('have.attr', 'data-locale', 'zh')
      .and('have.attr', 'role', 'alert');
    cy.get('[data-testid="conversation-view-not-found"]').should('not.exist');
    cy.get('[data-testid="conversation-view-error"] a').should(
      'have.attr',
      'href',
      '/zh/agentx/test-dataset',
    );
    cy.contains('[data-testid="conversation-view-error"] button', '重试').click();
    cy.contains('h1', 'retry-conversation').should('be.visible');
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth).to.be.at.most(win.innerWidth);
    });
  });

  it('reserves the not-found state for a successful 404 response', () => {
    cy.intercept('GET', '/api/v1/datasets/test-dataset/conversations/missing', {
      statusCode: 404,
    });

    cy.viewport(1280, 800);
    cy.visit('/agentx/test-dataset/conversations/missing', {
      onBeforeLoad: unlockAgenticGate,
    });
    cy.get('[data-testid="conversation-view-not-found"]')
      .should('have.attr', 'data-locale', 'en')
      .and('be.visible');
    cy.get('[data-testid="conversation-view-error"]').should('not.exist');
  });
});
