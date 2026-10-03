'use client';

import { useCallback, useMemo, useState } from 'react';

import type { CalculatorUrlSeed } from '@/components/calculator/url-seed';
import {
  GlobalFilterProvider,
  useGlobalFilterActions,
  useGlobalFilterAvailability,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from '@/components/GlobalFilterContext';
import {
  includesJalapenoResult,
  includesTpuv7Result,
  includesVeraRubinResult,
  JalapenoOfficialPreviewNotice,
  Tpuv7OfficialPreviewNotice,
  VeraRubinOfficialPreviewNotice,
} from '@/components/official-preview-notice';
import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import ChartLegend from '@/components/ui/chart-legend';
import {
  ModelSelector,
  PrecisionSelector,
  ScenarioSelector,
} from '@/components/ui/chart-selectors';
import { ControlPanel } from '@/components/ui/control-panel';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { type DataTableColumn, DataTable } from '@/components/ui/data-table';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Heading } from '@/components/ui/heading';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUnofficialRun } from '@/components/unofficial-run-provider';
import { useOpenDropdown } from '@/hooks/useOpenDropdown';
import { track } from '@/lib/analytics';
import { getModelSortIndex } from '@/lib/constants';
import { exportToCsv } from '@/lib/csv-export';
import {
  getModelLabel,
  getSequenceLabel,
  Percentile,
  Sequence,
  type Model,
} from '@/lib/data-mappings';
import { overlayRunColor } from '@/lib/overlay-run-style';
import { readUrlParams, writeUrlParams } from '@/lib/url-state';
import { useLocale } from '@/lib/use-locale';

import {
  buildCacheReuse,
  CACHE_TIER_COLORS,
  defaultCacheReuseGroup,
  formatShare,
  type CacheReuseBar,
} from './cache-reuse';
import CacheReuseChart, { CACHE_REUSE_STRINGS, configLabel, tierLabel } from './CacheReuseChart';
import { useThroughputData, type GroupMeta } from './useThroughputData';

const STRINGS = {
  en: {
    title: 'Prefix Cache Reuse',
    benchmarkGroup: 'Benchmark Config',
    chartGroup: 'Chart Config',
    configLabel: 'Configuration',
    configTooltip:
      'The chip and serving framework whose sweep is plotted. Configurations that reported no cache tier for this selection are listed but draw no bars.',
    configPlaceholder: 'Configuration',
    recipeLabel: 'Recipe',
    recipeTooltip:
      'Parallelism, speculative decoding, and KV offload of the plotted rows. A configuration can run several recipes at the same concurrency; each is plotted on its own so one sweep never mixes them.',
    recipeOption: (label: string, rows: number) => `${label} (${rows} rows)`,
    ceiling: 'Theoretical ceiling',
    errorLoading: 'Error loading data. Please try a different selection.',
    noData:
      'No measured data for the current selection. Try another model, workload, or precision.',
    noTiersFixed:
      'Fixed-sequence runs record no prefix-cache tiers, so there is nothing to stack here. Switch the scenario to AgentX.',
    noTiers:
      'None of the measured rows for this configuration reported a prefix-cache tier. Try another configuration or run date.',
    captionSource: 'Source: SemiAnalysis InferenceX',
    unofficialRun: 'Unofficial run',
    colSeries: 'Series',
    colConcurrency: 'Concurrency',
    colHbm: 'HBM',
    colHost: 'Host',
    colUnreused: 'Not reused',
    colCeiling: 'Ceiling',
    colTp: 'TP',
    colRun: 'Run',
    viewRun: 'View',
    official: 'Official',
  },
  zh: {
    title: '前缀缓存复用',
    benchmarkGroup: '基准测试配置',
    chartGroup: '图表配置',
    configLabel: '配置',
    configTooltip:
      '要绘制的芯片与推理框架组合。当前选择下未上报任何缓存层级的配置仍会列出，但不绘制柱形。',
    configPlaceholder: '配置',
    recipeLabel: '方案',
    recipeTooltip:
      '所绘数据行的并行方式、投机解码与 KV offload 设置。同一配置在相同并发数下可能有多个方案，每次只绘制一个，避免在同一条扫描中混用。',
    recipeOption: (label: string, rows: number) => `${label}（${rows} 行）`,
    ceiling: '理论上限',
    errorLoading: '加载数据出错，请尝试其他选择。',
    noData: '当前选择没有实测数据。请尝试其他模型、工作负载或精度。',
    noTiersFixed: '固定序列的运行不记录前缀缓存层级，此处没有可堆叠的数据。请将场景切换为 AgentX。',
    noTiers: '该配置的实测数据行均未上报前缀缓存层级。请尝试其他配置或运行日期。',
    captionSource: '来源：SemiAnalysis InferenceX',
    unofficialRun: '非官方运行',
    colSeries: '系列',
    colConcurrency: '并发数',
    colHbm: 'HBM',
    colHost: '主机',
    colUnreused: '未复用',
    colCeiling: '理论上限',
    colTp: 'TP',
    colRun: '运行记录',
    viewRun: '查看',
    official: '官方',
  },
} as const;

