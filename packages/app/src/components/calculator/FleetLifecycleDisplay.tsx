'use client';

import { useCallback, useMemo, useState } from 'react';

import FleetLifecycle from '@/components/calculator/FleetLifecycle';
import {
  resolveCalculatorTarget,
  resolveCalculatorTargetInputValue,
  resolveCalculatorVisibility,
  type CalculatorVisibilityIntent,
} from '@/components/calculator/ThroughputCalculatorDisplay';
import type { CalculatorUrlSeed } from '@/components/calculator/url-seed';
import {
  GlobalFilterProvider,
  useGlobalFilterActions,
  useGlobalFilterAvailability,
  useGlobalFilterRun,
  useGlobalFilterSelection,
} from '@/components/GlobalFilterContext';
import { Card } from '@/components/ui/card';
import ChartLegendItem from '@/components/ui/chart-legend-item';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import {
  ModelSelector,
  PercentileSelector,
  PrecisionSelector,
  ScenarioSelector,
} from '@/components/ui/chart-selectors';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useOpenDropdown } from '@/hooks/useOpenDropdown';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics';
import { getModelSortIndex } from '@/lib/constants';
import { Percentile, Sequence, type Model } from '@/lib/data-mappings';
import { DEFAULT_FLEET_MW, readUrlParams, writeUrlParams } from '@/lib/url-state';
import { useFeatureGate } from '@/lib/use-feature-gate';
import { useLocale } from '@/lib/use-locale';
import { getDisplayLabel } from '@/lib/utils';

import type { CostProvider, CostType } from './types';
import { useThroughputData } from './useThroughputData';

const COST_PROVIDER_OPTIONS: {
  value: CostProvider;
  label: string;
  labelZh: string;
}[] = [
  { value: 'costh', label: 'Hyperscaler', labelZh: '超大规模云服务商' },
  { value: 'costn', label: 'Neocloud', labelZh: 'Neocloud' },
  { value: 'costr', label: '3yr Rental', labelZh: '3 年租赁' },
];

const COST_TYPE_OPTIONS: { value: CostType; label: string }[] = [
  { value: 'total', label: 'Total Tokens' },
  { value: 'input', label: 'Input Tokens' },
  { value: 'output', label: 'Output Tokens' },
];

