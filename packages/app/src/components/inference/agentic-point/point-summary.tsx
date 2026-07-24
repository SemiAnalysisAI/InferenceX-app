'use client';

import type { ReactNode } from 'react';

import type { PointMeta } from '@/hooks/api/use-trace-server-metrics';
import type { Locale } from '@/lib/i18n';
import { isKvOffloadEnabled } from '@/lib/kv-offload';
import { useLocale } from '@/lib/use-locale';
import {
  offloadTypeLabel,
  versionedComponentLabel,
} from '@/components/inference/utils/runtime-metadata-labels';

const STRINGS = {
  en: {
    selectedPoint: 'Selected point',
    disagg: 'disagg',
    githubRun: 'GitHub Actions run →',
    offloadType: 'Offload Type',
    offloadBackend: 'KV Offload Engine',
    transferEngine: 'KV Transfer Engine',
    router: 'Router',
    concurrency: 'Concurrency',
    gpuCacheHit: 'GPU cache hit',
    cpuCacheHit: 'CPU cache hit',
    enabledLegacy: 'Enabled (legacy data)',
    disabledLegacy: 'Disabled (legacy data)',
    none: 'None',
  },
  zh: {
    selectedPoint: '已选数据点',
    disagg: '解耦',
    githubRun: 'GitHub Actions 运行 →',
    offloadType: '卸载类型',
    offloadBackend: 'KV 卸载引擎',
    transferEngine: 'KV 传输引擎',
    router: '路由器',
    concurrency: '并发数',
    gpuCacheHit: 'GPU Cache 命中率',
    cpuCacheHit: 'CPU Cache 命中率',
    enabledLegacy: '已启用（旧版数据）',
    disabledLegacy: '已禁用（旧版数据）',
    none: '无',
  },
} as const;

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

function offloadDisplay(meta: PointMeta, locale: Locale): string {
  const t = STRINGS[locale];
  const type = meta.kv_offloading?.trim();
  if (type) return type.toLowerCase() === 'none' ? t.none : offloadTypeLabel(type);
  if (!meta.offload_mode) return t.none;
  return meta.offload_mode.toLowerCase() === 'on' ? t.enabledLegacy : t.disabledLegacy;
}

/** Selected-point header: runtime components, concurrency, cache hit rates, and ISL/OSL. */
export function PointSummary({ meta }: { meta: PointMeta }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const showCpuCacheHit = isKvOffloadEnabled(meta);
  const offloadBackend = versionedComponentLabel(
    meta.kv_offload_backend,
    meta.kv_offload_backend_version,
  );
  const transferEngine = versionedComponentLabel(meta.kv_p2p_transfer, null);
  const router = versionedComponentLabel(meta.router_name, meta.router_version);

  return (
    <div className="mb-4" data-testid="point-summary">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-sm text-muted-foreground">
          {t.selectedPoint}
          {meta.disagg ? ` · ${t.disagg}` : ''}
          {meta.spec_method && meta.spec_method !== 'none' ? ` · spec=${meta.spec_method}` : ''}
        </p>
        {meta.run_url && (
          <a
            href={meta.run_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {t.githubRun}
          </a>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetaLine label={t.offloadType} value={offloadDisplay(meta, locale)} />
        {offloadBackend && <MetaLine label={t.offloadBackend} value={offloadBackend} />}
        {transferEngine && <MetaLine label={t.transferEngine} value={transferEngine} />}
        {router && <MetaLine label={t.router} value={router} />}
        <MetaLine label={t.concurrency} value={meta.conc} />
        <MetaLine label={t.gpuCacheHit} value={fmtPct(meta.server_gpu_cache_hit_rate)} />
        {showCpuCacheHit && (
          <MetaLine label={t.cpuCacheHit} value={fmtPct(meta.server_cpu_cache_hit_rate)} />
        )}
        {meta.isl !== null && <MetaLine label="ISL" value={meta.isl} />}
        {meta.osl !== null && <MetaLine label="OSL" value={meta.osl} />}
      </div>
    </div>
  );
}
