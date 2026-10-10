'use client';

import { formatNumber } from '@/lib/agentic-workload-explorer/format';
import type { PricingCoverage } from '@/lib/agentic-workload-explorer/api-types';
import { useLocale } from '@/lib/use-locale';

function formatCoverage(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(2)}%`;
}

function coverageColor(value: number | null): string {
  if (value === null) return 'text-muted-foreground';
  if (value >= 0.999) return 'text-emerald-500';
  if (value >= 0.99) return 'text-amber-500';
  return 'text-rose-500';
}

const STRINGS = {
  en: {
    heading: 'Usage with a stored cost estimate',
    description: (days: number) =>
      `Latest ${days} days. Failed or otherwise zero-usage requests are excluded; missing estimates are grouped by the reported model ID below.`,
    requestCoverage: 'Request Coverage',
    inputSideTokenCoverage: 'Input-Side Token Coverage',
    outputTokenCoverage: 'Output Token Coverage',
    priced: 'priced',
    unpriced: 'unpriced',
    tokens: 'tokens',
    allPriced: 'All usage-bearing model IDs have cost estimates.',
    unpricedRegionLabel: 'Unpriced model usage',
    caption: 'Usage-bearing requests without a stored cost estimate, grouped by model.',
    colUnpricedModel: 'Unpriced Model',
    colRequests: 'Requests',
    colInput: 'Input',
    colCacheRead: 'Cache Read',
    colCacheWrite: 'Cache Write',
    colOutput: 'Output',
  },
  zh: {
    heading: '已有成本估算的用量',
    description: (days: number) =>
      `最后 ${days} 天。已排除失败或零用量请求；缺少估算的请求按模型 ID 分组如下。`,
    requestCoverage: '请求覆盖率',
    inputSideTokenCoverage: '输入侧 token 覆盖率',
    outputTokenCoverage: '输出 token 覆盖率',
    priced: '已定价',
    unpriced: '未定价',
    tokens: 'tokens',
    allPriced: '所有产生用量的模型 ID 均已有成本估算。',
    unpricedRegionLabel: '未定价模型用量',
    caption: '无成本估算的用量请求，按模型分组。',
    colUnpricedModel: '未定价模型',
    colRequests: '请求数',
    colInput: '输入',
    colCacheRead: '缓存读取',
    colCacheWrite: '缓存写入',
    colOutput: '输出',
  },
};

function CoverageMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="text-3xs font-mono font-bold uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-mono font-bold ${coverageColor(value)}`}>
        {formatCoverage(value)}
      </div>
      <div className="mt-0.5 text-3xs font-mono text-muted-foreground">{detail}</div>
    </div>
  );
}

export function PricingCoverageCard({ coverage }: { coverage: PricingCoverage }) {
  const t = STRINGS[useLocale()];
  return (
    <div className="rounded-md border border-border bg-surface p-3 space-y-3">
      <div>
        <div className="text-3xs font-mono font-bold text-foreground">{t.heading}</div>
        <p className="mt-0.5 text-3xs font-mono text-subtle">
          {t.description(coverage.windowDays)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CoverageMetric
          label={t.requestCoverage}
          value={coverage.requestCoverage}
          detail={`${formatNumber(coverage.pricedRequestCount)} ${t.priced} · ${formatNumber(coverage.unpricedRequestCount)} ${t.unpriced}`}
        />
        <CoverageMetric
          label={t.inputSideTokenCoverage}
          value={coverage.inputSideTokenCoverage}
          detail={`${formatNumber(coverage.pricedInputSideTokens)} / ${formatNumber(coverage.inputSideTokens)} ${t.tokens}`}
        />
        <CoverageMetric
          label={t.outputTokenCoverage}
          value={coverage.outputTokenCoverage}
          detail={`${formatNumber(coverage.pricedOutputTokens)} / ${formatNumber(coverage.outputTokens)} ${t.tokens}`}
        />
      </div>

      {coverage.byModel.length === 0 ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/8 px-3 py-2 text-2xs font-mono text-emerald-500">
          {t.allPriced}
        </div>
      ) : (
        <div
          role="region"
          aria-label={t.unpricedRegionLabel}
          tabIndex={0}
          className="max-h-64 overflow-auto overscroll-contain focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40"
        >
          <table className="w-full min-w-[680px] text-2xs font-mono">
            <caption className="sr-only">{t.caption}</caption>
            <thead className="sticky top-0 z-10 border-b border-border bg-surface text-muted-foreground">
              <tr>
                <th scope="col" className="py-1.5 text-left font-medium">
                  {t.colUnpricedModel}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {t.colRequests}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {t.colInput}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {t.colCacheRead}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {t.colCacheWrite}
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  {t.colOutput}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {coverage.byModel.map((row) => (
                <tr key={row.model} className="transition-colors hover:bg-surface-hover/70">
                  <th scope="row" className="py-1.5 text-left font-medium text-amber-500">
                    {row.model}
                  </th>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatNumber(row.requestCount)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatNumber(row.inputTokens)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatNumber(row.cacheReadInputTokens)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatNumber(row.cacheWriteTokens)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatNumber(row.outputTokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
