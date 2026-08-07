'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import ChartLegend from '@/components/ui/chart-legend';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import { CollectiveXKvChart } from './CollectiveXKvChart';
import {
  type CollectiveXKvChartSelection,
  type CollectiveXKvRunCase,
  collectiveXKvCell,
  collectiveXKvColorKey,
  collectiveXKvLegendLabel,
  collectiveXRunDasharray,
} from './data';
import type { CollectiveXDataset, CollectiveXOutcome } from './types';

const STRINGS = {
  en: {
    heading: 'KV-cache transfer',
    description:
      'Prefill-to-decode KV handoff (2 nodes x 1 GPU, DeepSeek-V4-Pro cache as vLLM allocates it). ' +
      'Paged rows move per-request layer-major descriptor lists over randomized block tables; ' +
      'bulk is the single-descriptor wire ceiling. GB/s is burst-aggregate pull at the largest ISL; ' +
      'b1/bmax are requests posted per burst.',
    batchCaption: 'at the largest measured ISL',
    islCaption: 'at batch 1',
    yControl: 'Metric',
    xControl: 'X axis',
    pageControl: 'Page size',
    opControl: 'Direction',
  },
  zh: {
    heading: 'KV 缓存传输',
    description:
      '预填充到解码的 KV 交接（2 节点 x 1 GPU，按 vLLM 为 DeepSeek-V4-Pro 分配的缓存布局）。' +
      '分页行按随机块表以逐层描述符列表搬运每个请求；bulk 为单描述符线速上限。' +
      'GB/s 为最大 ISL 处按突发聚合的 pull 带宽；b1/bmax 表示每次突发提交的请求数。',
    batchCaption: '取最大实测 ISL',
    islCaption: '取批大小 1',
    yControl: '指标',
    xControl: 'X 轴',
    pageControl: '页大小',
    opControl: '方向',
  },
} as const;

const OUTCOME_CLASS: Record<CollectiveXOutcome, string> = {
  success: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  unsupported: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  failed: 'border-red-700/50 bg-red-700/10 text-red-800 dark:text-red-300',
  invalid: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
  diagnostic: 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  pending: 'border-zinc-500/40 bg-zinc-500/5 text-muted-foreground',
};

function formatGbps(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : value.toFixed(value >= 100 ? 0 : 2);
}

function cellsOf(row: CollectiveXKvRunCase) {
  return {
    p64b1: collectiveXKvCell(row.rows, 'paged', 64, 'min'),
    p64bmax: collectiveXKvCell(row.rows, 'paged', 64, 'max'),
    p16b1: collectiveXKvCell(row.rows, 'paged', 16, 'min'),
    bulk: collectiveXKvCell(row.rows, 'bulk', null, 'min'),
  };
}

