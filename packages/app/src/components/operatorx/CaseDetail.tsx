'use client';

import { ticks } from 'd3';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ComparisonOp, ComparisonView } from '@semianalysisai/inferencex-db/operatorx/compare';
import type { OperatorXTimeline } from '@semianalysisai/inferencex-db/operatorx/timeline';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { Switch } from '@/components/ui/switch';
import { useOperatorXTimelines } from '@/hooks/api/use-operatorx';
import { TABLEAU_10 } from '@/lib/constants';

import { hardwareLabel } from './compare/hardware';
import { caseRefs } from './compare/model';
import { caseLabel } from './compare/slices';

/** Kernels past the palette share one muted color. */
const PALETTE = TABLEAU_10.slice(0, 9);
const OTHER = 'var(--muted-foreground)';

function formatUs(us: number): string {
  if (us >= 1000) return `${Number((us / 1000).toPrecision(3))} ms`;
  return `${Number(us.toPrecision(3))} µs`;
}

/** Qualified name of an Itanium-mangled symbol: `_ZN2ck9kernel_abI...` -> `ck::kernel_ab<…>`. */
function demangledName(name: string): string | null {
  const m = /^_Z(?<nested>N)?/.exec(name);
  if (!m) return null;
  const parts: string[] = [];
  let i = m[0].length;
  while (i < name.length && name[i] >= '0' && name[i] <= '9') {
    let j = i;
    while (name[j] >= '0' && name[j] <= '9') j++;
    const len = Number(name.slice(i, j));
    parts.push(name.slice(j, j + len));
    i = j + len;
    if (!m.groups?.nested) break;
  }
  if (parts.length === 0) return null;
  return parts.join('::') + (name[i] === 'I' ? '<…>' : '');
}

