import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { RequestRecord } from '@/hooks/api/use-request-timeline';

import { TimelineBars } from './timeline-bars';
import type { RequestTimelineRow } from './timeline-rows';

const request: RequestRecord = {
  cid: 'conversation-1',
  ti: 3,
  wid: 'worker-1',
  ad: 0,
  phase: 'profiling',
  credit: 0,
  start: 0,
  ack: null,
  end: 1_000_000_000,
  ttftMs: 100,
  tpotMs: 10,
  isl: 1024,
  osl: 128,
  cancelled: false,
};

const rows: RequestTimelineRow[] = [
  {
    key: 'conversation-1',
    label: 'conversation-1',
    color: '#123456',
    requests: [request],
    depth: 0,
    kind: 'parent',
  },
];

const renderBars = (locale: 'en' | 'zh') =>
  renderToStaticMarkup(
    <svg>
      <TimelineBars
        rows={rows}
        firstRowIndex={0}
        scrollTop={0}
        viewportHeight={300}
        expandedSubagents={new Set()}
        dataStart={0}
        vStart={0}
        vEnd={2_000_000_000}
        datasetSlug="fixture-dataset"
        locale={locale}
        onBarHover={vi.fn()}
        onBarLeave={vi.fn()}
        onBarClick={vi.fn()}
      />
    </svg>,
  );

describe('TimelineBars dataset anchors', () => {
  it('preserves the English href and prefixes the native Chinese href', () => {
    expect(renderBars('en')).toContain(
      'href="/agentx/fixture-dataset/conversations/conversation-1?turn=3"',
    );
    expect(renderBars('zh')).toContain(
      'href="/zh/agentx/fixture-dataset/conversations/conversation-1?turn=3"',
    );
  });
});
