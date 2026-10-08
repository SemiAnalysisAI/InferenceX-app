'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AgenticMemory } from '@semianalysisai/inferencex-db/queries/agentic-memory';
import {
  MEMORY_FIELDS,
  type MemoryField,
  type MemoryRank,
} from '@semianalysisai/inferencex-db/lib/agentic-memory';
import type { BenchmarkSibling } from '@/hooks/api/use-benchmark-siblings';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { memoryComparisonPeers } from './memory-view-utils';

const STRINGS = {
  en: {
    title: 'GPU memory across concurrency',
    unit: 'Unit',
    rank: 'Reported worker',
    weights: 'Weights / load delta',
    kvPool: 'Allocated KV pool',
    activations: 'Peak activation',
    nonTorch: 'Non-torch',
    graphs: 'CUDA graphs',
    total: 'Device total',
    conc: 'Concurrency',
    note: 'Each row is one reported worker, not a deployment sum. Concurrency counts AgentX clients, not batch size. Startup profiles are not simultaneous runtime measurements.',
    basis:
      'SGLang weights and graphs are free-memory deltas. Unreported components remain unknown. Percentages require a device total in the same worker report.',
    usage: 'KV usage (max across reporting series)',
    tokens: 'KV capacity (reported tokens)',
    loading: 'Loading startup memory reports…',
    missing:
      'No supported allocation report in the scanned log prefixes. Open Logs to inspect the source.',
    unsupported: 'This framework has no verified memory parser yet.',
    truncated:
      'Only the first 256 Ki characters per file are scanned (up to 16 files). Later startup reports or restarts may be absent.',
    error: 'Could not load memory reports.',
    previous: 'Previous',
    next: 'Next',
    source: 'Evidence',
    comparison: 'Same run and topology',
    unknown: 'Unknown',
    unavailable:
      'No matching aggregated-serving points. Disaggregated memory accounting is not enabled.',
    worker: 'Worker for comparison',
    chartNote:
      'Weights / load delta and allocated KV pool on the same scale. Blank values are unknown; repeated worker lifetimes are not combined.',
    poolNote:
      'KV capacity in tokens and maximum usage are kept separate from allocated bytes. No token-to-byte conversion or per-GPU usage estimate is applied.',
  },
  zh: {
    title: '不同并发数下的 GPU 显存',
    unit: '单位',
    rank: '日志中的 worker',
    weights: '权重 / 加载显存增量',
    kvPool: '已分配 KV 池',
    activations: '激活峰值',
    nonTorch: '非 PyTorch 显存',
    graphs: 'CUDA graph',
    total: '设备总显存',
    conc: '并发数',
    note: '每行对应日志中的一个 worker，不是整个部署的总和。并发数表示 AgentX 客户端数量，不是 batch size。启动阶段的显存报告不代表同一时刻的运行时实测。',
    basis:
      'SGLang 的权重和 CUDA graph 数据来自可用显存的变化量。未报告的部分保留为未知；只有同一 worker 的日志报告了设备总显存，才计算百分比。',
    usage: 'KV 使用率（各上报序列的最大值）',
    tokens: 'KV 容量（日志报告的 token 数）',
    loading: '正在加载启动显存报告……',
    missing: '已扫描的日志开头没有受支持的分配报告。可打开日志标签页查看原始日志。',
    unsupported: '此框架暂未提供经过验证的显存解析器。',
    truncated:
      '每个文件仅扫描前 256 Ki 字符，最多读取 16 个文件。后续启动报告或重启记录可能未包含在内。',
    error: '无法加载显存报告。',
    previous: '上一页',
    next: '下一页',
    source: '原始记录',
    comparison: '同次运行、同一拓扑',
    unknown: '未知',
    unavailable: '没有匹配的聚合式推理数据点。分离式部署的显存统计尚未启用。',
    worker: '用于比较的 worker',
    chartNote:
      '权重 / 加载显存增量与已分配 KV 池使用同一刻度。空值表示未知；同名 worker 的多次进程记录不合并。',
    poolNote:
      '以 token 计的 KV 容量、最大使用率和已分配字节数分开展示。不将 token 换算为字节，也不估算逐 GPU 的使用量。',
  },
} as const;
const COLORS: Record<MemoryField, string> = {
  weights: 'bg-blue-600',
  kvPool: 'bg-emerald-600',
  activations: 'bg-amber-500',
  nonTorch: 'bg-slate-500',
  graphs: 'bg-rose-500',
};
const PAGE_SIZE = 8;
const workerKey = (r: MemoryRank) => `${r.file} · ${r.rank}`;

