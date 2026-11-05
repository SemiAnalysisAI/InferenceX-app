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
    worker: 'Worker',
    started: 'Started at',
    link: 'Click to view this conversation in the dataset →',
    inflight: 'In flight',
    split: (running: number, waiting: number) => `${running} running · ${waiting} waiting`,
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
    link: '点击可在数据集中查看此对话 →',
    inflight: '在途',
    split: (running: number, waiting: number) => `运行中 ${running} · 等待中 ${waiting}`,
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

export function TimelineTooltip({ data, linkable }: { data: TooltipData; linkable?: boolean }) {
  const locale = useLocale();
  const t = TOOLTIP_STRINGS[locale];
  const { row, req } = data;
  const totalMs = (req.end - req.start) / 1e6;
  const queueMs = (req.start - req.credit) / 1e6;
  const rows = [
    req.isl === null ? null : ['ISL', req.isl.toLocaleString()],
    req.osl === null ? null : ['OSL', req.osl.toLocaleString()],
    [t.phase, req.phase],
    req.ad > 0 ? [t.depth, String(req.ad)] : null,
    [t.worker, shortenWid(req.wid)],
    [t.started, formatTickLabel(req.start)],
  ].filter((entry): entry is [string, string] => entry !== null);
  return (
    <FloatingTooltip x={data.x} y={data.y} data-testid="request-timeline-tooltip">
      <ChartHoverCardBody
        title={
          <span className="flex min-w-0 items-baseline gap-1">
            <span className="truncate">{row.label}</span>
            <span className="shrink-0 font-normal text-muted-foreground">
              {requestSourceLabel(req, locale)}
              {req.cancelled && <span className="text-destructive"> · {t.cancelled}</span>}
            </span>
          </span>
        }
        color={row.color}
        metrics={[
          { value: formatDuration(totalMs), label: t.total },
          { value: queueMs > 0.5 ? formatDuration(queueMs) : '—', label: t.queue },
          ...(req.ttftMs === null ? [] : [{ value: formatDuration(req.ttftMs), label: 'TTFT' }]),
        ]}
        summary={
          <>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-t border-border/50 pt-1.5">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt>{label}</dt>
                  <dd className="truncate text-right text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            {linkable && <p className="mt-1.5 font-medium text-foreground">{t.link}</p>}
          </>
        }
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
          { value: completed, label: copy.completed },
        ]}
        summary={
          <>
            <p>{copy.split(running, waiting)}</p>
            <p className="mt-0.5 opacity-80">{copy.relative((dataStart / 1e9).toFixed(0))}</p>
          </>
        }
      />
    </FloatingTooltip>
  );
}
