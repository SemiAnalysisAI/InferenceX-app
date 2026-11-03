'use client';

import type { RequestRecord } from '@/hooks/api/use-request-timeline';

import { formatDuration, formatTickLabel } from './timeline-format';
import { cursorStatsAt, type SortedRequestTimes } from './timeline-cursor-stats';
import { requestSourceLabel, shortenWid, type RequestTimelineRow } from './timeline-rows';
import { ChartHoverCardBody } from '@/components/ui/chart-hover-card';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { useLocale } from '@/lib/i18n/use-locale';

const TOOLTIP_STRINGS = {
  en: {
    cancelled: 'cancelled',
    total: 'Total',
    queue: 'Queue wait',
    phase: 'Phase',
    depth: 'Agent depth',
    worker: 'worker',
    started: 'Started at',
    inflight: 'In flight',
    running: 'running',
    waiting: 'waiting',
    completed: 'Completed',
    relative: (value: string) => `relative to t₀ (${value}s wall-clock)`,
  },
  zh: {
    cancelled: '已取消',
    total: '总时长',
    queue: '排队等待',
    phase: '阶段',
    depth: 'Agent 深度',
    worker: 'worker',
    started: '开始时间',
    inflight: '在途',
    running: '运行中',
    waiting: '等待中',
    completed: '已完成',
    relative: (value: string) => `相对于 t₀（挂钟时间 ${value}s）`,
  },
} as const;

export interface TooltipData {
  x: number;
  y: number;
  row: RequestTimelineRow;
  req: RequestRecord;
}

export function TimelineTooltip({ data }: { data: TooltipData }) {
  const locale = useLocale();
  const t = TOOLTIP_STRINGS[locale];
  const { row, req } = data;
  const totalMs = (req.end - req.start) / 1e6;
  const queueMs = (req.start - req.credit) / 1e6;
  return (
    <FloatingTooltip x={data.x} y={data.y} data-testid="request-timeline-tooltip">
      <ChartHoverCardBody
        title={row.label}
        subtitle={
          <>
            {requestSourceLabel(req, locale)}
            {req.cancelled && <span className="text-destructive"> · {t.cancelled}</span>}
          </>
        }
        color={row.color}
        metrics={[
          { value: formatDuration(totalMs), label: t.total },
          { value: queueMs > 0.5 ? formatDuration(queueMs) : '—', label: t.queue },
          ...(req.ttftMs === null ? [] : [{ value: formatDuration(req.ttftMs), label: 'TTFT' }]),
        ]}
        summary={[
          req.isl === null ? null : `ISL ${req.isl.toLocaleString()}`,
          req.osl === null ? null : `OSL ${req.osl.toLocaleString()}`,
          `${t.phase} ${req.phase}`,
          req.ad > 0 ? `${t.depth} ${req.ad}` : null,
          `${t.worker} ${shortenWid(req.wid)}`,
          `${t.started} ${formatTickLabel(req.start)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
    </FloatingTooltip>
  );
}

export interface CursorState {
  xPx: number;
  tNs: number;
  clientX: number;
  clientY: number;
}

export function CursorPopover({
  cursor,
  dataStart,
  times,
}: {
  cursor: CursorState;
  dataStart: number;
  times: SortedRequestTimes;
}) {
  const locale = useLocale();
  const copy = TOOLTIP_STRINGS[locale];
  const t = cursor.tNs;
  const { running, waiting, completed, inflight } = cursorStatsAt(times, t);
  const tSec = t / 1e9;
  return (
    <FloatingTooltip x={cursor.clientX} y={cursor.clientY} offset={14} placement="above">
      <ChartHoverCardBody
        title={`t = ${tSec < 60 ? `${tSec.toFixed(3)} s` : `${(tSec / 60).toFixed(3)} m`}`}
        metrics={[
          { value: inflight, label: copy.inflight },
          { value: running, label: copy.running },
          { value: waiting, label: copy.waiting },
          { value: completed, label: copy.completed },
        ]}
        summary={copy.relative((dataStart / 1e9).toFixed(0))}
      />
    </FloatingTooltip>
  );
}
