'use client';

import { ChevronDown, ChevronRight, GitCompare, Info } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DB_MODEL_TO_DISPLAY,
  resolveFrameworkPartLabel,
} from '@semianalysisai/inferencex-constants';

import { track } from '@/lib/analytics';
import { MODEL_PREFIX_MAPPING, getModelLabel } from '@/lib/data-mappings';
import type { SubmissionSummaryRow } from '@/lib/submissions-types';
import { getFrameworkLabel } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

import { useLocale } from '@/lib/use-locale';

import {
  buildInferenceCompareUrl,
  computePreviousImages,
  computePreviousRuns,
  getVendor,
  submissionRowKey,
} from './submissions-utils';

const STRINGS = {
  en: {
    searchPlaceholder: 'Search configs...',
    colGpu: 'GPU',
    colModel: 'Model',
    colPrecision: 'Precision',
    colSpecMethod: 'Spec Method',
    colFramework: 'Framework',
    colDate: 'Date',
    colDatapoints: 'Datapoints',
    colCompare: 'Compare',
    noMatch: 'No matching submissions found.',
    noData: 'No submission data available.',
    vsPrev: 'vs prev',
    vendorLabel: 'Vendor:',
    vendorTip: 'GPU manufacturer',
    specMethodLabel: 'Spec Method:',
    specMethodTip: 'Speculative decoding method (e.g. MTP, Eagle)',
    disaggLabel: 'Disaggregated:',
    disaggTip: 'Prefill and decode run on separate GPU pools',
    multinodeLabel: 'Multinode:',
    multinodeTip: 'Config spans multiple physical nodes',
    totalGpusLabel: 'Total GPUs:',
    totalGpusTip: 'Total physical GPUs. When disaggregated, prefill + decode are separate pools',
    prefillGpusLabel: 'Prefill GPUs:',
    prefillGpusTip: 'GPUs for the prefill (prompt processing) phase',
    decodeGpusLabel: 'Decode GPUs:',
    decodeGpusTip: 'GPUs for the decode (token generation) phase',
    prefillTpEpLabel: 'Prefill TP/EP:',
    prefillTpEpTip: 'Tensor parallelism / Expert parallelism for prefill',
    decodeTpEpLabel: 'Decode TP/EP:',
    decodeTpEpTip: 'Tensor parallelism / Expert parallelism for decode',
    sequencesLabel: 'Sequences:',
    sequencesTip: 'Distinct ISL/OSL sequence length combinations tested',
    concurrenciesLabel: 'Concurrencies:',
    concurrenciesTip: 'Distinct concurrency levels tested',
    imageLabel: 'Image:',
    imageTipChanged:
      'Container image used for this benchmark configuration. The previous run of this config used a different image — shown on the left.',
    imageTipDefault: 'Container image used for this benchmark configuration',
    showMorePre: 'Show ',
    showMorePost: ' more',
    hiddenPre: '(',
    hiddenPost: ' hidden)',
    showingPrefix: 'Showing ',
    showingOf: ' of ',
    configSingular: ' config',
    configPlural: ' configs',
    totalDatapointsSuffix: ' total datapoints',
    compareTipPre: 'Compare ',
    compareTipPost: ' on chart',
    maxPrefix: 'max ',
    yes: 'Yes',
    no: 'No',
  },
  zh: {
    searchPlaceholder: '搜索配置...',
    colGpu: 'GPU',
    colModel: '模型',
    colPrecision: '精度',
    colSpecMethod: '推测解码',
    colFramework: '框架',
    colDate: '日期',
    colDatapoints: '数据点',
    colCompare: '对比',
    noMatch: '未找到匹配的提交记录。',
    noData: '暂无提交数据。',
    vsPrev: '对比',
    vendorLabel: '厂商：',
    vendorTip: 'GPU 制造商',
    specMethodLabel: '推测解码方法：',
    specMethodTip: '推测解码方法（如 MTP、Eagle）',
    disaggLabel: '分离式部署：',
    disaggTip: 'Prefill 和 Decode 在不同 GPU 池上运行',
    multinodeLabel: '多节点：',
    multinodeTip: '配置跨多个物理节点',
    totalGpusLabel: '总 GPU 数：',
    totalGpusTip: '物理 GPU 总数。分离式部署时，Prefill 和 Decode 使用不同的 GPU 池',
    prefillGpusLabel: 'Prefill GPU 数：',
    prefillGpusTip: '用于 Prefill（提示处理）阶段的 GPU',
    decodeGpusLabel: 'Decode GPU 数：',
    decodeGpusTip: '用于 Decode（Token 生成）阶段的 GPU',
    prefillTpEpLabel: 'Prefill TP/EP：',
    prefillTpEpTip: 'Prefill 的张量并行 / 专家并行',
    decodeTpEpLabel: 'Decode TP/EP：',
    decodeTpEpTip: 'Decode 的张量并行 / 专家并行',
    sequencesLabel: '序列组合：',
    sequencesTip: '测试的不同 ISL/OSL 序列长度组合数',
    concurrenciesLabel: '并发数：',
    concurrenciesTip: '测试的不同并发级别数',
    imageLabel: '镜像：',
    imageTipChanged: '此基准测试配置使用的容器镜像。上一次运行使用了不同的镜像——显示在左侧。',
    imageTipDefault: '此基准测试配置使用的容器镜像',
    showMorePre: '再显示 ',
    showMorePost: ' 条',
    hiddenPre: '（还有 ',
    hiddenPost: ' 条隐藏）',
    showingPrefix: '显示 ',
    showingOf: ' / ',
    configSingular: ' 条配置',
    configPlural: ' 条配置',
    totalDatapointsSuffix: ' 个数据点',
    compareTipPre: '对比 ',
    compareTipPost: '（在图表中查看）',
    maxPrefix: '最大 ',
    yes: '是',
    no: '否',
  },
} as const;

