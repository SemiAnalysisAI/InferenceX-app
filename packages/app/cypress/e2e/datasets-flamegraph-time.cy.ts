import { unlockAgenticGate } from '../support/e2e';

describe('Dataset conversation flamegraph timing', () => {
  before(() => {
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
    cy.visit('/datasets/test-dataset/conversations/conversation-1', {
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
});