/** `cutlass::Kernel2<cutlass_80_tensorop_...>(Params` (possibly cut short) -> `cutlass::Kernel2<…>`. */
function shortName(name: string): string {
  const demangled = demangledName(name);
  if (demangled) return demangled;
  let out = '';
  let depth = 0;
  for (const ch of name.replace(/\(.*$/, '')) {
    if (ch === '<') {
      if (depth === 0) out += '<…>';
      depth++;
    } else if (ch === '>') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out.trim() || name;
}

/** Color per kernel-name index: the GPU's longest kernels in palette order. */
function kernelColors(t: OperatorXTimeline): (i: number) => string {
  const ranked = new Map(t.kernels.slice(0, PALETTE.length).map((k, r) => [k.name, PALETTE[r]]));
  return (i) => ranked.get(i) ?? OTHER;
}

function TimeAxis({ scaleUs }: { scaleUs: number }) {
  return (
    <div className="relative ml-20 h-4 text-3xs text-muted-foreground tabular-nums">
      {ticks(0, scaleUs, 5).map((t) => (
        <span
          key={t}
          className="absolute -translate-x-1/2 border-l border-border/60 pl-0.5"
          style={{ left: `${(t / scaleUs) * 100}%` }}
        >
          {formatUs(t)}
        </span>
      ))}
    </div>
  );
}

function GpuTimeline({
  hardware,
  color,
  latencyUs,
  timeline,
  scaleUs,
}: {
  hardware: string;
  color: string;
  latencyUs: number | null;
  timeline: OperatorXTimeline | null;
  scaleUs: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const colorOf = useMemo(() => (timeline ? kernelColors(timeline) : () => OTHER), [timeline]);
  const event = timeline && hovered !== null ? timeline.events[hovered] : null;
  const total = timeline?.kernels.reduce((sum, k) => sum + k.usPerCall, 0) ?? 0;
  return (
    <section className="space-y-2 border-t border-border/60 pt-3" data-testid="operatorx-timeline">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span className="inline-block size-2 rounded-full" style={{ background: color }} />
          {hardwareLabel(hardware)}
        </span>
        {latencyUs !== null && (
          <span className="tabular-nums">
            <span className="text-muted-foreground">latency</span> {formatUs(latencyUs)}
          </span>
        )}
        {timeline && (
          <span className="text-xs text-muted-foreground tabular-nums">
            span {formatUs(timeline.spanUs)} · busy {formatUs(timeline.busyUs)} · idle{' '}
            {formatUs(timeline.gapUs)}
            {timeline.overlapUs > 0 && ` · overlap ${formatUs(timeline.overlapUs)}`}
          </span>
        )}
      </div>
      {timeline ? (
        <>
          <div className="space-y-1" onMouseLeave={() => setHovered(null)}>
            {timeline.lanes.map((lane, li) => (
              <div key={lane} className="flex items-center">
                <span className="w-20 shrink-0 truncate pr-2 text-3xs text-muted-foreground">
                  stream {lane}
                </span>
                <div className="relative h-5 flex-1 rounded-sm bg-muted/40">
                  {timeline.events.map(([name, l, start, dur], ei) =>
                    l === li ? (
                      <span
                        key={ei}
                        className={`absolute inset-y-0 rounded-xs ${hovered === ei ? 'ring-2 ring-foreground' : ''}`}
                        style={{
                          left: `${(start / scaleUs) * 100}%`,
                          width: `max(2px, ${(dur / scaleUs) * 100}%)`,
                          background: colorOf(name),
                        }}
                        onMouseEnter={() => setHovered(ei)}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
          <TimeAxis scaleUs={scaleUs} />
          <p className="ml-20 min-h-4 truncate text-xs text-muted-foreground tabular-nums">
            {event ? (
              <>
                <span className="font-mono text-foreground">
                  {shortName(timeline.names[event[0]])}
                </span>{' '}
                · start {formatUs(event[2])} · {formatUs(event[3])}
              </>
            ) : timeline.truncated ? (
              `First ${timeline.events.length} kernels of the replay`
            ) : null}
          </p>
          <table className="w-full table-fixed text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="w-2/5 py-1 text-left font-normal md:w-1/3">Kernel</th>
                <th className="py-1 text-right font-normal">Time / call</th>
                <th className="py-1 text-right font-normal">Share</th>
                <th className="py-1 text-right font-normal">Launches</th>
                <th className="hidden py-1 text-right font-normal md:table-cell">Grid</th>
                <th className="hidden py-1 text-right font-normal md:table-cell">Block</th>
                <th className="hidden py-1 text-right font-normal md:table-cell">Regs</th>
                <th className="hidden py-1 text-right font-normal md:table-cell">Occupancy</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {timeline.kernels.map((k) => {
                const name = timeline.names[k.name];
                return (
                  <tr key={k.name} className="border-b border-border/30 last:border-0">
                    <td className="py-1 pr-3">
                      <span className="flex min-w-0 items-center gap-2" title={name}>
                        <span
                          className="inline-block size-2 shrink-0 rounded-sm"
                          style={{ background: colorOf(k.name) }}
                        />
                        <span className="truncate font-mono">{shortName(name)}</span>
                      </span>
                    </td>
                    <td className="py-1 text-right">{formatUs(k.usPerCall)}</td>
                    <td className="py-1 text-right">
                      {total > 0 ? `${Math.round((k.usPerCall / total) * 100)}%` : '—'}
                    </td>
                    <td className="py-1 text-right">{k.countPerCall}</td>
                    <td className="hidden py-1 text-right md:table-cell">
                      {k.grid?.join('×') ?? '—'}
                    </td>
                    <td className="hidden py-1 text-right md:table-cell">
                      {k.block?.join('×') ?? '—'}
                    </td>
                    <td className="hidden py-1 text-right md:table-cell">{k.regs ?? '—'}</td>
                    <td className="hidden py-1 text-right md:table-cell">
                      {k.occupancyPct ? `${Math.round(k.occupancyPct)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Not profiled.</p>
      )}
    </section>
  );
}

function CaseTimelines({
  op,
  view,
  hardware,
  colors,
  caseIndex,
}: {
  op: ComparisonOp;
  view: ComparisonView;
  hardware: string[];
  colors: Record<string, string>;
  caseIndex: number;
}) {
  const refs = useMemo(() => caseRefs(view, hardware, caseIndex), [view, hardware, caseIndex]);
  const { data, error, isLoading, refetch } = useOperatorXTimelines(
    op,
    refs.map((r) => r.ref),
  );
  const [shared, setShared] = useState(true);
  if (refs.length === 0)
    return <p className="text-sm text-muted-foreground">No selected GPU measured this case.</p>;
  if (error)
    return (
      <RetryableQueryError
        message={error.message}
        analyticsEvent="operatorx_timeline_retry"
        onRetry={refetch}
        testId="operatorx-timeline-error"
      />
    );
  if (isLoading || !data)
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  const longest = Math.max(...refs.map((r) => data[r.ref]?.spanUs ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch id="opx-timeline-shared" checked={shared} onCheckedChange={setShared} />
        <Label htmlFor="opx-timeline-shared" className="text-sm font-normal text-muted-foreground">
          Same time scale for every GPU
        </Label>
      </div>
      {refs.map(({ hardware: hw, ref }) => {
        const timeline = data[ref] ?? null;
        const scaleUs = (shared ? longest : timeline?.spanUs) || 1;
        return (
          <GpuTimeline
            key={hw}
            hardware={hw}
            color={colors[hw] ?? OTHER}
            latencyUs={view.measurements[hw]?.latencyUs[caseIndex] ?? null}
            timeline={timeline}
            scaleUs={scaleUs}
          />
        );
      })}
    </div>
  );
}

/** Floating drill-down of one case: each selected GPU's kernel timeline and kernel table. */
export function CaseDetail({
  op,
  view,
  hardware,
  colors,
  caseIndex,
  onClose,
}: {
  op: ComparisonOp;
  view: ComparisonView;
  hardware: string[];
  colors: Record<string, string>;
  caseIndex: number | null;
  onClose: () => void;
}) {
  const c = caseIndex === null ? null : view.cases[caseIndex];
  return (
    <Dialog open={c !== null && c !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[94vh] w-[min(96vw,64rem)] max-w-[min(96vw,64rem)] flex-col gap-4 overflow-y-auto p-4 sm:p-6"
        data-testid="operatorx-case-detail"
      >
        {c && caseIndex !== null && (
          <>
            <DialogHeader>
              <DialogTitle>{caseLabel(c)}</DialogTitle>
              <DialogDescription className="font-mono text-xs">{c.precision}</DialogDescription>
            </DialogHeader>
            <CaseTimelines
              op={op}
              view={view}
              hardware={hardware}
              colors={colors}
              caseIndex={caseIndex}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