interface CacheReuseRow {
  key: string;
  series: string;
  concurrency: number;
  hbm: number;
  host: number | null;
  unreused: number;
  ceiling: number | null;
  tp: number;
  runUrl: string | null;
}

interface ConfigOption {
  key: string;
  meta: GroupMeta;
  label: string;
  /** No official rows; the configuration exists only in a loaded run. */
  overlayOnly: boolean;
}

export default function CacheReuseDisplay({ urlSeed }: { urlSeed?: CalculatorUrlSeed }) {
  return (
    <GlobalFilterProvider
      initialModel={urlSeed?.model}
      initialSequence={urlSeed?.sequence}
      initialPrecisions={urlSeed?.precisions}
      initialRunDate={urlSeed?.runDate}
      initialRunId={urlSeed?.runId}
    >
      <CacheReuseInner />
    </GlobalFilterProvider>
  );
}

function CacheReuseInner() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const tc = CACHE_REUSE_STRINGS[locale];
  const { openDropdown, handleDropdownOpenChange } = useOpenDropdown();

  const {
    tcoBasis,
    selectedModel,
    effectiveSequence: selectedSequence,
    effectivePrecisions: selectedPrecisions,
  } = useGlobalFilterSelection();
  const { setSelectedModel, setSelectedSequence, setSelectedPrecisions } = useGlobalFilterActions();
  const { selectedRunDate } = useGlobalFilterRun();
  const { availablePrecisions, availableSequences, availableModels } =
    useGlobalFilterAvailability();

  // URL-seeded so an article can link the exact configuration; empty means
  // "the configuration with the most tiered rows", which is why the default
  // is never written back.
  const [configInput, setConfigInput] = useState<string>(() => readUrlParams().c_cfg ?? '');
  // Empty means the recipe with the most tiered rows; like `c_cfg`, the
  // default is never written back.
  const [recipeInput, setRecipeInput] = useState<string>(() => readUrlParams().c_recipe ?? '');
  const [showCeiling, setShowCeiling] = useState(false);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);

  const { isUnofficialRun, unofficialBenchmarkRows, unofficialRunInfos, runIndexByUrl } =
    useUnofficialRun();
  const overlayInput = useMemo(
    () => ({ rows: unofficialBenchmarkRows, runIndexByUrl }),
    [unofficialBenchmarkRows, runIndexByUrl],
  );

  const {
    gpuDataByGroupKey,
    gpuGroupMeta,
    overlayGpuDataByGroupKey,
    overlayGroupMeta,
    hardwareConfig,
    loading,
    error,
    hasData,
    hasOverlayData,
    availableHwKeys,
    overlayAvailableHwKeys,
  } = useThroughputData(
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    selectedRunDate,
    overlayInput,
    Percentile.P90,
    undefined,
    true,
    'total',
    tcoBasis,
  );

  const isAgenticSequence = selectedSequence === Sequence.AgenticTraces;

  const configOptions = useMemo<ConfigOption[]>(() => {
    const label = (meta: GroupMeta) =>
      `${configLabel(meta.hwKey, hardwareConfig)}${meta.precision ? ` · ${meta.precision.toUpperCase()}` : ''}`;
    const options: ConfigOption[] = Object.entries(gpuGroupMeta).map(([key, meta]) => ({
      key,
      meta,
      label: label(meta),
      overlayOnly: false,
    }));
    const official = new Set(options.map((o) => o.key));
    for (const meta of Object.values(overlayGroupMeta)) {
      const key = `${meta.hwKey}${meta.precision ? `__${meta.precision}` : ''}`;
      if (official.has(key)) continue;
      official.add(key);
      options.push({
        key,
        meta: { hwKey: meta.hwKey, precision: meta.precision },
        label: `✕ ${label(meta)}`,
        overlayOnly: true,
      });
    }
    return options.toSorted(
      (a, b) =>
        getModelSortIndex(a.meta.hwKey) - getModelSortIndex(b.meta.hwKey) ||
        a.label.localeCompare(b.label),
    );
  }, [gpuGroupMeta, overlayGroupMeta, hardwareConfig]);

  const selectedConfig = useMemo<ConfigOption | null>(() => {
    const requested = configOptions.find((o) => o.key === configInput);
    if (requested) return requested;
    const fallback = defaultCacheReuseGroup(gpuDataByGroupKey, gpuGroupMeta);
    return (
      configOptions.find((o) => o.key === fallback) ??
      configOptions.find((o) => o.overlayOnly) ??
      configOptions[0] ??
      null
    );
  }, [configOptions, configInput, gpuDataByGroupKey, gpuGroupMeta]);

  const runInfoByIndex = useMemo(() => {
    const map: Record<number, { branch: string; url: string }> = {};
    unofficialRunInfos.forEach((info, idx) => {
      map[idx] = { branch: info.branch || `run ${info.id}`, url: info.url };
    });
    return map;
  }, [unofficialRunInfos]);
  const overlayLabels = useMemo(
    () =>
      Object.fromEntries(Object.entries(runInfoByIndex).map(([idx, info]) => [idx, info.branch])),
    [runInfoByIndex],
  );

  const officialPoints = useMemo(
    () => (selectedConfig ? (gpuDataByGroupKey[selectedConfig.key] ?? []) : []),
    [selectedConfig, gpuDataByGroupKey],
  );
  const result = useMemo(
    () =>
      buildCacheReuse({
        official: officialPoints,
        overlay: overlayGpuDataByGroupKey,
        overlayMeta: overlayGroupMeta,
        overlayLabels,
        config: selectedConfig?.meta ?? { hwKey: '' },
        recipe: recipeInput || undefined,
      }),
    [
      officialPoints,
      overlayGpuDataByGroupKey,
      overlayGroupMeta,
      overlayLabels,
      selectedConfig,
      recipeInput,
    ],
  );
  const hasAnyData = hasData || hasOverlayData;
  const plottedRecipeLabel =
    result.recipes.length > 1
      ? (result.recipes.find((r) => r.key === result.recipe)?.label ?? '')
      : '';
  const hasBars = result.bars.length > 0;

  const handleModelChange = useCallback(
    (value: string) => {
      setSelectedModel(value as Model);
      track('cache_reuse_model_selected', { model: value });
    },
    [setSelectedModel],
  );
  const handleSequenceChange = useCallback(
    (value: string) => {
      setSelectedSequence(value as Sequence);
      track('cache_reuse_sequence_selected', { sequence: value });
    },
    [setSelectedSequence],
  );
  const handlePrecisionChange = useCallback(
    (value: string[]) => {
      setSelectedPrecisions(value);
      track('cache_reuse_precision_selected', { precision: value.join(',') });
    },
    [setSelectedPrecisions],
  );
  const handleRecipeChange = useCallback((key: string) => {
    setRecipeInput(key);
    writeUrlParams({ c_recipe: key });
    track('cache_reuse_recipe_selected', { recipe: key });
  }, []);
  const handleConfigChange = useCallback((key: string) => {
    setConfigInput(key);
    // Recipe keys belong to one configuration; carry none across a switch.
    setRecipeInput('');
    writeUrlParams({ c_cfg: key, c_recipe: '' });
    track('cache_reuse_config_selected', { config: key });
  }, []);

  const legendItems = useMemo(() => {
    const tiers = (['hbm', 'host', 'unreused'] as const)
      .filter(
        (tier) =>
          tier !== 'host' || !result.anyCombined || result.bars.some((b) => !b.share.combined),
      )
      .map((tier) => ({
        name: `tier-${tier}`,
        label: tierLabel(tier, tier === 'hbm' && result.anyCombined, locale),
        color: CACHE_TIER_COLORS[tier],
        title: tierLabel(tier, tier === 'hbm' && result.anyCombined, locale),
        hw: `cache-tier-${tier}`,
        isActive: true,
        isRemovable: false,
        onClick: () => {},
      }));
    const runs = result.series
      .filter((series) => series.runIndex !== undefined)
      .map((series) => {
        const info = unofficialRunInfos[series.runIndex!];
        return {
          name: `✕ unofficial-run-${info?.id ?? series.runIndex}`,
          label: series.label,
          color: overlayRunColor(series.runIndex!),
          title: `${t.unofficialRun}: ${series.label}`,
          hw: `overlay-run-${info?.id ?? series.runIndex}`,
          isActive: true,
          isRemovable: false,
          onClick: () => {},
        };
      });
    return [...runs, ...tiers];
  }, [result.anyCombined, result.bars, result.series, unofficialRunInfos, locale, t]);

  const tableRows = useMemo<CacheReuseRow[]>(
    () =>
      result.bars.map((bar: CacheReuseBar) => ({
        key: bar.key,
        series:
          bar.runIndex === undefined
            ? t.official
            : (result.series.find((s) => s.key === bar.seriesKey)?.label ?? bar.seriesKey),
        concurrency: bar.concurrency,
        hbm: bar.share.hbm,
        host: bar.share.combined ? null : bar.share.host,
        unreused: bar.share.unreused,
        ceiling: bar.share.theoretical,
        tp: bar.point.tp,
        runUrl:
          bar.runIndex === undefined
            ? (bar.point.sourceRow?.run_url ?? null)
            : (runInfoByIndex[bar.runIndex]?.url ?? null),
      })),
    [result.bars, result.series, runInfoByIndex, t],
  );

  const columns = useMemo<DataTableColumn<CacheReuseRow>[]>(
    () => [
      { header: t.colSeries, cell: (r) => r.series, sortValue: (r) => r.series, pinned: true },
      {
        header: t.colConcurrency,
        cell: (r) => r.concurrency,
        sortValue: (r) => r.concurrency,
        align: 'right',
      },
      {
        header: result.anyCombined ? tc.combined : t.colHbm,
        cell: (r) => formatShare(r.hbm),
        sortValue: (r) => r.hbm,
        align: 'right',
      },
      {
        header: t.colHost,
        cell: (r) => (r.host === null ? '—' : formatShare(r.host)),
        sortValue: (r) => r.host ?? -1,
        align: 'right',
      },
      {
        header: t.colUnreused,
        cell: (r) => formatShare(r.unreused),
        sortValue: (r) => r.unreused,
        align: 'right',
      },
      {
        header: t.colCeiling,
        cell: (r) => (r.ceiling === null ? '—' : formatShare(r.ceiling)),
        sortValue: (r) => r.ceiling ?? -1,
        align: 'right',
      },
      { header: t.colTp, cell: (r) => r.tp, sortValue: (r) => r.tp, align: 'right' },
      {
        header: t.colRun,
        cell: (r) =>
          r.runUrl ? (
            <a
              href={r.runUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
              onClick={() => track('cache_reuse_run_link_clicked')}
            >
              {t.viewRun}
              <ExternalLinkIcon />
            </a>
          ) : (
            '—'
          ),
      },
    ],
    [t, tc, result.anyCombined],
  );

  const handleExportCsv = useCallback(() => {
    const headers = [
      t.colSeries,
      t.colConcurrency,
      t.colHbm,
      t.colHost,
      t.colUnreused,
      t.colCeiling,
      t.colTp,
      t.colRun,
    ];
    const body = tableRows.map((r) => [
      r.series,
      r.concurrency,
      r.hbm,
      r.host ?? '',
      r.unreused,
      r.ceiling ?? '',
      r.tp,
      r.runUrl ?? '',
    ]);
    exportToCsv(`InferenceX_cache_reuse_${selectedModel}.csv`, headers, body, [
      `${getModelLabel(selectedModel)} • ${getSequenceLabel(selectedSequence, locale)}`,
      selectedConfig?.label ?? '',
      plottedRecipeLabel,
    ]);
    track('cache_reuse_csv_exported', { model: selectedModel });
  }, [t, tableRows, selectedModel, selectedSequence, locale, selectedConfig, plottedRecipeLabel]);

  const legendHwKeys = useMemo(
    () => [...new Set([...availableHwKeys, ...(isUnofficialRun ? overlayAvailableHwKeys : [])])],
    [availableHwKeys, overlayAvailableHwKeys, isUnofficialRun],
  );
  const showsJalapenoPreview = includesJalapenoResult(legendHwKeys);
  const showsVeraRubinPreview = includesVeraRubinResult(legendHwKeys);
  const showsTpuv7Preview = includesTpuv7Result(legendHwKeys);

  const caption = (
    <>
      <Heading as="h2" level="card">
        {t.title}
      </Heading>
      <p className="text-sm text-muted-foreground mb-2">
        {getModelLabel(selectedModel)} • {getSequenceLabel(selectedSequence, locale)}
        {selectedConfig ? ` • ${selectedConfig.label}` : ''}
        {plottedRecipeLabel ? ` • ${plottedRecipeLabel}` : ''} • {t.captionSource}
      </p>
    </>
  );

  const legendElement = (
    <ChartLegend
      variant="sidebar"
      legendItems={legendItems}
      isLegendExpanded={isLegendExpanded}
      onExpandedChange={(expanded) => {
        setIsLegendExpanded(expanded);
        track('cache_reuse_legend_expanded', { expanded });
      }}
      switches={[
        {
          id: 'cache-reuse-ceiling',
          label: t.ceiling,
          checked: showCeiling,
          onCheckedChange: (checked: boolean) => {
            setShowCeiling(checked);
            track('cache_reuse_ceiling_toggled', { enabled: checked });
          },
        },
      ]}
    />
  );

  if (!loading && error) {
    console.error(error);
    return (
      <Card>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          {t.errorLoading}
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section data-testid="cache-reuse-controls">
        <Card className="relative z-30">
          <div className="flex flex-col gap-4">
            <DashboardSectionHeader title={t.title} actions={<ChartShareActions />} />

            <TooltipProvider delayDuration={0}>
              <ControlPanel
                legend={t.benchmarkGroup}
                data-testid="cache-reuse-benchmark-panel"
                className="grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
              >
                <div className="min-w-0 md:col-span-2">
                  <ModelSelector
                    id="cache-reuse-model"
                    data-testid="cache-reuse-model-selector"
                    value={selectedModel}
                    onChange={handleModelChange}
                    open={openDropdown === 'model'}
                    onOpenChange={handleDropdownOpenChange('model')}
                    availableModels={availableModels}
                  />
                </div>
                <ScenarioSelector
                  id="cache-reuse-sequence"
                  data-testid="cache-reuse-sequence-selector"
                  value={selectedSequence}
                  onChange={handleSequenceChange}
                  open={openDropdown === 'sequence'}
                  onOpenChange={handleDropdownOpenChange('sequence')}
                  availableSequences={availableSequences}
                  model={selectedModel}
                />
                <PrecisionSelector
                  id="cache-reuse-precision"
                  data-testid="cache-reuse-precision-selector"
                  value={selectedPrecisions}
                  onChange={handlePrecisionChange}
                  open={openDropdown === 'precision'}
                  onOpenChange={handleDropdownOpenChange('precision')}
                  availablePrecisions={availablePrecisions}
                />
              </ControlPanel>

              <ControlPanel
                legend={t.chartGroup}
                data-testid="cache-reuse-chart-panel"
                className="grid-cols-1 md:grid-cols-2"
              >
                <div className="flex min-w-0 flex-col space-y-1.5">
                  <LabelWithTooltip
                    htmlFor="cache-reuse-config"
                    label={t.configLabel}
                    tooltip={t.configTooltip}
                  />
                  <div data-testid="cache-reuse-config-selector">
                    <MultiSelect
                      triggerId="cache-reuse-config"
                      options={configOptions.map((o) => ({ value: o.key, label: o.label }))}
                      value={selectedConfig ? [selectedConfig.key] : []}
                      onChange={(values) => {
                        const next = values[0];
                        if (next) handleConfigChange(next);
                      }}
                      open={openDropdown === 'config'}
                      onOpenChange={handleDropdownOpenChange('config')}
                      placeholder={t.configPlaceholder}
                      minSelections={1}
                      maxSelections={1}
                      showClearAll={false}
                      plainSelectedText
                      showSelectionSummary={false}
                    />
                  </div>
                </div>
                {result.recipes.length > 1 && (
                  <div className="flex min-w-0 flex-col space-y-1.5">
                    <LabelWithTooltip
                      htmlFor="cache-reuse-recipe"
                      label={t.recipeLabel}
                      tooltip={t.recipeTooltip}
                    />
                    <div data-testid="cache-reuse-recipe-selector">
                      <MultiSelect
                        triggerId="cache-reuse-recipe"
                        options={result.recipes.map((r) => ({
                          value: r.key,
                          label: t.recipeOption(r.label, r.tiered),
                        }))}
                        value={result.recipe ? [result.recipe] : []}
                        onChange={(values) => {
                          const next = values[0];
                          if (next) handleRecipeChange(next);
                        }}
                        open={openDropdown === 'recipe'}
                        onOpenChange={handleDropdownOpenChange('recipe')}
                        placeholder={t.recipeLabel}
                        minSelections={1}
                        maxSelections={1}
                        showClearAll={false}
                        plainSelectedText
                        showSelectionSummary={false}
                      />
                    </div>
                  </div>
                )}
              </ControlPanel>
            </TooltipProvider>
          </div>
        </Card>
      </section>

      {loading && (
        <Card>
          <Skeleton className="h-64 w-full" />
        </Card>
      )}

      {!loading && !hasAnyData && (
        <Card>
          <div
            className="flex items-center justify-center h-64 text-muted-foreground text-center px-6"
            data-testid="cache-reuse-no-data"
          >
            {t.noData}
          </div>
        </Card>
      )}

      {!loading && hasAnyData && (
        <Card>
          <figure data-testid="cache-reuse-figure" className="relative rounded-lg">
            <ChartButtons
              chartId="cache-reuse"
              analyticsPrefix="cache_reuse"
              hideZoomReset
              onExportCsv={handleExportCsv}
              exportFileName={`InferenceX_cache_reuse_${selectedModel}`}
            />
            {showsJalapenoPreview && <JalapenoOfficialPreviewNotice />}
            {showsVeraRubinPreview && <VeraRubinOfficialPreviewNotice />}
            {showsTpuv7Preview && <Tpuv7OfficialPreviewNotice />}
            {hasBars ? (
              <CacheReuseChart
                result={result}
                hardwareConfig={hardwareConfig}
                showCeiling={showCeiling}
                runInfoByIndex={runInfoByIndex}
                legendElement={legendElement}
                caption={caption}
              />
            ) : (
              <>
                <figcaption>{caption}</figcaption>
                <div
                  className="flex items-center justify-center h-48 text-muted-foreground text-center px-6"
                  data-testid="cache-reuse-no-tiers"
                >
                  {isAgenticSequence ? t.noTiers : t.noTiersFixed}
                </div>
              </>
            )}
          </figure>

          {tableRows.length > 0 && (
            <div className="mt-4">
              <DataTable
                data={tableRows}
                columns={columns}
                testId="cache-reuse-table"
                analyticsPrefix="cache_reuse_table"
                searchable={false}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
