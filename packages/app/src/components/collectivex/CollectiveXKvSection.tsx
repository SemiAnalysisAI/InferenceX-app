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
import { CollectiveXKvFrontierChart } from './CollectiveXKvFrontierChart';
import { CollectiveXKvOverlapChart } from './CollectiveXKvOverlapChart';
import {
  type CollectiveXKvChartSelection,
  type CollectiveXKvRunCase,
  collectiveXKvCell,
  collectiveXKvColorKey,
  collectiveXKvIslValues,
  collectiveXKvLegendLabel,
  collectiveXKvPageValues,
  collectiveXRunDasharray,
  collectiveXSkuLabel,
} from './data';
import type { CollectiveXDataset, CollectiveXOutcome } from './types';

const STRINGS = {
  en: {
    heading: 'KV-cache transfer',
    description:
      'Prefill-to-decode KV handoff (2 nodes x 1 GPU, DeepSeek-V4-Pro cache as vLLM allocates it). ' +
      'Paged rows move packed block-major descriptor lists over randomized block tables: one ' +
      'contiguous descriptor per physical block per cache group, matching the production NIXL path. ' +
      'Bulk is the single-descriptor contiguous baseline (host-observed goodput, not proven wire ' +
      'utilization). GB/s is burst-aggregate pull at the largest ISL; b1/bmax are requests posted per burst.',
    batchCaption: 'at the largest measured ISL',
    islCaption: 'at batch 1',
    frontierCaption:
      'every measured (ISL, batch) rung is a point; each solid or dashed line traces the ' +
      'backend at its best batch for every ISL, so higher is better. The dotted line above ' +
      'each backend is its contiguous baseline: the same bytes moved as one contiguous ' +
      'descriptor through the same backend call, a host-observed goodput reference rather ' +
      'than a proven physical link rate. The gap between a paged rung and its baseline is ' +
      'the cost of the packed multi-descriptor path. Hover a point for its share of the baseline.',
    frontierCaptionWithoutCeilings:
      'every measured (ISL, batch) rung is a point; each line traces the backend at its best ' +
      'batch for every ISL, so higher is better. A backend that overlaps requests lifts its ' +
      'line well above its batch-1 points; hover a point for its batch, latency, and status.',
    frontierOption: 'Envelope',
    overlapOption: 'Overlap gain',
    overlapCaption:
      'aggregate bandwidth relative to batch 1 at the selected ISL (Max reads each backend at ' +
      'its largest measured ISL); the dotted ideal is y = batch. A perfect overlapper tracks ' +
      'the ideal until the wire saturates; a serializing backend stays flat at 1. Backends ' +
      'without a batch-1 rung at the selected ISL are hidden.',
    yControl: 'Metric',
    xControl: 'X axis',
    pageControl: 'Page size',
    opControl: 'Direction',
    islControl: 'ISL',
    islMaxOption: 'Max',
    metricAriaLabel: 'CollectiveX KV metric',
    xAriaLabel: 'CollectiveX KV X axis',
    pageAriaLabel: 'CollectiveX KV page size',
    opAriaLabel: 'CollectiveX KV direction',
    islAriaLabel: 'CollectiveX KV overlap ISL',
    xLogScale: 'X-axis Log Scale',
    yLogScale: 'Y-axis Log Scale',
    bulkBaseline: 'Bulk Contiguous Baseline',
  },
  zh: {
    heading: 'KV 缓存传输',
    description:
      '预填充到解码的 KV 交接（2 节点 x 1 GPU，按 vLLM 为 DeepSeek-V4-Pro 分配的缓存布局）。' +
      '分页行按随机块表以块主序打包描述符列表搬运每个请求：每个缓存组的每个物理块对应一个连续描述符，' +
      '与生产 NIXL 路径一致。bulk 为单描述符连续传输基线（主机侧观测的有效吞吐，并非实测物理链路利用率）。' +
      'GB/s 为最大 ISL 处按突发聚合的 pull 带宽；b1/bmax 表示每次突发提交的请求数。',
    batchCaption: '取最大实测 ISL',
    islCaption: '取批大小 1',
    frontierCaption:
      '每个实测 (ISL, 批大小) 组合都是一个点；实线或虚线取该后端在各 ISL 下的最优批大小，越高越优。' +
      '每个后端上方的点状线是其连续传输基线：同样的字节量经同一后端调用以单个连续描述符搬运，' +
      '是主机侧观测的有效吞吐参考，而非实测物理链路速率。' +
      '分页组合与基线之间的差距即打包多描述符路径的开销。悬停数据点可查看其相对基线的比例。',
    frontierCaptionWithoutCeilings:
      '每个实测 (ISL, 批大小) 组合都是一个点；每条线取该后端在各 ISL 下的最优批大小，越高越优。' +
      '能重叠请求的后端其线会明显高于批大小 1 的点；悬停可查看批大小、延迟与状态。',
    frontierOption: '带宽包络',
    overlapOption: '重叠增益',
    overlapCaption:
      '相对批大小 1 的聚合带宽，取所选 ISL（“最大”表示各后端取其最大实测 ISL）；虚线为理想值 y = 批大小。' +
      '完全重叠请求的后端会贴着理想线直到线速饱和；串行处理的后端保持在 1。' +
      '在所选 ISL 处没有批大小 1 数据的后端将被隐藏。',
    yControl: '指标',
    xControl: 'X 轴',
    pageControl: '页大小',
    opControl: '方向',
    islControl: 'ISL',
    islMaxOption: '最大',
    metricAriaLabel: 'CollectiveX KV 指标',
    xAriaLabel: 'CollectiveX KV X 轴',
    pageAriaLabel: 'CollectiveX KV 页大小',
    opAriaLabel: 'CollectiveX KV 传输方向',
    islAriaLabel: 'CollectiveX KV 重叠增益 ISL',
    xLogScale: 'X 轴对数缩放',
    yLogScale: 'Y 轴对数缩放',
    bulkBaseline: 'Bulk 连续传输基线',
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

function formatIsl(value: number): string {
  return value >= 1024 && value % 1024 === 0 ? `${value / 1024}k` : String(value);
}

function cellsOf(row: CollectiveXKvRunCase, primaryPage: number, secondaryPage?: number) {
  return {
    pb1: collectiveXKvCell(row.rows, 'paged', primaryPage, 'min'),
    pbmax: collectiveXKvCell(row.rows, 'paged', primaryPage, 'max'),
    sb1:
      secondaryPage === undefined
        ? null
        : collectiveXKvCell(row.rows, 'paged', secondaryPage, 'min'),
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
  const [xAxis, setXAxis] = useState<CollectiveXKvChartSelection['x'] | 'frontier' | 'overlap'>(
    'batch',
  );
  // The page ladder lives in the data (the sweep moved from 64/16 to the
  // production block 256); a stored choice the current rows no longer carry
  // falls back to the largest measured page rather than an empty chart.
  const [pageChoice, setPageChoice] = useState<string | null>(null);
  const [op, setOp] = useState<CollectiveXKvChartSelection['op']>('pull');
  // Overlap view only: 'max' normalizes each series at its own largest
  // measured ISL; a numeric string pins every series to that ISL.
  const [overlapIsl, setOverlapIsl] = useState<string>('max');
  const [xLogScale, setXLogScale] = useState(true);
  const [yLogScale, setYLogScale] = useState(true);
  const [showWireCeilings, setShowWireCeilings] = useState(true);
  // Legend toggles are keyed to the current series set: when checked runs
  // change, the stored selection is stale and every series starts active
  // again (the EP explorer resets the same way).
  const [seriesSelection, setSeriesSelection] = useState<{
    ids: Set<string>;
    signature: string;
  } | null>(null);
  // Default open: with the closable sidebar panel, `false` now means fully
  // hidden (reopen button only), so the legend must start expanded.
  const [legendExpanded, setLegendExpanded] = useState(true);

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
  const pageValues = useMemo(() => collectiveXKvPageValues(measuredCases), [measuredCases]);
  const pageTokens =
    pageChoice !== null && pageValues.includes(Number(pageChoice))
      ? Number(pageChoice)
      : (pageValues[0] ?? 64);
  // Table cells always read the ladder's top page (and the runner-up when one
  // exists) so the columns stay stable while the chart toggle moves.
  const primaryPage = pageValues[0] ?? 64;
  const secondaryPage = pageValues[1];
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
  // ISL options come from all measured cases (not the legend-active subset)
  // so the selector is stable while series are toggled. A stored value that
  // no longer exists for the current direction and page size falls back to
  // 'max' rather than an empty chart.
  const overlapIslValues = useMemo(
    () => collectiveXKvIslValues(measuredCases, { op, pageTokens }),
    [measuredCases, op, pageTokens],
  );
  const effectiveOverlapIsl =
    overlapIsl !== 'max' && overlapIslValues.includes(Number(overlapIsl))
      ? Number(overlapIsl)
      : undefined;

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
      { header: 'SKU', cell: (row) => collectiveXSkuLabel(row.sku), sortValue: (row) => row.sku },
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
        cell: (row) => formatGbps(cellsOf(row, primaryPage).bulk?.gbps_p50),
        sortValue: (row) => cellsOf(row, primaryPage).bulk?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums',
      },
      {
        header: `p${primaryPage} GB/s b1`,
        cell: (row) => formatGbps(cellsOf(row, primaryPage).pb1?.gbps_p50),
        sortValue: (row) => cellsOf(row, primaryPage).pb1?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums',
      },
      {
        header: `p${primaryPage} GB/s bmax`,
        cell: (row) => {
          const cell = cellsOf(row, primaryPage).pbmax;
          if (!cell) return '-';
          return `${formatGbps(cell.gbps_p50)} (b${cell.batch})`;
        },
        sortValue: (row) => cellsOf(row, primaryPage).pbmax?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums whitespace-nowrap',
      },
      ...(secondaryPage === undefined
        ? []
        : [
            {
              header: `p${secondaryPage} GB/s b1`,
              cell: (row) => formatGbps(cellsOf(row, primaryPage, secondaryPage).sb1?.gbps_p50),
              sortValue: (row) => cellsOf(row, primaryPage, secondaryPage).sb1?.gbps_p50 ?? -1,
              className: 'text-right tabular-nums',
            } satisfies DataTableColumn<CollectiveXKvRunCase>,
          ]),
      {
        header: 'Handoff ms',
        cell: (row) => {
          const cell = cellsOf(row, primaryPage).pb1;
          return cell ? cell.latency_ms.p50.toFixed(1) : '-';
        },
        sortValue: (row) => cellsOf(row, primaryPage).pb1?.latency_ms.p50 ?? -1,
        className: 'text-right tabular-nums',
      },
    ],
    [primaryPage, secondaryPage],
  );

  if (rows.length === 0) return null;
  const measured = rows.filter((row) => row.outcome === 'success').length;
  const selection: CollectiveXKvChartSelection = {
    x: xAxis === 'batch' || xAxis === 'isl' ? xAxis : 'batch',
    y: yAxis,
    op,
    pageTokens,
  };
  const legendSwitches = [
    {
      id: 'collectivex-kv-x-log-scale',
      label: strings.xLogScale,
      advanced: true,
      checked: xLogScale,
      onCheckedChange: (checked: boolean) => {
        setXLogScale(checked);
        track('collectivex_kv_x_log_scale_toggled', { enabled: checked });
      },
    },
    {
      id: 'collectivex-kv-y-log-scale',
      label: strings.yLogScale,
      advanced: true,
      checked: yLogScale,
      onCheckedChange: (checked: boolean) => {
        setYLogScale(checked);
        track('collectivex_kv_y_log_scale_toggled', { enabled: checked });
      },
    },
  ];
  const envelopeLegendSwitches = [
    ...legendSwitches,
    {
      id: 'collectivex-kv-bulk-wire-ceiling',
      label: strings.bulkBaseline,
      advanced: true,
      checked: showWireCeilings,
      onCheckedChange: (checked: boolean) => {
        setShowWireCeilings(checked);
        track('collectivex_kv_bulk_wire_ceiling_toggled', { enabled: checked });
      },
    },
  ];
  return (
    <Card data-testid="collectivex-kv-table" className="min-w-0 w-full max-w-full overflow-hidden">
      <h2 className="text-lg font-semibold">{strings.heading}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {rows.length} cases · {measured} measured · {strings.description}
      </p>
      {measuredCases.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
            {(xAxis === 'batch' || xAxis === 'isl') && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{strings.yControl}</Label>
                <SegmentedToggle
                  value={yAxis}
                  onValueChange={(value) => {
                    setYAxis(value);
                    track('collectivex_kv_metric_changed', { metric: value });
                  }}
                  ariaLabel={strings.metricAriaLabel}
                  testId="collectivex-kv-metric-toggle"
                  options={[
                    { value: 'bandwidth', label: 'GB/s' },
                    { value: 'latency', label: 'ms' },
                  ]}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{strings.xControl}</Label>
              <SegmentedToggle
                value={xAxis}
                onValueChange={(value) => {
                  setXAxis(value);
                  track('collectivex_kv_xaxis_changed', { axis: value });
                }}
                ariaLabel={strings.xAriaLabel}
                testId="collectivex-kv-xaxis-toggle"
                options={[
                  { value: 'batch', label: 'Batch' },
                  { value: 'isl', label: 'ISL' },
                  { value: 'frontier', label: strings.frontierOption },
                  { value: 'overlap', label: strings.overlapOption },
                ]}
              />
            </div>
            {pageValues.length > 1 && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{strings.pageControl}</Label>
                <SegmentedToggle
                  value={String(pageTokens)}
                  onValueChange={setPageChoice}
                  ariaLabel={strings.pageAriaLabel}
                  testId="collectivex-kv-page-toggle"
                  options={pageValues.map((value) => ({
                    value: String(value),
                    label: String(value),
                  }))}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{strings.opControl}</Label>
              <SegmentedToggle
                value={op}
                onValueChange={setOp}
                ariaLabel={strings.opAriaLabel}
                testId="collectivex-kv-op-toggle"
                options={[
                  { value: 'pull', label: 'pull' },
                  { value: 'push', label: 'push' },
                ]}
              />
            </div>
            {xAxis === 'overlap' && overlapIslValues.length > 0 && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{strings.islControl}</Label>
                <SegmentedToggle
                  value={effectiveOverlapIsl === undefined ? 'max' : String(effectiveOverlapIsl)}
                  onValueChange={(value) => {
                    setOverlapIsl(value);
                    track('collectivex_kv_overlap_isl_changed', { isl: value });
                  }}
                  ariaLabel={strings.islAriaLabel}
                  testId="collectivex-kv-overlap-isl-toggle"
                  options={[
                    { value: 'max', label: strings.islMaxOption },
                    ...overlapIslValues.map((value) => ({
                      value: String(value),
                      label: formatIsl(value),
                    })),
                  ]}
                />
              </div>
            )}
          </div>
          <div className="relative mt-3">
            {xAxis === 'frontier' ? (
              <CollectiveXKvFrontierChart
                chartId="collectivex-kv-frontier"
                testId="collectivex-kv-frontier-chart"
                cases={activeCases}
                colors={colors}
                selection={{ op, pageTokens }}
                xLogScale={xLogScale}
                yLogScale={yLogScale}
                showWireCeilings={showWireCeilings}
                caption={
                  <p className="text-sm text-muted-foreground">
                    {op} · page {pageTokens} ·{' '}
                    {showWireCeilings
                      ? strings.frontierCaption
                      : strings.frontierCaptionWithoutCeilings}
                  </p>
                }
                legendElement={
                  <ChartLegend
                    variant="sidebar"
                    legendItems={legendItems}
                    switches={envelopeLegendSwitches}
                    disableActiveSort
                    isLegendExpanded={legendExpanded}
                    onExpandedChange={setLegendExpanded}
                  />
                }
              />
            ) : xAxis === 'overlap' ? (
              <CollectiveXKvOverlapChart
                chartId="collectivex-kv-overlap"
                testId="collectivex-kv-overlap-chart"
                cases={activeCases}
                colors={colors}
                selection={{ op, pageTokens, isl: effectiveOverlapIsl }}
                caption={
                  <p className="text-sm text-muted-foreground">
                    {op} · page {pageTokens} · ISL{' '}
                    {effectiveOverlapIsl === undefined
                      ? strings.islMaxOption
                      : formatIsl(effectiveOverlapIsl)}{' '}
                    · {strings.overlapCaption}
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
            ) : (
              <CollectiveXKvChart
                chartId="collectivex-kv"
                testId="collectivex-kv-chart"
                cases={activeCases}
                colors={colors}
                selection={selection}
                xLogScale={xLogScale}
                yLogScale={yLogScale}
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
                    switches={legendSwitches}
                    disableActiveSort
                    isLegendExpanded={legendExpanded}
                    onExpandedChange={setLegendExpanded}
                  />
                }
              />
            )}
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