const STRINGS = {
  en: {
    title: 'Fleet Lifecycle',
    description:
      'Pick the model, workload, and target interactivity. The projection below sizes a fixed fleet of each chip against a facility power budget and reads the full run history at this operating point — see the section itself for what the lines mean.',
    costProviderLabel: 'Cost Provider',
    costProviderTooltip:
      'The pricing tier used for the fleet cost line. Hyperscaler (e.g. AWS/GCP), Neocloud (e.g. CoreWeave), or 3-year rental.',
    costProviderPlaceholder: 'Cost provider',
    tokenTypeLabel: 'Token Type',
    tokenTypeTooltip:
      'Whether the per-chip figures quoted in the table use total tokens, input tokens only, or output tokens only. Revenue always counts both streams.',
    tokenTypePlaceholder: 'Token type',
    targetLabel: 'Target Interactivity (tok/s/user)',
    targetTooltip:
      'The interactivity operating point used for interpolation. Each chip\u2019s fleet serves this speed; every run date is read at it.',
    targetAgenticLabel: (percentile: string) => `Target ${percentile} Interactivity (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `The ${percentile} interactivity operating point used for agentic workload interpolation. Each chip\u2019s fleet serves this speed; every run date is read at it.`,
    errorLoading: 'Error loading data. Please try a different selection.',
    highContrast: 'High Contrast',
    resetFilter: 'Reset filter',
  },
  zh: {
    title: '集群生命周期',
    description:
      '选择模型、工作负载与目标交互性。下方的测算会按设施功率预算确定各芯片固定集群的规模，并在该操作点上读取完整运行历史——各条曲线的含义见板块内说明。',
    costProviderLabel: '成本供应商',
    costProviderTooltip:
      '集群成本线采用的定价层级。Hyperscaler（如 AWS/GCP）、Neocloud（如 CoreWeave）或 3 年租赁。',
    costProviderPlaceholder: '成本供应商',
    tokenTypeLabel: 'Token 类型',
    tokenTypeTooltip:
      '表格中每芯片指标按总 token、仅输入 token 还是仅输出 token 计。收入始终同时计入两类 token。',
    tokenTypePlaceholder: 'Token 类型',
    targetLabel: '目标交互性 (tok/s/user)',
    targetTooltip:
      '用于插值的交互性操作点。每款芯片的集群按此速度提供服务；每个运行日期都在该点读取。',
    targetAgenticLabel: (percentile: string) => `目标 ${percentile} 交互性 (tok/s/user)`,
    targetAgenticTooltip: (percentile: string) =>
      `用于智能体工作负载插值的 ${percentile} 交互性操作点。每款芯片的集群按此速度提供服务；每个运行日期都在该点读取。`,
    errorLoading: '加载数据出错，请尝试其他选择。',
    highContrast: '高对比度',
    resetFilter: '重置筛选',
  },
} as const;

const COST_TYPE_LABELS_ZH: Record<CostType, string> = {
  total: '总 Token',
  input: '输入 Token',
  output: '输出 Token',
};

export default function FleetLifecycleDisplay({ urlSeed }: { urlSeed?: CalculatorUrlSeed }) {
  return (
    <GlobalFilterProvider
      initialModel={urlSeed?.model}
      initialSequence={urlSeed?.sequence}
      initialPrecisions={urlSeed?.precisions}
      initialRunDate={urlSeed?.runDate}
      initialRunId={urlSeed?.runId}
    >
      <FleetLifecycleInner initialPercentile={urlSeed?.percentile ?? Percentile.P90} />
    </GlobalFilterProvider>
  );
}

function FleetLifecycleInner({ initialPercentile }: { initialPercentile: Percentile }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { setUrlParam } = useUrlState();
  const { openDropdown, handleDropdownOpenChange } = useOpenDropdown();

  const {
    selectedModel,
    effectiveSequence: selectedSequence,
    effectivePrecisions: selectedPrecisions,
  } = useGlobalFilterSelection();
  const { setSelectedModel, setSelectedSequence, setSelectedPrecisions } = useGlobalFilterActions();
  const { selectedRunDate } = useGlobalFilterRun();
  const { availablePrecisions, availableSequences, availableModels } =
    useGlobalFilterAvailability();
  const mode = 'interactivity_to_throughput' as const;
  const [costProvider, setCostProvider] = useState<CostProvider>('costh');
  const [costType, setCostType] = useState<CostType>('total');
  const [requestedTargetValue, setRequestedTargetValue] = useState<number>(35);
  const [inputValue, setInputValue] = useState<string>('35');
  const [isTargetInputFocused, setIsTargetInputFocused] = useState(false);
  const [selectedPercentile, setSelectedPercentile] = useState<Percentile>(initialPercentile);
  // Owned here so the `c_mw` URL seed is read once, at the page level — the
  // lifecycle section renders the input and is its only consumer.
  const [mwInput, setMwInput] = useState<string>(() => readUrlParams().c_mw ?? DEFAULT_FLEET_MW);
  const [visibilityIntent, setVisibilityIntent] = useState<CalculatorVisibilityIntent | null>(null);
  const [highContrast, setHighContrast] = useState(false);

  const { hardwareConfig, ranges, loading, error, hasData, availableHwKeys } = useThroughputData(
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    selectedRunDate,
    undefined,
    selectedPercentile,
    undefined,
    true,
    costType,
  );

  const isAgenticSequence = selectedSequence === Sequence.AgenticTraces;
  // AgentX publishes on P90, so the percentile control stays behind the
  // ↑↑↓↓ feature gate, matching the calculator.
  const featureGateUnlocked = useFeatureGate();
  const percentileLabel = selectedPercentile.toUpperCase();

  const handleMwInputChange = useCallback((raw: string) => {
    setMwInput(raw);
    const parsed = parseFloat(raw);
    writeUrlParams({ c_mw: Number.isFinite(parsed) && parsed > 0 ? raw : '' });
  }, []);

  // The selection key represents user-driven scope, mirroring the calculator's
  // rule: a data or filter transition reseeds visibility to everything.
  const selectionKey = `${selectedModel}|${selectedSequence}|${[...selectedPrecisions]
    .toSorted()
    .join(',')}|${selectedRunDate}|${[...availableHwKeys].toSorted().join(',')}`;

  const visibleHwKeys = useMemo(
    () => resolveCalculatorVisibility(visibilityIntent, selectionKey, availableHwKeys),
    [visibilityIntent, selectionKey, availableHwKeys],
  );
  const visibleKeysArray = useMemo(() => [...visibleHwKeys], [visibleHwKeys]);
  const { resolveColor } = useThemeColors({
    highContrast,
    activeKeys: visibleKeysArray,
  });

  const targetValue = useMemo(
    () => resolveCalculatorTarget(requestedTargetValue, hasData, ranges.interactivity),
    [hasData, ranges.interactivity, requestedTargetValue],
  );
  const currentRange = ranges.interactivity;

  const handleSliderChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setRequestedTargetValue(value);
    setInputValue(String(value));
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed) && parsed >= 0) {
      setRequestedTargetValue(parsed);
    }
  }, []);

  const handleInputFocus = useCallback(() => {
    setInputValue(String(targetValue));
    setIsTargetInputFocused(true);
  }, [targetValue]);

  const handleInputBlur = useCallback(() => {
    const parsed = parseFloat(inputValue);
    if (isNaN(parsed) || parsed < 0) {
      setInputValue(String(targetValue));
    } else {
      const { min, max } = ranges.interactivity;
      const clamped = Math.max(min, Math.min(max, parsed));
      setRequestedTargetValue(clamped);
      setInputValue(String(clamped));
    }
    setIsTargetInputFocused(false);
    track('fleet_target_set', { mode, value: targetValue });
  }, [inputValue, targetValue, mode, ranges.interactivity]);

  const handleModelChange = useCallback(
    (value: string) => {
      setVisibilityIntent(null);
      setSelectedModel(value as Model);
      track('fleet_model_selected', { model: value });
    },
    [setSelectedModel],
  );

  const handleSequenceChange = useCallback(
    (value: string) => {
      setVisibilityIntent(null);
      setSelectedSequence(value as Sequence);
      track('fleet_sequence_selected', { sequence: value });
    },
    [setSelectedSequence],
  );

  const handlePrecisionChange = useCallback(
    (value: string[]) => {
      setVisibilityIntent(null);
      setSelectedPrecisions(value);
      track('fleet_precision_selected', { precision: value.join(',') });
    },
    [setSelectedPrecisions],
  );

  const handlePercentileChange = useCallback(
    (value: Percentile) => {
      setSelectedPercentile(value);
      setUrlParam('i_pctl', value);
      track('fleet_percentile_selected', { percentile: value });
    },
    [setUrlParam],
  );

  const toggleGpuVisibility = useCallback(
    (hwKey: string) => {
      const visibleLegendKeys = availableHwKeys.filter((key) => visibleHwKeys.has(key));
      const allVisible = visibleLegendKeys.length === availableHwKeys.length;
      const isVisible = visibleHwKeys.has(hwKey);
      let next: Set<string>;
      if (isVisible && allVisible) {
        next = new Set([hwKey]);
      } else if (isVisible && visibleLegendKeys.length === 1) {
        next = new Set(availableHwKeys);
      } else {
        next = new Set(visibleHwKeys);
        if (isVisible) next.delete(hwKey);
        else next.add(hwKey);
      }
      setVisibilityIntent({
        scopeKey: selectionKey,
        visible: next,
        known: new Set(availableHwKeys),
      });
      track('fleet_gpu_toggled', { gpu: hwKey });
    },
    [availableHwKeys, visibleHwKeys, selectionKey],
  );

  const handleResetGpus = useCallback(() => {
    setVisibilityIntent({
      scopeKey: selectionKey,
      visible: new Set(availableHwKeys),
      known: new Set(availableHwKeys),
    });
    track('fleet_gpu_reset', { gpuCount: availableHwKeys.length });
  }, [availableHwKeys, selectionKey]);

  // The legend filters which chips are candidates for the lifecycle lines,
  // exactly as the calculator's chart legend did when the section lived there.
  // It renders in the controls card rather than inside the chart so it stays
  // reachable from the table view and — critically — after isolating a config
  // that is unplottable at the current target, when the chart itself unmounts.
  const legendItems = useMemo(
    () =>
      Object.entries(hardwareConfig)
        .filter(([key]) => availableHwKeys.includes(key))
        .toSorted(([a], [b]) => getModelSortIndex(a) - getModelSortIndex(b) || a.localeCompare(b))
        .map(([key, config]) => ({
          name: config.name,
          label: getDisplayLabel(config),
          color: resolveColor(key),
          title: config.gpu,
          hw: key,
          isActive: visibleHwKeys.has(key),
          onClick: () => toggleGpuVisibility(key),
        })),
    [hardwareConfig, availableHwKeys, visibleHwKeys, resolveColor, toggleGpuVisibility],
  );

  const costTypeLabels: Record<CostType, string> = useMemo(
    () =>
      locale === 'zh'
        ? COST_TYPE_LABELS_ZH
        : { total: 'Total Tokens', input: 'Input Tokens', output: 'Output Tokens' },
    [locale],
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
      <section data-testid="fleet-controls">
        <Card className="relative z-30">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-2">{t.title}</h2>
                <p className="text-muted-foreground text-sm mb-4">{t.description}</p>
              </div>
              <ChartShareActions />
            </div>

            <TooltipProvider delayDuration={0}>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
                  isAgenticSequence ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
                }`}
              >
                <ModelSelector
                  id="fleet-model"
                  data-testid="fleet-model-selector"
                  value={selectedModel}
                  onChange={handleModelChange}
                  open={openDropdown === 'model'}
                  onOpenChange={handleDropdownOpenChange('model')}
                  availableModels={availableModels}
                />
                <ScenarioSelector
                  id="fleet-sequence"
                  data-testid="fleet-sequence-selector"
                  value={selectedSequence}
                  onChange={handleSequenceChange}
                  open={openDropdown === 'sequence'}
                  onOpenChange={handleDropdownOpenChange('sequence')}
                  availableSequences={availableSequences}
                  model={selectedModel}
                />
                {isAgenticSequence && featureGateUnlocked && (
                  <PercentileSelector
                    id="fleet-percentile"
                    data-testid="fleet-percentile-selector"
                    value={selectedPercentile}
                    onChange={handlePercentileChange}
                  />
                )}
                <PrecisionSelector
                  id="fleet-precision"
                  data-testid="fleet-precision-selector"
                  value={selectedPrecisions}
                  onChange={handlePrecisionChange}
                  open={openDropdown === 'precision'}
                  onOpenChange={handleDropdownOpenChange('precision')}
                  availablePrecisions={availablePrecisions}
                />

                <div className="flex flex-col space-y-1.5 lg:col-span-1">
                  <LabelWithTooltip
                    htmlFor="fleet-cost"
                    label={t.costProviderLabel}
                    tooltip={t.costProviderTooltip}
                  />
                  <div id="fleet-cost" data-testid="fleet-cost-selector">
                    <MultiSelect
                      options={COST_PROVIDER_OPTIONS.map((provider) => ({
                        value: provider.value,
                        label: locale === 'zh' ? provider.labelZh : provider.label,
                      }))}
                      value={[costProvider]}
                      onChange={(values) => {
                        const next = values[0];
                        if (!next) return;
                        setCostProvider(next as CostProvider);
                        track('fleet_cost_provider_changed', { provider: next });
                      }}
                      open={openDropdown === 'costProvider'}
                      onOpenChange={handleDropdownOpenChange('costProvider')}
                      placeholder={t.costProviderPlaceholder}
                      minSelections={1}
                      maxSelections={1}
                      showClearAll={false}
                      searchable={false}
                      plainSelectedText
                      showSelectionSummary={false}
                    />
                  </div>
                </div>

                <div className="flex flex-col space-y-1.5 lg:col-span-1">
                  <LabelWithTooltip
                    htmlFor="fleet-cost-type"
                    label={t.tokenTypeLabel}
                    tooltip={t.tokenTypeTooltip}
                  />
                  <div id="fleet-cost-type" data-testid="fleet-cost-type-selector">
                    <MultiSelect
                      options={COST_TYPE_OPTIONS.map((ct) => ({
                        value: ct.value,
                        label: costTypeLabels[ct.value],
                      }))}
                      value={[costType]}
                      onChange={(values) => {
                        const next = values[0];
                        if (!next) return;
                        setCostType(next as CostType);
                        track('fleet_cost_type_changed', { costType: next });
                      }}
                      open={openDropdown === 'costType'}
                      onOpenChange={handleDropdownOpenChange('costType')}
                      placeholder={t.tokenTypePlaceholder}
                      minSelections={1}
                      maxSelections={1}
                      showClearAll={false}
                      searchable={false}
                      plainSelectedText
                      showSelectionSummary={false}
                    />
                  </div>
                </div>
              </div>

              {/* Target value slider + input */}
              {!loading && hasData && (
                <div className="space-y-2">
                  <LabelWithTooltip
                    htmlFor="fleet-target"
                    label={
                      isAgenticSequence ? t.targetAgenticLabel(percentileLabel) : t.targetLabel
                    }
                    tooltip={
                      isAgenticSequence ? t.targetAgenticTooltip(percentileLabel) : t.targetTooltip
                    }
                  />
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <input
                        id="fleet-target"
                        type="range"
                        min={currentRange.min}
                        max={currentRange.max}
                        step={1}
                        value={targetValue}
                        onChange={handleSliderChange}
                        onPointerUp={() =>
                          track('fleet_target_slider_set', { mode, value: targetValue })
                        }
                        className="w-full h-2 appearance-none rounded-full bg-secondary cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                        [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                        [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                        [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary
                        [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
                      />
                      <div
                        className="relative h-4 text-xs text-muted-foreground"
                        style={{ marginLeft: 8, marginRight: 8 }}
                      >
                        {Array.from({ length: 6 }, (_, i) => (
                          <span
                            key={i}
                            className="absolute -translate-x-1/2"
                            style={{ left: `${(i / 5) * 100}%` }}
                          >
                            {Math.round(
                              currentRange.min + (currentRange.max - currentRange.min) * (i / 5),
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Input
                      type="number"
                      value={resolveCalculatorTargetInputValue(
                        inputValue,
                        targetValue,
                        isTargetInputFocused,
                      )}
                      onFocus={handleInputFocus}
                      onChange={handleInputChange}
                      onBlur={handleInputBlur}
                      className="w-24 h-9"
                      min={0}
                    />
                  </div>
                </div>
              )}
            </TooltipProvider>

            {!loading && legendItems.length > 0 && (
              <div
                data-testid="fleet-legend"
                className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3"
              >
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {legendItems.map((item) => (
                    <ChartLegendItem key={item.hw} {...item} sidebarMode />
                  ))}
                </ul>
                {visibleHwKeys.size < availableHwKeys.length && (
                  <button
                    type="button"
                    data-testid="fleet-reset-filter"
                    onClick={handleResetGpus}
                    className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
                  >
                    {t.resetFilter}
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <Switch
                    id="fleet-high-contrast"
                    data-testid="fleet-high-contrast"
                    checked={highContrast}
                    onCheckedChange={(checked: boolean) => {
                      setHighContrast(checked);
                      track('fleet_high_contrast_toggled', { enabled: checked });
                    }}
                  />
                  <Label
                    htmlFor="fleet-high-contrast"
                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {t.highContrast}
                  </Label>
                </div>
              </div>
            )}
          </div>
        </Card>
      </section>

      {loading && (
        <Card>
          <Skeleton className="h-64 w-full" />
        </Card>
      )}

      {!loading && hasData && (
        <FleetLifecycle
          hardwareConfig={hardwareConfig}
          costProvider={costProvider}
          costType={costType}
          targetValue={targetValue}
          mode={mode}
          visibleHwKeys={visibleHwKeys}
          selectedModel={selectedModel}
          selectedSequence={selectedSequence}
          selectedPrecisions={selectedPrecisions}
          selectedPercentile={selectedPercentile}
          mwInput={mwInput}
          onMwInputChange={handleMwInputChange}
          colorResolver={resolveColor}
        />
      )}
    </div>
  );
}