export function CollectiveXKvSection({
  datasets,
  runIndexById,
}: {
  datasets: CollectiveXDataset[];
  /** Selection-order style index per run id, shared with the EP explorer so
   * the same run keeps the same dash pattern on both charts. */
  runIndexById: ReadonlyMap<string, number>;
}) {
  const locale = useLocale();
  const strings = STRINGS[locale === 'zh' ? 'zh' : 'en'];
  const [yAxis, setYAxis] = useState<CollectiveXKvChartSelection['y']>('bandwidth');
  const [xAxis, setXAxis] = useState<CollectiveXKvChartSelection['x']>('batch');
  const [pageTokens, setPageTokens] = useState<'64' | '16'>('64');
  const [op, setOp] = useState<CollectiveXKvChartSelection['op']>('pull');
  // Legend toggles are keyed to the current series set: when checked runs
  // change, the stored selection is stale and every series starts active
  // again (the EP explorer resets the same way).
  const [seriesSelection, setSeriesSelection] = useState<{
    ids: Set<string>;
    signature: string;
  } | null>(null);
  const [legendExpanded, setLegendExpanded] = useState(false);

  const rows = useMemo<CollectiveXKvRunCase[]>(
    () =>
      datasets.flatMap((dataset, index) =>
        (dataset.kv ?? []).map((item) => ({
          ...item,
          run_id: dataset.run.run_id,
          run_index: runIndexById.get(dataset.run.run_id) ?? index,
        })),
      ),
    [datasets, runIndexById],
  );
  const measuredCases = useMemo(() => rows.filter((row) => row.rows.length > 0), [rows]);
  const seriesSignature = useMemo(
    () =>
      measuredCases
        .map((kase) => `${kase.run_id}:${kase.case_id}`)
        .toSorted()
        .join('|'),
    [measuredCases],
  );
  const activeIds = useMemo(
    () =>
      seriesSelection && seriesSelection.signature === seriesSignature
        ? seriesSelection.ids
        : new Set(measuredCases.map((kase) => `${kase.run_id}:${kase.case_id}`)),
    [measuredCases, seriesSelection, seriesSignature],
  );
  const activeCases = useMemo(
    () => measuredCases.filter((kase) => activeIds.has(`${kase.run_id}:${kase.case_id}`)),
    [activeIds, measuredCases],
  );

  const colorKeys = useMemo(
    () => [...new Set(measuredCases.map(collectiveXKvColorKey))],
    [measuredCases],
  );
  const { resolveColor, getCssColor } = useThemeColors({
    highContrast: false,
    activeKeys: colorKeys,
    hcKeys: colorKeys,
    hcVendorKeyFor: (key) => key.split('_')[0],
  });
  const colors = useMemo(
    () => Object.fromEntries(colorKeys.map((key) => [key, getCssColor(resolveColor(key, key))])),
    [colorKeys, getCssColor, resolveColor],
  );

  const legendItems = useMemo(
    () =>
      measuredCases.map((kase) => {
        const seriesId = `${kase.run_id}:${kase.case_id}`;
        return {
          name: seriesId,
          label: collectiveXKvLegendLabel(kase),
          color: colors[collectiveXKvColorKey(kase)] ?? 'var(--muted-foreground)',
          lineDasharray: collectiveXRunDasharray(kase.run_index),
          isActive: activeIds.has(seriesId),
          title: `#${kase.run_id} · ${kase.workload} · ${kase.topology.topology_class}`,
          onClick: () => {
            const next = new Set(activeIds);
            if (next.has(seriesId)) next.delete(seriesId);
            else next.add(seriesId);
            setSeriesSelection({ ids: next, signature: seriesSignature });
            track('collectivex_kv_series_toggled', { series: seriesId });
          },
        };
      }),
    [activeIds, colors, measuredCases],
  );

  const columns = useMemo<DataTableColumn<CollectiveXKvRunCase>[]>(
    () => [
      {
        header: 'Run',
        cell: (row) => <span className="font-mono text-xs">#{row.run_id}</span>,
        sortValue: (row) => Number(row.run_id),
        className: 'whitespace-nowrap',
      },
      { header: 'SKU', cell: (row) => row.sku.toUpperCase(), sortValue: (row) => row.sku },
      {
        header: 'Backend',
        cell: (row) => row.backend,
        sortValue: (row) => row.backend,
        className: 'whitespace-nowrap',
      },
      { header: 'Fabric', cell: (row) => row.fabric, sortValue: (row) => row.fabric },
      { header: 'Workload', cell: (row) => row.workload, sortValue: (row) => row.workload },
      { header: 'Precision', cell: (row) => row.precision, sortValue: (row) => row.precision },
      {
        header: 'Outcome',
        cell: (row) => (
          <div className="min-w-28">
            <Badge variant="outline" className={OUTCOME_CLASS[row.outcome]}>
              {row.outcome}
            </Badge>
            {(row.detail || row.reason) && (
              <p className="mt-1 text-xs text-muted-foreground">{row.detail ?? row.reason}</p>
            )}
          </div>
        ),
        sortValue: (row) => `${row.outcome} ${row.reason ?? ''}`,
      },
      {
        header: 'Bulk GB/s',
        cell: (row) => formatGbps(cellsOf(row).bulk?.gbps_p50),
        sortValue: (row) => cellsOf(row).bulk?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums',
      },
      {
        header: 'p64 GB/s b1',
        cell: (row) => formatGbps(cellsOf(row).p64b1?.gbps_p50),
        sortValue: (row) => cellsOf(row).p64b1?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums',
      },
      {
        header: 'p64 GB/s bmax',
        cell: (row) => {
          const cell = cellsOf(row).p64bmax;
          if (!cell) return '-';
          return `${formatGbps(cell.gbps_p50)} (b${cell.batch})`;
        },
        sortValue: (row) => cellsOf(row).p64bmax?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums whitespace-nowrap',
      },
      {
        header: 'p16 GB/s b1',
        cell: (row) => formatGbps(cellsOf(row).p16b1?.gbps_p50),
        sortValue: (row) => cellsOf(row).p16b1?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums',
      },
      {
        header: 'Handoff ms',
        cell: (row) => {
          const cell = cellsOf(row).p64b1;
          return cell ? cell.latency_ms.p50.toFixed(1) : '-';
        },
        sortValue: (row) => cellsOf(row).p64b1?.latency_ms.p50 ?? -1,
        className: 'text-right tabular-nums',
      },
    ],
    [],
  );

  if (rows.length === 0) return null;
  const measured = rows.filter((row) => row.outcome === 'success').length;
  const selection: CollectiveXKvChartSelection = {
    x: xAxis,
    y: yAxis,
    op,
    pageTokens: Number(pageTokens),
  };
  return (
    <Card data-testid="collectivex-kv-table" className="min-w-0 w-full max-w-full overflow-hidden">
      <h2 className="text-lg font-semibold">{strings.heading}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {rows.length} cases · {measured} measured · {strings.description}
      </p>
      {measuredCases.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{strings.yControl}</Label>
              <SegmentedToggle
                value={yAxis}
                onValueChange={(value) => {
                  setYAxis(value);
                  track('collectivex_kv_metric_changed', { metric: value });
                }}
                ariaLabel="CollectiveX kv metric"
                testId="collectivex-kv-metric-toggle"
                options={[
                  { value: 'bandwidth', label: 'GB/s' },
                  { value: 'latency', label: 'ms' },
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{strings.xControl}</Label>
              <SegmentedToggle
                value={xAxis}
                onValueChange={(value) => {
                  setXAxis(value);
                  track('collectivex_kv_xaxis_changed', { axis: value });
                }}
                ariaLabel="CollectiveX kv x axis"
                testId="collectivex-kv-xaxis-toggle"
                options={[
                  { value: 'batch', label: 'Batch' },
                  { value: 'isl', label: 'ISL' },
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{strings.pageControl}</Label>
              <SegmentedToggle
                value={pageTokens}
                onValueChange={setPageTokens}
                ariaLabel="CollectiveX kv page size"
                testId="collectivex-kv-page-toggle"
                options={[
                  { value: '64', label: '64' },
                  { value: '16', label: '16' },
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{strings.opControl}</Label>
              <SegmentedToggle
                value={op}
                onValueChange={setOp}
                ariaLabel="CollectiveX kv direction"
                testId="collectivex-kv-op-toggle"
                options={[
                  { value: 'pull', label: 'pull' },
                  { value: 'push', label: 'push' },
                ]}
              />
            </div>
          </div>
          <div className="relative mt-3">
            <CollectiveXKvChart
              chartId="collectivex-kv"
              testId="collectivex-kv-chart"
              cases={activeCases}
              colors={colors}
              selection={selection}
              caption={
                <p className="text-sm text-muted-foreground">
                  {op} · page {pageTokens} ·{' '}
                  {xAxis === 'batch' ? strings.batchCaption : strings.islCaption}
                </p>
              }
              legendElement={
                <ChartLegend
                  variant="sidebar"
                  legendItems={legendItems}
                  disableActiveSort
                  isLegendExpanded={legendExpanded}
                  onExpandedChange={setLegendExpanded}
                />
              }
            />
          </div>
        </>
      )}
      <DataTable
        data={rows}
        columns={columns}
        testId="collectivex-kv-table-table"
        analyticsPrefix="collectivex_kv"
      />
    </Card>
  );
}
