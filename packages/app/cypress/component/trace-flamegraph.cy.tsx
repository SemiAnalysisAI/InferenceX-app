import { TraceFlamegraph } from '@/components/datasets/trace-flamegraph';
import type { ConversationStructure } from '@/hooks/api/use-datasets';

// Two main turns followed by one subagent group with two child turns.
// Node indices: 0 = turn, 1 = turn, 2 = subagent (so its rows key off `g-2`).
const structure: ConversationStructure = {
  blockSize: 64,
  nodes: [
    { kind: 'turn', turnIndex: 0, model: 'claude', in: 1000, out: 200, cached: 600, uncached: 400 },
    {
      kind: 'turn',
      turnIndex: 1,
      model: 'claude',
      in: 2000,
      out: 300,
      cached: 1500,
      uncached: 500,
    },
    {
      kind: 'subagent',
      label: 'Subagent: search',
      agentId: 'agent-1',
      durationMs: 12000,
      in: 5000,
      out: 800,
      cached: 3000,
      uncached: 2000,
      children: [
        {
          kind: 'turn',
          turnIndex: 0,
          model: 'claude',
          in: 2500,
          out: 400,
          cached: 1500,
          uncached: 1000,
        },
        {
          kind: 'turn',
          turnIndex: 1,
          model: 'claude',
          in: 2500,
          out: 400,
          cached: 1500,
          uncached: 1000,
        },
      ],
    },
  ],
  totals: { in: 8000, out: 1300, cached: 5100, uncached: 2900, numTurns: 2, numSubagentGroups: 1 },
};

describe('TraceFlamegraph', () => {
  it('renders the legend, main-turn rows, and the subagent group header', () => {
    cy.mount(<TraceFlamegraph structure={structure} />);
    cy.contains('Cached prefix').should('be.visible');
    cy.contains('Uncached input').should('be.visible');
    cy.contains('Output').should('be.visible');
    cy.get('[data-rowkey="t-0"]').should('contain.text', 'Turn 1');
    cy.get('[data-rowkey="t-1"]').should('contain.text', 'Turn 2');
    cy.contains('Subagent: search').should('be.visible');
  });

  it('keeps subagent children collapsed until the group is expanded', () => {
    cy.mount(<TraceFlamegraph structure={structure} />);
    cy.get('[data-rowkey="g-2-c-0"]').should('not.exist');
    cy.contains('button', 'Subagent: search').click();
    cy.get('[data-rowkey="g-2-c-0"]').should('be.visible');
    cy.get('[data-rowkey="g-2-c-1"]').should('be.visible');
  });

  it('expand all / collapse all toggles every subagent group', () => {
    cy.mount(<TraceFlamegraph structure={structure} />);
    cy.contains('button', 'Expand all').click();
    cy.get('[data-rowkey="g-2-c-0"]').should('be.visible');
    cy.contains('button', 'Collapse all').click();
    cy.get('[data-rowkey="g-2-c-0"]').should('not.exist');
  });

  it('auto-expands and highlights the target group child for a request-timeline deep link', () => {
    cy.mount(
      <TraceFlamegraph structure={structure} highlightAgentId="agent-1" highlightTurn={1} />,
    );
    cy.get('[data-rowkey="g-2-c-1"]').should('be.visible').and('have.class', 'ring-primary');
  });
});
