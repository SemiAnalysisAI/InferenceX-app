'use client';

import type { ReactNode } from 'react';

import type { PointMeta } from '@/hooks/api/use-trace-server-metrics';
import { isKvOffloadEnabled } from '@/lib/kv-offload';

const fmtPct = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(2)}%`;

function MetaLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/** Selected-point header: config facts (offload, concurrency, cache hit rates, ISL/OSL). */
export function PointSummary({ meta }: { meta: PointMeta }) {
  const showCpuCacheHit = isKvOffloadEnabled(meta);

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-sm text-muted-foreground">
          Selected point
          {meta.disagg ? ' · disagg' : ''}
          {meta.spec_method && meta.spec_method !== 'none' ? ` · spec=${meta.spec_method}` : ''}
        </p>
        {meta.run_url && (
          <a
            href={meta.run_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            GitHub Actions run →
          </a>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetaLine label="Offload" value={(meta.offload_mode ?? 'off').toUpperCase()} />
        <MetaLine label="Concurrency" value={meta.conc} />
        <MetaLine label="GPU cache hit" value={fmtPct(meta.server_gpu_cache_hit_rate)} />
        {showCpuCacheHit && (
          <MetaLine label="CPU cache hit" value={fmtPct(meta.server_cpu_cache_hit_rate)} />
        )}
        {meta.isl !== null && <MetaLine label="ISL" value={meta.isl} />}
        {meta.osl !== null && <MetaLine label="OSL" value={meta.osl} />}
      </div>
    </div>
  );
}
