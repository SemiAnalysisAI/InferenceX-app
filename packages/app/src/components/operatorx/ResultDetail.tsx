'use client';

import { Loader2, X } from 'lucide-react';

import { useOperatorXResult } from '@/hooks/api/use-operatorx';
import type { OperatorXResult } from '@semianalysisai/inferencex-db/operatorx/normalize';

import { formatTflops, formatUs, shortKernel, STATUS_CLASS } from './format';
import { KernelTimeline, type TimelineEvent } from './KernelTimeline';
import { statusLabel, type OperatorXStrings } from './strings';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3 font-mono text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function TelemetrySummary({ telemetry }: { telemetry: Obj }) {
  const p50 = (key: string) => {
    const v = telemetry[key];
    return isObj(v) && typeof v.p50 === 'number' ? v.p50 : null;
  };
  const reasons = Array.isArray(telemetry.throttle_reasons)
    ? telemetry.throttle_reasons.join(', ')
    : '';
  const rows: [string, string][] = [
    ['SM clock p50', p50('sm_clock_mhz') === null ? '—' : `${p50('sm_clock_mhz')} MHz`],
    ['Power p50', p50('power_w') === null ? '—' : `${p50('power_w')} W`],
    ['GPU temp p50', p50('gpu_temp_c') === null ? '—' : `${p50('gpu_temp_c')} °C`],
    ['Capped', telemetry.capped === true ? 'yes' : telemetry.capped === false ? 'no' : '—'],
    ['Attempts', String(telemetry.attempts ?? '—')],
    ['Throttle reasons', reasons || 'none'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <Stat key={k} label={k} value={v} />
      ))}
    </div>
  );
}

export function ResultDetail({
  runId,
  result,
  t,
  onClose,
}: {
  runId: string;
  result: OperatorXResult;
  t: OperatorXStrings;
  onClose: () => void;
}) {
  const query = useOperatorXResult(runId, result.index);
  const metrics = query.data?.metrics ?? {};
  const profile = isObj(metrics.profile) ? metrics.profile : null;
  const timeline = (
    profile && Array.isArray(profile.timeline) ? profile.timeline : []
  ) as TimelineEvent[];
  const kernels = (profile && Array.isArray(profile.kernels) ? profile.kernels : []).filter(isObj);
  const telemetry = isObj(metrics.telemetry) ? metrics.telemetry : null;
  const backendMeta = isObj(metrics.backend_meta) ? metrics.backend_meta : null;

  return (
    <aside
      role="dialog"
      aria-label={t.detail}
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[760px] flex-col border-l border-border bg-background shadow-2xl"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[result.status]}`}
            >
              {statusLabel(t, result.status)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {result.opType} · {result.backend} · {result.testlist}
            </span>
          </div>
          <h2 className="font-mono text-sm font-semibold break-all">{result.shape}</h2>
          <p className="text-xs break-words text-muted-foreground">{result.precision}</p>
          {result.name && <p className="text-xs text-muted-foreground">{result.name}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {result.message && (
          <Section title={t.message}>
            <p className="rounded-md border border-border/50 bg-muted/30 p-3 font-mono text-xs break-words">
              {result.message}
            </p>
          </Section>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t.latency} value={formatUs(result.latencyUs)} />
          <Stat label={t.tflops} value={formatTflops(result.tflops)} />
          <Stat
            label={t.graph}
            value={result.cudaGraph === null ? '—' : result.cudaGraph ? 'yes' : 'no'}
          />
          <Stat label={t.kernel} value={result.kernel ? shortKernel(result.kernel) : '—'} />
          {result.timing && (
            <>
              <Stat label={t.span} value={formatUs(result.timing.spanUs)} />
              <Stat label={t.busy} value={formatUs(result.timing.busyUs)} />
              <Stat label={t.overlap} value={formatUs(result.timing.overlapUs)} />
              <Stat label={t.streams} value={String(result.timing.streams)} />
            </>
          )}
        </div>
        {query.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t.loadingDetail}
          </p>
        )}
        {timeline.length > 0 && (
          <Section title={t.timeline}>
            <KernelTimeline events={timeline} streamLabel={t.stream} />
          </Section>
        )}
        {kernels.length > 0 && (
          <Section title={t.kernels}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t.kernel}</th>
                    <th className="py-1 pr-3 text-right font-medium">µs</th>
                    <th className="py-1 pr-3 text-right font-medium">{t.calls}</th>
                    <th className="py-1 pr-3 font-medium">grid / block</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {kernels.map((k, i) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="py-1 pr-3 break-all" title={String(k.name)}>
                        {shortKernel(String(k.name ?? ''))}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">
                        {Number(k.us_per_call ?? 0).toFixed(2)}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">
                        {String(k.count_per_call ?? '')}
                      </td>
                      <td className="py-1 pr-3 whitespace-nowrap text-muted-foreground">
                        {Array.isArray(k.grid) ? k.grid.join('×') : ''} /{' '}
                        {Array.isArray(k.block) ? k.block.join('×') : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
        {backendMeta && (
          <Section title={t.backendMeta}>
            <Json value={backendMeta} />
          </Section>
        )}
        {telemetry && (
          <Section title={t.telemetry}>
            <TelemetrySummary telemetry={telemetry} />
          </Section>
        )}
        <Section title={t.args}>
          <Json value={result.args} />
        </Section>
        {query.data && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {t.rawMetrics}
            </summary>
            <div className="mt-2">
              <Json value={metrics} />
            </div>
          </details>
        )}
      </div>
    </aside>
  );
}