const ROW_PAGE_SIZE = 100;

function DetailItem({
  label,
  tip,
  children,
}: {
  label: string;
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <Info className="size-3 text-muted-foreground/50 cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" collisionPadding={10}>
          <span className="text-xs">{tip}</span>
        </TooltipContent>
      </TooltipRoot>
      <span className="font-medium">{children}</span>
    </div>
  );
}

type SortKey =
  | 'hardware'
  | 'model'
  | 'precision'
  | 'spec_method'
  | 'framework'
  | 'date'
  | 'total_datapoints';
type SortDir = 'asc' | 'desc';

interface SubmissionsTableProps {
  data: SubmissionSummaryRow[];
}

function getModelDisplayName(dbModel: string): string {
  // MODEL_PREFIX_MAPPING maps prefix → display model name
  const displayModel = MODEL_PREFIX_MAPPING[dbModel];
  if (displayModel) return getModelLabel(displayModel);
  return dbModel;
}

function SortHeader({
  label,
  field,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  field: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (field: SortKey) => void;
}) {
  return (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === field && (
          <span className="text-foreground">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );
}

export default function SubmissionsTable({ data }: SubmissionsTableProps) {
  const t = STRINGS[useLocale()];
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(ROW_PAGE_SIZE);

  const previousImages = useMemo(() => computePreviousImages(data), [data]);
  const previousRuns = useMemo(() => computePreviousRuns(data), [data]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
      track('submissions_table_sorted', { column: key });
    },
    [sortKey],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (row) =>
        row.hardware.includes(q) ||
        row.model.includes(q) ||
        row.framework.includes(q) ||
        row.precision.includes(q) ||
        row.spec_method.includes(q) ||
        getVendor(row.hardware).toLowerCase().includes(q) ||
        getModelDisplayName(row.model).toLowerCase().includes(q),
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...filtered].toSorted((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult;
      return String(av).localeCompare(String(bv)) * mult;
    });
  }, [filtered, sortKey, sortDir]);

  // Reset visible count when the filtered/sorted view changes so the user
  // always lands at the top of the new result set instead of mid-list.
  useEffect(() => {
    setVisibleCount(ROW_PAGE_SIZE);
  }, [search, sortKey, sortDir]);

  const visibleRows = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);
  const hiddenCount = Math.max(0, sorted.length - visibleRows.length);

  const loadMore = useCallback(() => {
    setVisibleCount((c) => c + ROW_PAGE_SIZE);
    track('submissions_table_load_more', { previous_count: visibleCount });
  }, [visibleCount]);

  const toggleRow = useCallback((key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        track('submissions_row_collapsed', { config: key });
      } else {
        next.add(key);
        track('submissions_row_expanded', { config: key });
      }
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onBlur={() => {
          if (search.trim()) track('submissions_table_searched', { query: search.trim() });
        }}
        placeholder={t.searchPlaceholder}
        className="w-full max-w-sm px-3 py-1.5 rounded-md border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8 px-2" />
              {(
                [
                  [t.colGpu, 'hardware'],
                  [t.colModel, 'model'],
                  [t.colPrecision, 'precision'],
                  [t.colSpecMethod, 'spec_method'],
                  [t.colFramework, 'framework'],
                  [t.colDate, 'date'],
                  [t.colDatapoints, 'total_datapoints'],
                ] as [string, SortKey][]
              ).map(([label, field]) => (
                <SortHeader
                  key={field}
                  label={label}
                  field={field}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              ))}
              <th
                className="px-3 py-2 text-left text-xs font-medium text-muted-foreground select-none"
                scope="col"
              >
                {t.colCompare}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleRows.map((row) => {
              const key = submissionRowKey(row);
              const isExpanded = expandedRows.has(key);
              return (
                <SubmissionRow
                  key={key}
                  row={row}
                  isExpanded={isExpanded}
                  previousImage={previousImages.get(key) ?? null}
                  previousRun={previousRuns.get(key) ?? null}
                  onToggle={() => toggleRow(key)}
                />
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  {search ? t.noMatch : t.noData}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadMore}
            data-testid="submissions-load-more"
          >
            {t.showMorePre}
            {Math.min(ROW_PAGE_SIZE, hiddenCount)}
            {t.showMorePost}
            <span className="text-muted-foreground">
              {t.hiddenPre}
              {hiddenCount}
              {t.hiddenPost}
            </span>
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {t.showingPrefix}
        {visibleRows.length}
        {t.showingOf}
        {filtered.length}
        {filtered.length === 1 ? t.configSingular : t.configPlural} ·{' '}
        {filtered.reduce((sum, r) => sum + r.total_datapoints, 0).toLocaleString()}
        {t.totalDatapointsSuffix}
      </p>
    </div>
  );
}

function SubmissionRow({
  row,
  isExpanded,
  previousImage,
  previousRun,
  onToggle,
}: {
  row: SubmissionSummaryRow;
  isExpanded: boolean;
  previousImage: string | null;
  previousRun: SubmissionSummaryRow | null;
  onToggle: () => void;
}) {
  const t = STRINGS[useLocale()];
  const vendor = getVendor(row.hardware);
  const compareUrl = previousRun ? buildInferenceCompareUrl(row, previousRun) : null;

  return (
    <>
      <tr className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="px-2 py-2 text-muted-foreground">
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </td>
        <td className="px-3 py-2 font-medium">
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block size-2 rounded-full ${vendor === 'NVIDIA' ? 'bg-green-500' : vendor === 'AMD' ? 'bg-red-500' : 'bg-gray-400'}`}
            />
            {row.hardware.toUpperCase()}
          </span>
        </td>
        <td className="px-3 py-2">{getModelDisplayName(row.model)}</td>
        <td className="px-3 py-2 uppercase">{row.precision}</td>
        <td className="px-3 py-2 uppercase">
          {row.spec_method && row.spec_method !== 'none' ? (
            resolveFrameworkPartLabel(DB_MODEL_TO_DISPLAY[row.model], row.spec_method)
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2">{getFrameworkLabel(row.framework)}</td>
        <td className="px-3 py-2 tabular-nums">{row.date}</td>
        <td className="px-3 py-2 tabular-nums">{row.total_datapoints.toLocaleString()}</td>
        <td className="px-3 py-2">
          {compareUrl && previousRun ? (
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a
                      href={compareUrl}
                      data-testid="submissions-compare-runs-link-inline"
                      onClick={() => {
                        track('submissions_compare_runs_clicked', {
                          source: 'inline',
                          config: submissionRowKey(row),
                          model: row.model,
                          hardware: row.hardware,
                          framework: row.framework,
                          previous_date: previousRun.date,
                          new_date: row.date,
                          image_changed: previousImage !== null,
                        });
                      }}
                    >
                      <GitCompare className="size-3.5" />
                      <span className="hidden lg:inline">{t.vsPrev}</span>
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" collisionPadding={10}>
                  <span className="text-xs">
                    {t.compareTipPre}
                    {previousRun.date} → {row.date}
                    {t.compareTipPost}
                  </span>
                </TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/20">
          <td />
          <td colSpan={8} className="px-3 py-3">
            <TooltipProvider>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-sm">
                <DetailItem label={t.vendorLabel} tip={t.vendorTip}>
                  {vendor}
                </DetailItem>
                <DetailItem label={t.specMethodLabel} tip={t.specMethodTip}>
                  {row.spec_method && row.spec_method !== 'none'
                    ? resolveFrameworkPartLabel(DB_MODEL_TO_DISPLAY[row.model], row.spec_method)
                    : 'none'}
                </DetailItem>
                <DetailItem label={t.disaggLabel} tip={t.disaggTip}>
                  {row.disagg ? t.yes : t.no}
                </DetailItem>
                <DetailItem label={t.multinodeLabel} tip={t.multinodeTip}>
                  {row.is_multinode ? t.yes : t.no}
                </DetailItem>
                <DetailItem label={t.totalGpusLabel} tip={t.totalGpusTip}>
                  <span className="tabular-nums">
                    {row.disagg ? row.num_prefill_gpu + row.num_decode_gpu : row.num_prefill_gpu}
                  </span>
                </DetailItem>
                <DetailItem label={t.prefillGpusLabel} tip={t.prefillGpusTip}>
                  <span className="tabular-nums">{row.num_prefill_gpu}</span>
                </DetailItem>
                <DetailItem label={t.decodeGpusLabel} tip={t.decodeGpusTip}>
                  <span className="tabular-nums">{row.num_decode_gpu}</span>
                </DetailItem>
                <DetailItem label={t.prefillTpEpLabel} tip={t.prefillTpEpTip}>
                  <span className="tabular-nums">
                    {row.prefill_tp ?? '—'}/{row.prefill_ep ?? '—'}
                  </span>
                </DetailItem>
                <DetailItem label={t.decodeTpEpLabel} tip={t.decodeTpEpTip}>
                  <span className="tabular-nums">
                    {row.decode_tp ?? '—'}/{row.decode_ep ?? '—'}
                  </span>
                </DetailItem>
                <DetailItem label={t.sequencesLabel} tip={t.sequencesTip}>
                  <span className="tabular-nums">{row.distinct_sequences ?? '—'}</span>
                </DetailItem>
                <DetailItem label={t.concurrenciesLabel} tip={t.concurrenciesTip}>
                  <span className="tabular-nums">
                    {row.distinct_concurrencies ?? '—'}
                    {row.max_concurrency ? ` (${t.maxPrefix}${row.max_concurrency})` : ''}
                  </span>
                </DetailItem>
                <div className="col-span-2 md:col-span-4">
                  <DetailItem
                    label={t.imageLabel}
                    tip={previousImage ? t.imageTipChanged : t.imageTipDefault}
                  >
                    {previousImage ? (
                      <span
                        data-testid="submissions-image-diff"
                        className="font-mono text-xs break-all"
                      >
                        <span className="text-muted-foreground">{previousImage}</span>
                        <span className="mx-2 text-muted-foreground" aria-label="changed to">
                          →
                        </span>
                        <span>{row.image}</span>
                      </span>
                    ) : (
                      <span className="font-mono text-xs break-all">{row.image ?? '—'}</span>
                    )}
                  </DetailItem>
                </div>
                {compareUrl && previousRun && (
                  <div className="col-span-2 md:col-span-4 flex justify-end">
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={compareUrl}
                        data-testid="submissions-compare-runs-link"
                        onClick={() => {
                          track('submissions_compare_runs_clicked', {
                            source: 'expanded',
                            config: submissionRowKey(row),
                            model: row.model,
                            hardware: row.hardware,
                            framework: row.framework,
                            previous_date: previousRun.date,
                            new_date: row.date,
                            image_changed: previousImage !== null,
                          });
                        }}
                      >
                        <GitCompare className="size-3.5" />
                        {t.compareTipPre}
                        {previousRun.date} → {row.date}
                        {t.compareTipPost}
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </TooltipProvider>
          </td>
        </tr>
      )}
    </>
  );
}
