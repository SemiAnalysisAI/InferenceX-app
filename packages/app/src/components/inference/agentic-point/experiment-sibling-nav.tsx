'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from '@/lib/i18n/use-locale';
import { useClientSearchParams } from '@/hooks/useClientSearch';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import {
  experimentBenchmarkRows,
  experimentDetailHref,
  type ExperimentResponse,
} from '@/lib/benchmarks/experiment-benchmarks';
import { SiblingNav, type SiblingNavPoint } from './sibling-nav';

const STRINGS = {
  en: { loading: 'Loading points…', error: 'Failed to load other points' },
  zh: { loading: '正在加载数据点……', error: '无法加载其他数据点' },
};

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function ExperimentSiblingNav({ campaign, runId }: { campaign: string; runId: string }) {
  const locale = useLocale();
  const params = useClientSearchParams();
  const t = STRINGS[locale];
  const query = useQuery({
    queryKey: ['experiment', campaign],
    queryFn: async ({ signal }): Promise<ExperimentResponse> => {
      const response = await fetch(`/api/v1/experiments/${encodeURIComponent(campaign)}`, {
        signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Points unavailable (${response.status})`);
      return response.json();
    },
    staleTime: 0,
  });
  const current = query.data?.runs.find((run) => run.run_id === runId);
  const siblings = useMemo((): SiblingNavPoint[] => {
    if (!query.data || !current) return [];
    const rows = experimentBenchmarkRows(query.data);
    return query.data.runs
      .flatMap((run, index) => {
        if (run.series !== current.series) return [];
        const row = rows[index];
        return [
          {
            id: run.run_id,
            conc: run.concurrency,
            offload_mode: row.offload_mode,
            decode_tp: row.decode_tp,
            decode_ep: row.decode_ep,
            decode_pp: numberOrNull(run.metrics.pp),
            decode_dcp_size: numberOrNull(run.metrics.dcp_size),
            decode_pcp_size: numberOrNull(run.metrics.pcp_size),
            decode_dp_attention: row.decode_dp_attention,
            decode_num_workers: row.decode_num_workers,
            prefill_tp: row.prefill_tp,
            prefill_ep: row.prefill_ep,
            prefill_pp: numberOrNull(run.metrics.pp),
            prefill_dcp_size: numberOrNull(run.metrics.dcp_size),
            prefill_pcp_size: numberOrNull(run.metrics.pcp_size),
            prefill_dp_attention: row.prefill_dp_attention,
            prefill_num_workers: row.prefill_num_workers,
            num_prefill_gpu: row.num_prefill_gpu,
            num_decode_gpu: row.num_decode_gpu,
            disagg: row.disagg,
            is_multinode: row.is_multinode,
            tput_per_gpu: numberOrNull(run.plot_metrics.uncached_tps_gpu),
            total_requests: numberOrNull(run.metrics.total_requests_completed),
            is_current: run.run_id === runId,
            has_trace: true,
          },
        ];
      })
      .toSorted((a, b) => a.conc - b.conc || String(a.id).localeCompare(String(b.id)));
  }, [query.data, current, runId]);
  if (query.isError)
    return (
      <RetryableQueryError
        message={t.error}
        analyticsEvent="inference_experiment_siblings_retry_clicked"
        onRetry={query.refetch}
        testId="experiment-siblings-query-error"
      />
    );
  if (!current)
    return query.isLoading ? <p className="text-sm text-muted-foreground">{t.loading}</p> : null;
  return (
    <div data-testid="experiment-sibling-nav">
      <SiblingNav
        sku={{
          hardware: 'b300',
          model: 'kimik3',
          precision: 'fp4',
          framework: current.series === 'weka' ? 'WEKA AMG' : 'Internal Mooncake DRAM',
          date: String(current.configuration.date ?? ''),
        }}
        siblings={siblings}
        pointHref={(id) => {
          const href = `${locale === 'zh' ? '/zh' : ''}${experimentDetailHref(campaign, String(id))}`;
          return params.get('view') === 'timeline' ? `${href}?view=timeline` : href;
        }}
      />
    </div>
  );
}
