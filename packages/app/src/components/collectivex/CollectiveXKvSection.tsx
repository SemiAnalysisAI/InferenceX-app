'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import ChartLegend from '@/components/ui/chart-legend';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

import { CollectiveXKvChart } from './CollectiveXKvChart';
import { CollectiveXKvFrontierChart } from './CollectiveXKvFrontierChart';
import { CollectiveXKvOverlapChart } from './CollectiveXKvOverlapChart';
import {
  type CollectiveXKvChartSelection,
  type CollectiveXKvRunCase,
  collectiveXBackendLabel,
  collectiveXKvCaseOp,
  collectiveXKvCell,
  collectiveXKvColorKey,
  collectiveXKvIslValues,
  collectiveXKvLegendLabel,
  collectiveXKvRangeBands,
  collectiveXRunDasharray,
  collectiveXSkuLabel,
} from './data';
import type { CollectiveXDataset, CollectiveXOutcome } from './types';

const STRINGS = {
  en: {
    heading: 'KV-cache transfer',
    description:
      'The prefill-to-decode handoff of one DeepSeek-V4-Pro request between GPUs on two nodes, ' +
      "driven the way vLLM 0.32.0's own connectors drive each library. Each request moves the " +
      'blocks the decode side lists for it, whole cache rows over randomized block tables, so ' +
      'every library moves the same bytes and GB/s compares directly. A burst posts batch ' +
      'requests together. Contiguous moves the same bytes as one region per request, a ' +
      'host-observed goodput reference. Every timed transfer is verified.',
    candidateNote:
      'Candidate libraries are measured on the shape their vLLM connector posts but cannot ' +
      'serve DeepSeek-V4 in vLLM 0.32.0 yet.',
    batchCaption: 'at the ISL with the widest batch sweep',
    islCaption: 'one request (batch 1)',
    frontierCaption:
      'every measured (ISL, batch) rung is a point; each solid or dashed line traces the ' +
      'library at its best batch for every ISL, so higher is better. The dotted line above ' +
      'each library is its contiguous baseline: the same bytes moved as one region through ' +
      'the same library call, a host-observed goodput reference rather than a proven link ' +
      'rate. Hover a point for its share of the baseline.',
    frontierCaptionWithoutCeilings:
      'every measured (ISL, batch) rung is a point; each line traces the library at its best ' +
      'batch for every ISL, so higher is better. A library that overlaps requests lifts its ' +
      'line well above its batch-1 points; hover a point for its batch, latency, and status.',
    frontierOption: 'Envelope',
    overlapOption: 'Overlap gain',
    overlapCaption:
      'aggregate bandwidth relative to batch 1 at the selected ISL (Auto reads each library at ' +
      'the ISL with its widest batch sweep); the dotted ideal is y = batch. A perfect ' +
      'overlapper tracks the ideal until the wire saturates; a serializing library stays flat ' +
      'at 1. Libraries without a batch-1 rung at the selected ISL are hidden.',
    viewControl: 'View',
    viewSeries: 'Series',
    viewRange: 'Range by SKU',
    viewBest: 'Best by SKU',
    bestNote:
      'Each line is the best library (lowest latency, highest bandwidth) on that SKU and fabric ' +
      'at each point; the tooltip names it.',
    rangeNote:
      'Each band spans the lowest to the highest value across every library on that SKU and ' +
      'fabric at each point; the line is their median.',
    yControl: 'Metric',
    xControl: 'X axis',
    opControl: 'Direction',
    islControl: 'ISL',
    islAutoOption: 'Auto',
    viewAriaLabel: 'CollectiveX KV view',
    metricAriaLabel: 'CollectiveX KV metric',
    xAriaLabel: 'CollectiveX KV X axis',
    opAriaLabel: 'CollectiveX KV direction',
    islAriaLabel: 'CollectiveX KV overlap ISL',
    xLogScale: 'X-axis Log Scale',
    yLogScale: 'Y-axis Log Scale',
    bulkBaseline: 'Contiguous Baseline',
    summary: (cases: number, measured: number) => `${cases} cases · ${measured} measured · `,
    headers: {
      library: 'Library',
      fabric: 'Fabric',
      outcome: 'Outcome',
      requestMs: 'Request ms',
      requestGbps: 'Request GB/s',
      peak: 'Peak GB/s',
      contig: 'Contig GB/s',
      efficiency: 'Paged / contig',
    },
    tableNote:
      'Request ms and GB/s read one request (batch 1) at the largest ISL measured at batch 1. ' +
      'Peak is the highest aggregate GB/s at any ISL and batch. Contig moves the same request as ' +
      'one region; paged / contig is the request GB/s as a share of it.',
    maturity: { production: 'production', candidate: 'candidate' },
    outcomes: {
      success: 'success',
      unsupported: 'unsupported',
      failed: 'failed',
      invalid: 'invalid',
      diagnostic: 'diagnostic',
      pending: 'pending',
    },
    batch: 'Batch',
    caption: (op: string, suffix: string) => `${op} · ${suffix}`,
  },
  zh: {
    heading: 'KV 缓存传输',
    description:
      '两个节点上的 GPU 之间交接一个 DeepSeek-V4-Pro 请求的预填充到解码 KV 缓存，' +
      '按 vLLM 0.32.0 自身连接器驱动各传输库的方式运行。每个请求搬运解码端为其列出的块，' +
      '即随机块表上的整行缓存，因此各传输库搬运相同字节，GB/s 可直接比较。一次突发同时提交 batch 个请求。' +
      '连续传输以每个请求一个区域搬运相同字节，是主机侧观测的有效吞吐参考。每次计时传输均经过校验。',
    candidateNote:
      '候选传输库按其 vLLM 连接器提交的形状测量，但 vLLM 0.32.0 尚不能用它服务 DeepSeek-V4。',
    batchCaption: '取批大小扫描最宽的 ISL',
    islCaption: '单个请求（批大小 1）',
    frontierCaption:
      '每个实测 (ISL, 批大小) 组合都是一个点；实线或虚线取该传输库在各 ISL 下的最优批大小，越高越优。' +
      '每个传输库上方的点状线是其连续传输基线：同样的字节量经同一调用以单个区域搬运，' +
      '是主机侧观测的有效吞吐参考，而非实测链路速率。悬停数据点可查看其相对基线的比例。',
    frontierCaptionWithoutCeilings:
      '每个实测 (ISL, 批大小) 组合都是一个点；每条线取该传输库在各 ISL 下的最优批大小，越高越优。' +
      '能重叠请求的传输库其线会明显高于批大小 1 的点；悬停可查看批大小、延迟与状态。',
    frontierOption: '带宽包络',
    overlapOption: '重叠增益',
    overlapCaption:
      '相对批大小 1 的聚合带宽，取所选 ISL（“自动”表示各传输库取其批大小扫描最宽的 ISL）；虚线为理想值 y = 批大小。' +
      '完全重叠请求的传输库会贴着理想线直到线速饱和；串行处理的传输库保持在 1。' +
      '在所选 ISL 处没有批大小 1 数据的传输库将被隐藏。',
    viewControl: '视图',
    viewSeries: '逐条序列',
    viewRange: '按 SKU 范围',
    viewBest: '按 SKU 最佳',
    bestNote:
      '每条线是该 SKU 和互联方式在各点上的最佳传输库（延迟最低、带宽最高）；提示框会标出其名称。',
    rangeNote: '每个色带覆盖该 SKU 和互联方式在各点上所有传输库的最低到最高值；线为其中位数。',
    yControl: '指标',
    xControl: 'X 轴',
    opControl: '方向',
    islControl: 'ISL',
    islAutoOption: '自动',
    viewAriaLabel: 'CollectiveX KV 视图',
    metricAriaLabel: 'CollectiveX KV 指标',
    xAriaLabel: 'CollectiveX KV X 轴',
    opAriaLabel: 'CollectiveX KV 传输方向',
    islAriaLabel: 'CollectiveX KV 重叠增益 ISL',
    xLogScale: 'X 轴对数缩放',
    yLogScale: 'Y 轴对数缩放',
    bulkBaseline: '连续传输基线',
    summary: (cases: number, measured: number) => `${cases} 个用例 · 已测 ${measured} 个 · `,
    headers: {
      library: '传输库',
      fabric: '互联方式',
      outcome: '结果',
      requestMs: '单请求 ms',
      requestGbps: '单请求 GB/s',
      peak: '峰值 GB/s',
      contig: '连续 GB/s',
      efficiency: '分页 / 连续',
    },
    tableNote:
      '单请求 ms 与 GB/s 取批大小 1 下最大实测 ISL 的单个请求。峰值为任意 ISL 与批大小下的最高聚合 GB/s。' +
      '连续传输以单个区域搬运同一请求；分页 / 连续为单请求 GB/s 占其比例。',
    maturity: { production: '生产可用', candidate: '候选' },
    outcomes: {
      success: '成功',
      unsupported: '不支持',
      failed: '失败',
      invalid: '无效',
      diagnostic: '诊断',
      pending: '待处理',
    },
    batch: '批大小',
    caption: (op: string, suffix: string) => `${op} · ${suffix}`,
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

const MATURITY_CLASS: Record<'production' | 'candidate', string> = {
  production: 'border-sky-600/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  candidate: 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

function formatGbps(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : value.toFixed(value >= 100 ? 0 : 2);
}

function formatMs(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : value.toFixed(value >= 100 ? 0 : 2);
}

function formatIsl(value: number): string {
  return value >= 1024 && value % 1024 === 0 ? `${value / 1024}k` : String(value);
}

/** The table's cells for one case, read in `op` (push when the library only pushes). */
function cellsOf(row: CollectiveXKvRunCase, preferred: CollectiveXKvChartSelection['op']) {
  const op = collectiveXKvCaseOp(row, preferred);
  const request = collectiveXKvCell(row.rows, 'paged', op, 'b1');
  const contig = collectiveXKvCell(row.rows, 'bulk', op, 'b1');
  return {
    op,
    request,
    peak: collectiveXKvCell(row.rows, 'paged', op, 'peak'),
    contig,
    efficiency:
      request && contig && contig.isl === request.isl && contig.gbps_p50 > 0
        ? request.gbps_p50 / contig.gbps_p50
        : null,
  };
}

export function CollectiveXKvSection({
  datasets,
  runIndexById,
}: {
  datasets: CollectiveXDataset[];
  runIndexById: ReadonlyMap<string, number>;
}) {
  const locale = useLocale();
  const strings = STRINGS[locale === 'zh' ? 'zh' : 'en'];
  const [yAxis, setYAxis] = useState<CollectiveXKvChartSelection['y']>('latency');
  const [xAxis, setXAxis] = useState<CollectiveXKvChartSelection['x'] | 'frontier' | 'overlap'>(
    'isl',
  );
  const [op, setOp] = useState<CollectiveXKvChartSelection['op']>('push');
  const [view, setView] = useState<'series' | 'range' | 'best'>('series');
  const [overlapIsl, setOverlapIsl] = useState<string>('auto');
  const [xLogScale, setXLogScale] = useState(true);
  const [yLogScale, setYLogScale] = useState(true);
  const [showWireCeilings, setShowWireCeilings] = useState(true);
  const [seriesSelection, setSeriesSelection] = useState<{
    ids: Set<string>;
    signature: string;
  } | null>(null);
  const [hiddenRanges, setHiddenRanges] = useState<{
    ids: Set<string>;
    signature: string;
  } | null>(null);
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
  const hasPull = measuredCases.some((kase) => kase.rows.some((row) => row.op === 'pull'));
  const shownOp = hasPull ? op : 'push';
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
  const overlapIslValues = useMemo(
    () => collectiveXKvIslValues(measuredCases, shownOp),
    [measuredCases, shownOp],
  );
  const effectiveOverlapIsl =
    overlapIsl !== 'auto' && overlapIslValues.includes(Number(overlapIsl))
      ? Number(overlapIsl)
      : undefined;

  const selection = useMemo<CollectiveXKvChartSelection>(
    () => ({ x: xAxis === 'batch' || xAxis === 'isl' ? xAxis : 'isl', y: yAxis, op: shownOp }),
    [xAxis, yAxis, shownOp],
  );
  // The range and best views combine libraries, so they need more than one to combine.
  const libraryCount = new Set(measuredCases.map((kase) => kase.backend)).size;
  const rangeView = view !== 'series' && libraryCount > 1 && (xAxis === 'batch' || xAxis === 'isl');
  const rangeBands = useMemo(
    () =>
      rangeView
        ? collectiveXKvRangeBands(measuredCases, selection, view === 'best' ? 'best' : 'range')
        : [],
    [rangeView, measuredCases, selection, view],
  );
  const rangeSignature = rangeBands.map((band) => band.id).join('|');
  const hiddenRangeIds =
    hiddenRanges && hiddenRanges.signature === rangeSignature
      ? hiddenRanges.ids
      : new Set<string>();
  const shownRangeBands = rangeBands.filter((band) => !hiddenRangeIds.has(band.id));

  const colorKeys = useMemo(
    () => [
      ...new Set([
        ...measuredCases.map(collectiveXKvColorKey),
        ...rangeBands.map((band) => band.colorKey),
      ]),
    ],
    [measuredCases, rangeBands],
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
          title: [kase.library_version, kase.maturity, kase.network, kase.transport]
            .filter(Boolean)
            .join(' · '),
          onClick: () => {
            const next = new Set(activeIds);
            if (next.has(seriesId)) next.delete(seriesId);
            else next.add(seriesId);
            setSeriesSelection({ ids: next, signature: seriesSignature });
            track('collectivex_kv_series_toggled', { series: seriesId });
          },
        };
      }),
    [activeIds, colors, measuredCases, seriesSignature],
  );
  const rangeLegendItems = rangeBands.map((band) => ({
    name: band.id,
    label: band.label,
    color: colors[band.colorKey] ?? 'var(--muted-foreground)',
    lineDasharray: collectiveXRunDasharray(band.runIndex),
    isActive: !hiddenRangeIds.has(band.id),
    onClick: () => {
      const next = new Set(hiddenRangeIds);
      if (next.has(band.id)) next.delete(band.id);
      else next.add(band.id);
      setHiddenRanges({ ids: next, signature: rangeSignature });
      track('collectivex_kv_range_toggled', { range: band.id });
    },
  }));

  const columns = useMemo<DataTableColumn<CollectiveXKvRunCase>[]>(
    () => [
      { header: 'SKU', cell: (row) => collectiveXSkuLabel(row.sku), sortValue: (row) => row.sku },
      {
        header: strings.headers.library,
        cell: (row) => (
          <div className="min-w-28">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {collectiveXBackendLabel(row.backend)}
              {row.maturity && (
                <Badge variant="outline" className={MATURITY_CLASS[row.maturity]}>
                  {strings.maturity[row.maturity]}
                </Badge>
              )}
            </div>
            {row.library_version && (
              <p className="mt-0.5 text-xs text-muted-foreground">{row.library_version}</p>
            )}
          </div>
        ),
        sortValue: (row) => row.backend,
      },
      {
        header: strings.headers.fabric,
        cell: (row) => (
          <div className="whitespace-nowrap">
            {row.fabric}
            {(row.network || row.transport) && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[row.network, row.transport].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        ),
        sortValue: (row) => row.fabric,
      },
      {
        header: strings.headers.outcome,
        cell: (row) => (
          <div className="min-w-28">
            <Badge variant="outline" className={OUTCOME_CLASS[row.outcome]}>
              {strings.outcomes[row.outcome]}
            </Badge>
            {(row.detail || row.reason) && (
              <p className="mt-1 text-xs text-muted-foreground">{row.detail ?? row.reason}</p>
            )}
          </div>
        ),
        sortValue: (row) => `${row.outcome} ${row.reason ?? ''}`,
      },
      {
        header: strings.headers.requestMs,
        cell: (row) => {
          const cell = cellsOf(row, shownOp).request;
          if (!cell) return '-';
          return `${formatMs(cell.latency_ms.p50)} (${formatIsl(cell.isl)})`;
        },
        sortValue: (row) => cellsOf(row, shownOp).request?.latency_ms.p50 ?? -1,
        className: 'text-right tabular-nums whitespace-nowrap',
      },
      {
        header: strings.headers.requestGbps,
        cell: (row) => formatGbps(cellsOf(row, shownOp).request?.gbps_p50),
        sortValue: (row) => cellsOf(row, shownOp).request?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums',
      },
      {
        header: strings.headers.peak,
        cell: (row) => {
          const cell = cellsOf(row, shownOp).peak;
          if (!cell) return '-';
          return `${formatGbps(cell.gbps_p50)} (b${cell.batch} · ${formatIsl(cell.isl)})`;
        },
        sortValue: (row) => cellsOf(row, shownOp).peak?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums whitespace-nowrap',
      },
      {
        header: strings.headers.contig,
        cell: (row) => formatGbps(cellsOf(row, shownOp).contig?.gbps_p50),
        sortValue: (row) => cellsOf(row, shownOp).contig?.gbps_p50 ?? -1,
        className: 'text-right tabular-nums',
      },
      {
        header: strings.headers.efficiency,
        cell: (row) => {
          const value = cellsOf(row, shownOp).efficiency;
          return value === null ? '-' : `${(value * 100).toFixed(0)}%`;
        },
        sortValue: (row) => cellsOf(row, shownOp).efficiency ?? -1,
        className: 'text-right tabular-nums',
      },
    ],
    [strings, shownOp],
  );

  if (rows.length === 0) return null;
  const measured = rows.filter((row) => row.outcome === 'success').length;
  const hasCandidate = rows.some((row) => row.maturity === 'candidate');
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
  const onLegendExpanded = (expanded: boolean) => {
    setLegendExpanded(expanded);
    track('collectivex_kv_legend_expanded', { enabled: expanded });
  };
  return (
    <Card data-testid="collectivex-kv-table" className="min-w-0 w-full max-w-full overflow-hidden">
      <Heading level="card">{strings.heading}</Heading>
      <p className="mt-1 text-sm text-muted-foreground">
        {strings.summary(rows.length, measured)}
        {strings.description}
        {hasCandidate && ` ${strings.candidateNote}`}
      </p>
      {measuredCases.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
            {(xAxis === 'batch' || xAxis === 'isl') && libraryCount > 1 && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{strings.viewControl}</Label>
                <SegmentedToggle
                  value={view}
                  onValueChange={(value) => {
                    setView(value);
                    track('collectivex_kv_view_changed', { view: value });
                  }}
                  ariaLabel={strings.viewAriaLabel}
                  testId="collectivex-kv-view-toggle"
                  options={[
                    { value: 'series', label: strings.viewSeries },
                    { value: 'range', label: strings.viewRange },
                    { value: 'best', label: strings.viewBest },
                  ]}
                />
              </div>
            )}
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
                    { value: 'latency', label: 'ms' },
                    { value: 'bandwidth', label: 'GB/s' },
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
                  { value: 'isl', label: 'ISL' },
                  { value: 'batch', label: strings.batch },
                  { value: 'frontier', label: strings.frontierOption },
                  { value: 'overlap', label: strings.overlapOption },
                ]}
              />
            </div>
            {hasPull && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{strings.opControl}</Label>
                <SegmentedToggle
                  value={shownOp}
                  onValueChange={(value) => {
                    track('collectivex_kv_op_changed', { op: value });
                    setOp(value);
                  }}
                  ariaLabel={strings.opAriaLabel}
                  testId="collectivex-kv-op-toggle"
                  options={[
                    { value: 'push', label: 'push' },
                    { value: 'pull', label: 'pull' },
                  ]}
                />
              </div>
            )}
            {xAxis === 'overlap' && overlapIslValues.length > 0 && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{strings.islControl}</Label>
                <SegmentedToggle
                  value={effectiveOverlapIsl === undefined ? 'auto' : String(effectiveOverlapIsl)}
                  onValueChange={(value) => {
                    setOverlapIsl(value);
                    track('collectivex_kv_overlap_isl_changed', { isl: value });
                  }}
                  ariaLabel={strings.islAriaLabel}
                  testId="collectivex-kv-overlap-isl-toggle"
                  options={[
                    { value: 'auto', label: strings.islAutoOption },
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
                selection={{ op: shownOp }}
                xLogScale={xLogScale}
                yLogScale={yLogScale}
                showWireCeilings={showWireCeilings}
                caption={
                  <p className="text-sm text-muted-foreground">
                    {strings.caption(
                      shownOp,
                      showWireCeilings
                        ? strings.frontierCaption
                        : strings.frontierCaptionWithoutCeilings,
                    )}
                  </p>
                }
                legendElement={
                  <ChartLegend
                    variant="sidebar"
                    legendItems={legendItems}
                    switches={envelopeLegendSwitches}
                    disableActiveSort
                    isLegendExpanded={legendExpanded}
                    onExpandedChange={onLegendExpanded}
                  />
                }
              />
            ) : xAxis === 'overlap' ? (
              <CollectiveXKvOverlapChart
                chartId="collectivex-kv-overlap"
                testId="collectivex-kv-overlap-chart"
                cases={activeCases}
                colors={colors}
                selection={{ op: shownOp, isl: effectiveOverlapIsl }}
                caption={
                  <p className="text-sm text-muted-foreground">
                    {strings.caption(
                      shownOp,
                      `ISL ${
                        effectiveOverlapIsl === undefined
                          ? strings.islAutoOption
                          : formatIsl(effectiveOverlapIsl)
                      } · ${strings.overlapCaption}`,
                    )}
                  </p>
                }
                legendElement={
                  <ChartLegend
                    variant="sidebar"
                    legendItems={legendItems}
                    disableActiveSort
                    isLegendExpanded={legendExpanded}
                    onExpandedChange={onLegendExpanded}
                  />
                }
              />
            ) : (
              <>
                <CollectiveXKvChart
                  chartId="collectivex-kv"
                  testId="collectivex-kv-chart"
                  cases={activeCases}
                  colors={colors}
                  selection={selection}
                  ranges={rangeView ? shownRangeBands : undefined}
                  rangeMode={view === 'best' ? 'best' : 'range'}
                  xLogScale={xLogScale}
                  yLogScale={yLogScale}
                  caption={
                    <p className="text-sm text-muted-foreground">
                      {strings.caption(
                        shownOp,
                        xAxis === 'batch' ? strings.batchCaption : strings.islCaption,
                      )}
                    </p>
                  }
                  legendElement={
                    <ChartLegend
                      variant="sidebar"
                      legendItems={rangeView ? rangeLegendItems : legendItems}
                      switches={legendSwitches}
                      disableActiveSort
                      isLegendExpanded={legendExpanded}
                      onExpandedChange={onLegendExpanded}
                    />
                  }
                />
                {rangeView && (
                  <p
                    className="mt-2 text-xs text-muted-foreground"
                    data-testid="collectivex-kv-range-note"
                  >
                    {view === 'best' ? strings.bestNote : strings.rangeNote}
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
      <p className="mt-4 text-xs text-muted-foreground">{strings.tableNote}</p>
      <DataTable
        data={rows}
        columns={columns}
        testId="collectivex-kv-table-table"
        analyticsPrefix="collectivex_kv"
      />
    </Card>
  );
}