export function MemoryReport({ data, unit }: { data: AgenticMemory; unit: 'GiB' | '%' }) {
  const t = STRINGS[useLocale()];
  const format = (n: number | null) => (n === null ? t.unknown : n.toFixed(2));
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3" data-testid="memory-report">
      <h3 className="font-semibold">
        {t.conc} {data.conc} · #{data.id} · {data.framework}
      </h3>
      <p className="text-xs text-muted-foreground break-all">
        {data.date} · {data.model} · {data.hardware} · {data.image ?? t.unknown}
      </p>
      {data.status === 'reported' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr>
                <th className="p-2">{t.rank}</th>
                {MEMORY_FIELDS.map((f) => (
                  <th className="p-2" key={f}>
                    {t[f]} ({unit})
                  </th>
                ))}
                <th className="p-2">{t.total} (GiB)</th>
              </tr>
            </thead>
            <tbody>
              {data.ranks.map((r) => (
                <tr key={`${r.file}/${r.rank}/${r.process}`} className="border-t">
                  <th className="p-2 font-normal">
                    {r.rank}
                    {r.process ? ` (${r.process})` : ''}
                  </th>
                  {MEMORY_FIELDS.map((f) => (
                    <td key={f} className="p-2 tabular-nums">
                      {format((unit === '%' ? r.percent : r.gib)[f])}
                    </td>
                  ))}
                  <td className="p-2 tabular-nums">{format(r.totalGiB)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm">{t[data.status]}</p>
      )}
      {data.ranks
        .filter((r) => r.totalGiB !== null && r.weightBasis === 'profile')
        .map((r) => (
          <RankBar key={`${r.file}/${r.rank}/${r.process}`} rank={r} />
        ))}
      <p className="text-xs text-muted-foreground">
        {t.tokens}: {data.kvPoolTokens?.toLocaleString() ?? t.unknown} · {t.usage}:{' '}
        {data.kvUsageMaxFraction === null
          ? t.unknown
          : `${(data.kvUsageMaxFraction * 100).toFixed(1)}%`}
      </p>
      {(data.filesOmitted > 0 || data.files.some((f) => f.truncated)) && (
        <p className="text-xs text-muted-foreground">{t.truncated}</p>
      )}
      {data.ranks.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">{t.source}</summary>
          {data.ranks.map((r) => (
            <div key={`${r.file}/${r.rank}/${r.process}`} className="mt-2">
              <p className="text-xs break-all">
                {r.file} · {r.rank}
              </p>
              <pre className="text-xs whitespace-pre-wrap break-words">
                {r.evidence.map((e) => `${e.line}: ${e.text}`).join('\n')}
              </pre>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

function RankBar({ rank }: { rank: MemoryRank }) {
  const t = STRINGS[useLocale()];
  // Missing components are blank, never relabeled as measured "free memory".
  const sum = MEMORY_FIELDS.reduce((n, f) => n + (rank.percent[f] ?? 0), 0);
  if (sum > 100) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        {rank.rank} · {rank.totalGiB?.toFixed(2)} GiB
      </p>
      <div
        className="flex h-6 w-full bg-muted rounded overflow-hidden"
        role="img"
        aria-label={MEMORY_FIELDS.map(
          (f) => `${t[f]}: ${rank.percent[f]?.toFixed(2) ?? t.unknown}%`,
        ).join(', ')}
      >
        {MEMORY_FIELDS.map(
          (f) =>
            rank.percent[f] !== null && (
              <div
                key={f}
                className={COLORS[f]}
                style={{ width: `${rank.percent[f]}%` }}
                title={`${t[f]}: ${rank.gib[f]} GiB (${rank.percent[f]?.toFixed(2)}%)`}
              />
            ),
        )}
      </div>
    </div>
  );
}

export function MemoryView({ id, siblings }: { id: number; siblings: BenchmarkSibling[] }) {
  const t = STRINGS[useLocale()];
  const [unit, setUnit] = useState<'GiB' | '%'>('GiB');
  const [page, setPage] = useState(0);
  const [worker, setWorker] = useState('');
  const peers = memoryComparisonPeers(id, siblings);
  const ids = peers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r) => r.id);
  const query = useQuery({
    queryKey: ['agentic-memory', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const reports: AgenticMemory[] = [];
      // Keep concurrency bounded even for large SKU sweeps.
      for (const pointId of ids) {
        const res = await fetch(`/api/v1/agentic-memory?id=${pointId}`, { signal });
        if (!res.ok) throw new Error(`agentic-memory ${res.status}`);
        reports.push(await res.json());
      }
      return reports;
    },
  });
  return (
    <div className="space-y-4" data-testid="memory-view">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <label className="text-sm">
          {t.unit}{' '}
          <select
            aria-label={t.unit}
            className="rounded border bg-background p-2"
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value as 'GiB' | '%');
              track('inference_memory_unit_changed', { unit: e.target.value });
            }}
          >
            <option>GiB</option>
            <option>%</option>
          </select>
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        {t.note} {t.basis}
      </p>
      <p className="text-sm text-muted-foreground">{t.poolNote}</p>
      <div className="flex flex-wrap gap-3 text-xs">
        {MEMORY_FIELDS.map((f) => (
          <span key={f} className="inline-flex gap-1 items-center">
            <span className={`size-3 ${COLORS[f]}`} />
            {t[f]}
          </span>
        ))}
      </div>
      <p className="text-sm">
        {t.comparison} · {peers.length}
      </p>
      {peers.length === 0 && <p className="text-sm">{t.unavailable}</p>}
      {query.isLoading && <p role="status">{t.loading}</p>}
      {query.isError && (
        <RetryableQueryError
          message={t.error}
          analyticsEvent="inference_memory_retry"
          onRetry={query.refetch}
          testId="memory-query-error"
        />
      )}
      {query.data && (
        <MemoryComparison data={query.data} unit={unit} worker={worker} onWorker={setWorker} />
      )}
      {query.data?.map((data) => (
        <MemoryReport key={data.id} data={data} unit={unit} />
      ))}
      {peers.length > PAGE_SIZE && (
        <div className="flex items-center gap-4 text-sm">
          <button
            className="border rounded px-3 py-2 disabled:opacity-40"
            disabled={page === 0}
            onClick={() => {
              setPage(page - 1);
              track('inference_memory_page_changed');
            }}
          >
            {t.previous}
          </button>
          <span>
            {page + 1} / {Math.ceil(peers.length / PAGE_SIZE)}
          </span>
          <button
            className="border rounded px-3 py-2 disabled:opacity-40"
            disabled={(page + 1) * PAGE_SIZE >= peers.length}
            onClick={() => {
              setPage(page + 1);
              track('inference_memory_page_changed');
            }}
          >
            {t.next}
          </button>
        </div>
      )}
    </div>
  );
}

function MemoryComparison({
  data,
  unit,
  worker,
  onWorker,
}: {
  data: AgenticMemory[];
  unit: 'GiB' | '%';
  worker: string;
  onWorker: (value: string) => void;
}) {
  const t = STRINGS[useLocale()];
  const workers = [...new Set(data.flatMap((d) => d.ranks.map(workerKey)))].sort();
  const selected = workers.includes(worker) ? worker : (workers[0] ?? '');
  const rows = data.map((d) => {
    const ranks = d.ranks.filter((r) => workerKey(r) === selected);
    const r = ranks.length === 1 ? ranks[0] : null;
    return { id: d.id, conc: d.conc, values: r ? (unit === '%' ? r.percent : r.gib) : null };
  });
  const max =
    unit === '%'
      ? 100
      : Math.max(1, ...rows.flatMap((r) => [r.values?.weights ?? 0, r.values?.kvPool ?? 0]));
  if (workers.length === 0) return null;
  return (
    <section className="rounded-lg border bg-card p-4 space-y-3" data-testid="memory-comparison">
      <label className="text-sm flex flex-wrap gap-2 items-center">
        {t.worker}
        <select
          aria-label={t.worker}
          className="min-w-0 max-w-full rounded border bg-background p-2"
          value={selected}
          onChange={(e) => {
            onWorker(e.target.value);
            track('inference_memory_worker_changed', { worker: e.target.value });
          }}
        >
          {workers.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">{t.chartNote}</p>
      {rows.map((r) => (
        <div className="grid grid-cols-[5rem_1fr] gap-3 items-center" key={r.id}>
          <span className="text-sm">
            {t.conc} {r.conc}
          </span>
          <div className="space-y-1">
            {(['weights', 'kvPool'] as const).map((field) => {
              const value = r.values?.[field] ?? null;
              return (
                <div key={field} className="flex items-center gap-2 text-xs">
                  <div className="h-4 bg-muted flex-1 relative">
                    {value !== null && (
                      <div
                        className={`h-full ${COLORS[field]}`}
                        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
                      />
                    )}
                  </div>
                  <span className="w-24 tabular-nums" aria-label={t[field]}>
                    {value === null ? t.unknown : `${value.toFixed(2)} ${unit}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
