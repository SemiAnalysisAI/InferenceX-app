import { unlockAgenticGate } from '../support/e2e';

const SLUG = 'click-path-dataset';
const CONVERSATION_ID = 'click-path-conversation-0001';

const DATASET = {
  id: SLUG,
  slug: SLUG,
  label: 'Click path fixture',
  variant: 'fixture',
  description: null,
  hf_url: null,
  license: 'apache-2.0',
  conversation_count: 1,
  summary: {
    medianRequestsPerConversation: 1,
    meanRequestsPerConversation: 1,
    mainTurns: 1,
    subagentGroups: 0,
    cachedPct: 0.5,
    totalIn: 128,
    totalOut: 16,
  },
  ingested_at: '2026-08-23T00:00:00Z',
};

const CONVERSATION = {
  conv_id: CONVERSATION_ID,
  models: ['fixture-model'],
  num_turns: 1,
  num_subagent_groups: 0,
  total_in: 128,
  total_out: 16,
  total_cached: 64,
  structure: {
    blockSize: 64,
    totals: {
      in: 128,
      out: 16,
      cached: 64,
      uncached: 64,
      numTurns: 1,
      numSubagentGroups: 0,
    },
    nodes: [
      {
        kind: 'turn',
        turnIndex: 0,
        startS: 0,
        endS: 1,
        model: 'fixture-model',
        in: 128,
        out: 16,
        cached: 64,
        uncached: 64,
      },
    ],
  },
};

function stubDatasetJourney(): void {
  cy.intercept('GET', '/api/v1/datasets', { statusCode: 200, body: [DATASET] });
  cy.intercept('GET', `/api/v1/datasets/${SLUG}`, {
    statusCode: 200,
    body: { ...DATASET, chart_data: {} },
  });
  cy.intercept('GET', `/api/v1/datasets/${SLUG}/conversations*`, {
    statusCode: 200,
    body: {
      total: 1,
      items: [
        {
          conv_id: CONVERSATION_ID,
          models: CONVERSATION.models,
          num_turns: CONVERSATION.num_turns,
          num_subagent_groups: CONVERSATION.num_subagent_groups,
          total_in: CONVERSATION.total_in,
          total_out: CONVERSATION.total_out,
          total_cached: CONVERSATION.total_cached,
        },
      ],
    },
  });
  cy.intercept('GET', `/api/v1/datasets/${SLUG}/conversations/${CONVERSATION_ID}`, {
    statusCode: 200,
    body: CONVERSATION,
  });
}

function expectNoPageOverflow(): void {
  cy.window().should((win) => {
    expect(win.document.body.scrollWidth, 'body scroll width').to.be.at.most(win.innerWidth);
    expect(win.document.documentElement.scrollWidth, 'document scroll width').to.be.at.most(
      win.innerWidth,
    );
  });
}

function runClickJourney(prefix: '' | '/zh'): void {
  stubDatasetJourney();
  cy.visit(`${prefix}/agentx`, { onBeforeLoad: unlockAgenticGate });

  cy.get(`a[href="${prefix}/agentx/${SLUG}"]`).should('be.visible').click();
  cy.location('pathname').should('eq', `${prefix}/agentx/${SLUG}`);
  cy.get('h1').should('have.text', DATASET.label);
  expectNoPageOverflow();

  const conversationHref = `${prefix}/agentx/${SLUG}/conversations/${CONVERSATION_ID}`;
  cy.get(`[data-testid="dataset-conversations-table-scroll"] a[href="${conversationHref}"]`)
    .should('be.visible')
    .click();
  cy.location('pathname').should('eq', conversationHref);
  cy.get('h1').should('have.text', CONVERSATION_ID);
  cy.get('[data-rowkey="t-0"]').should('exist');
  cy.get('[data-testid="flamegraph-bar-t-0"]').should('have.attr', 'role', 'meter');
  expectNoPageOverflow();
}

describe('AgentX dataset click journey', () => {
  it('clicks from the English landing page through dataset and conversation detail', () => {
    cy.viewport(1440, 900);
    runClickJourney('');
  });

  it('clicks from the Chinese landing page through dataset and conversation detail', () => {
    cy.viewport(390, 844);
    runClickJourney('/zh');
  });
});
