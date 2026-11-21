// @test-environment jsdom
import { describe, expect, it } from 'bun:test';

import type { ConversationStructure } from '@/hooks/api/use-datasets';
import {
  $,
  blur,
  click,
  contains,
  dispatch,
  eventually,
  focus,
  get,
  isVisible,
  render,
} from '@/test/dom';

import { TraceFlamegraph } from './trace-flamegraph';

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

const row = (key: string) => $(`[data-rowkey="${key}"]`);

describe('TraceFlamegraph', () => {
  it('keeps subagent children collapsed until the group is expanded', async () => {
    render(<TraceFlamegraph structure={structure} />);
    expect(row('g-2-c-0')).toBeNull();
    click(contains('button', 'Subagent: search'));
    await eventually(() => expect(isVisible(row('g-2-c-0'))).toBe(true));
    expect(isVisible(row('g-2-c-1'))).toBe(true);
  });

  it('expand all / collapse all toggles every subagent group', async () => {
    render(<TraceFlamegraph structure={structure} />);
    click(contains('button', 'Expand all'));
    await eventually(() => expect(isVisible(row('g-2-c-0'))).toBe(true));
    click(contains('button', 'Collapse all'));
    await eventually(() => expect(row('g-2-c-0')).toBeNull());
  });

  it('auto-expands and highlights the target group child for a request-timeline deep link', async () => {
    render(<TraceFlamegraph structure={structure} highlightAgentId="agent-1" highlightTurn={1} />);
    await eventually(() => {
      expect(isVisible(row('g-2-c-1'))).toBe(true);
      expect(row('g-2-c-1')!.classList.contains('ring-primary')).toBe(true);
    });
  });

  it('exposes bar values on keyboard focus without regressing pointer tooltips', async () => {
    render(<TraceFlamegraph structure={structure} />);
    const bar = get('[data-testid="flamegraph-bar-t-0"]');
    expect(bar.getAttribute('tabindex')).toBe('0');
    expect(bar.getAttribute('role')).toBe('meter');
    expect(bar.getAttribute('aria-label')).toBe('Turn 1');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('2300');
    expect(bar.getAttribute('aria-valuenow')).toBe('1200');
    expect(bar.getAttribute('aria-valuetext')).toContain('Cached prefix: 600');

    focus(bar);
    await eventually(() => {
      const tooltip = get('[role="tooltip"]');
      expect(isVisible(tooltip)).toBe(true);
      expect(tooltip.textContent).toContain('Turn 1');
      expect(tooltip.textContent).toContain('Uncached input400');
      expect(tooltip.textContent).toContain('Output200');
    });

    blur(bar);
    dispatch(bar, new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: 200 }));
    await eventually(() => {
      const tooltip = get('[role="tooltip"]');
      expect(isVisible(tooltip)).toBe(true);
      expect(tooltip.textContent).toContain('Cached prefix600');
    });
  });
});
