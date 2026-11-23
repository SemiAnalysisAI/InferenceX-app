'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { isDarkTheme } from '@/lib/themes/themes';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import type { ComparisonOp } from '@semianalysisai/inferencex-db/operatorx/compare';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { ControlPanel } from '@/components/ui/control-panel';
import { CONTROL_HEIGHT } from '@/components/ui/control-styles';
import { EmptyState } from '@/components/ui/empty-state';
import { Heading } from '@/components/ui/heading';
import { Pending } from '@/components/ui/pending';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { prefetchOperatorXTimelines, useOperatorXComparison } from '@/hooks/api/use-operatorx';
import { useClientSearch } from '@/hooks/useClientSearch';
import { track } from '@/lib/analytics/analytics';
import { useDialogCloseTracking } from '@/lib/analytics/use-dialog-close-tracking';
import { type Model, getModelLabel } from '@/lib/catalog/data-mappings';
import { useLocale } from '@/lib/i18n/use-locale';
import { replaceClientSearch } from '@/lib/routing/client-navigation';

import { CaseDetail } from './CaseDetail';
import { CoverageStrip } from './CoverageStrip';
import {
  ControlGroup,
  OperatorXHeader,
  OperatorXModelSelector,
  useOperatorXModels,
} from './OperatorXHeader';
import {
  hardwareLabel,
  operatorXColors,
  measuredHardware,
  removeHardwareSelection,
  toggleHardwareSelection,
} from './compare/hardware';
import { METRICS, metricById } from './compare/metrics';
import { buildModel, caseRefs, type ComparisonModel } from './compare/model';
import {
  BASELINE_PARAM,
  HARDWARE_PARAM,
  parsePickedHardware,
  setPickedHardware,
  setSearchParam,
  workloadSelection,
} from './compare/url-selection';
import { VISUALIZATIONS } from './viz';
import type { VizDefinition } from './viz/types';

const NO_BASELINE = 'none';

const STRINGS = {
  en: {
    loading: 'Loading results…',
    controlsGroup: 'Comparison config',
    empty: 'No results yet',
    noModelResults: (model: string) => `No OperatorX results for ${model} yet`,
    model: 'Model',
    devices: 'Devices',
    metric: 'Metric',
    baseline: 'Baseline',
    none: 'None',
    oneDevice: '1 GPU',
    loadingModel: (label?: string) => `Loading ${label ?? 'results'}…`,
    tooltips: {
      model: 'The model, or shape list, whose operator shapes are compared.',
      devices:
        'How many GPUs each case is split across (tensor, data, expert or context parallel).',
      metric:
        'The value plotted for each case. Throughput is useful FLOPs over measured latency, per GPU.',
      baseline:
        'The GPU the other GPUs are compared to. Picking one adds the Advantage over baseline chart.',
    },
  },
  zh: {
    loading: '正在加载结果…',
    controlsGroup: '对比配置',
    empty: '暂无结果',
    noModelResults: (model: string) => `${model} 暂无 OperatorX 结果`,
    model: '模型',
    devices: '设备',
    metric: '指标',
    baseline: '基线',
    none: '无',
    oneDevice: '单 GPU',
    loadingModel: (label?: string) => `正在加载${label ? ` ${label}` : '结果'}…`,
    tooltips: {
      model: '参与对比的算子形状所属的模型或形状列表。',
      devices: '每个用例切分到的 GPU 数量（张量、数据、专家或上下文并行）。',
      metric: '每个用例绘制的数值。吞吐量为有效 FLOPs 除以实测延迟，按单 GPU 计算。',
      baseline: '其他 GPU 与之对比的基准 GPU。选择后会增加“相对基线的优势”图。',
    },
  },
};

function setParam(key: string, value: string) {
  const params = new URLSearchParams(window.location.search);
  params.set(key, value);
  replaceClientSearch(params);
}

/**
 * Opens a model's workload; a legacy `workload` id gives way to it. Picking a model drops the
 * GPU picks and baseline, which belong to the old one.
 */
function setModel(value: string, keepSelection = false) {
  const params = new URLSearchParams(window.location.search);
  params.set('model', value);
  params.delete('workload');
  if (!keepSelection) {
    params.delete(HARDWARE_PARAM);
    params.delete(BASELINE_PARAM);
  }
  replaceClientSearch(params);
}

/** The one-device option's select value (its split key is empty). */
const ONE_DEVICE = '1';

function setParallel(value: string) {
  const params = new URLSearchParams(window.location.search);
  if (value === ONE_DEVICE) params.delete('parallel');
  else params.set('parallel', value);
  replaceClientSearch(params);
}

/** A chart's placeholder: its card and title over the plot's height, like the inference charts'. */
function VizSkeleton({ viz, testId }: { viz: VizDefinition; testId?: string }) {
  return (
    <Card data-testid={testId}>
      <Heading as="h2" level="card">
        {viz.title[useLocale()]}
      </Heading>
      <Skeleton aria-hidden="true" className={viz.skeletonClassName} />
    </Card>
  );
}

/** Charts below the first mount once they come within 300px of the viewport, or on focus. */
const VizCard = memo(
  ({ model, viz, eager }: { model: ComparisonModel; viz: VizDefinition; eager: boolean }) => {
    const [mounted, setMounted] = useState(eager);
    const card = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (mounted) return;
      if (eager || typeof IntersectionObserver === 'undefined') {
        setMounted(true);
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setMounted(true);
          }
        },
        { rootMargin: '300px' },
      );
      if (card.current) observer.observe(card.current);
      return () => observer.disconnect();
    }, [eager, mounted]);
    return (
      <div
        ref={card}
        data-testid={`operatorx-viz-${viz.id}`}
        aria-busy={!mounted}
        tabIndex={mounted ? undefined : 0}
        onFocus={() => setMounted(true)}
        className="min-w-0"
      >
        {mounted ? <viz.Component model={model} /> : <VizSkeleton viz={viz} />}
      </div>
    );
  },
);

function visibleVisualizations(op: ComparisonOp, baseline: string | null): VizDefinition[] {
  return VISUALIZATIONS.filter((v) => v.ops.includes(op) && (baseline || !v.needsBaseline));
}

const CONTROL_LABELS = ['model', 'devices', 'metric', 'baseline'] as const;

/**
 * Loading state laid out like the loaded dashboard (header and controls card, then each
 * chart's placeholder), so the content that replaces it does not move the cards or the
 * footer under a reader who has already scrolled.
 */
function ComparisonSkeleton({ op }: { op: ComparisonOp }) {
  const strings = STRINGS[useLocale()];
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="operatorx-loading"
      aria-busy="true"
      aria-label={strings.loading}
    >
      <OperatorXHeader>
        <ControlPanel
          legend={strings.controlsGroup}
          className="gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          {CONTROL_LABELS.map((key) => (
            <ControlGroup
              key={key}
              label={strings[key]}
              tooltip={strings.tooltips[key]}
              className={key === 'model' ? 'lg:col-span-2' : undefined}
            >
              <Skeleton aria-hidden="true" className={CONTROL_HEIGHT.default} />
            </ControlGroup>
          ))}
        </ControlPanel>
        <div className="border-t border-border/30 pt-3">
          <Skeleton aria-hidden="true" className="h-[106px] lg:h-[62px]" />
        </div>
      </OperatorXHeader>
      {visibleVisualizations(op, null).map((viz) => (
        <VizSkeleton key={viz.id} viz={viz} testId={`operatorx-viz-skeleton-${viz.id}`} />
      ))}
    </div>
  );
}

export function ComparisonDashboard({ op }: { op: ComparisonOp }) {
  const locale = useLocale();
  const strings = STRINGS[locale];
  const search = new URLSearchParams(useClientSearch());
  const metric = metricById(search.get('metric'));
  const {
    data: view,
    error,
    isLoading,
    isPlaceholderData: switching,
    refetch,
  } = useOperatorXComparison(
    op,
    search.get('workload') ?? search.get('model'),
    search.get('parallel'),
  );
  const models = useOperatorXModels();
  const theme = isDarkTheme(useTheme().resolvedTheme) ? 'dark' : 'light';
  // GPU picks and the baseline live in the address bar so share links reproduce them.
  const pickedParam = search.get(HARDWARE_PARAM);
  const picked = useMemo(() => parsePickedHardware(pickedParam), [pickedParam]);
  const pickedBaseline = search.get(BASELINE_PARAM);
  const [inspected, setInspected] = useState<number | null>(null);
  const queryClient = useQueryClient();
  useDialogCloseTracking(inspected !== null, 'operatorx_case_closed', { op });

  // GPUs with measured results at the selected device split
  const available = useMemo(() => (view ? measuredHardware([view]) : []), [view]);
  const colors = useMemo(
    () => operatorXColors(view?.hardware.map((h) => h.id) ?? [], theme),
    [view, theme],
  );
  const hardware = useMemo(
    () => (picked ? available.filter((h) => picked.includes(h)) : available),
    [picked, available],
  );
  const baseline = pickedBaseline && hardware.includes(pickedBaseline) ? pickedBaseline : null;
  // Charts, legend, GPU control and case detail all read this same live state.
  const model = useMemo(() => {
    if (!view) return null;
    const pick = (next: string[]) => {
      if (next === hardware) return;
      setPickedHardware(next.length === available.length ? null : next);
    };
    const toggle = (hw: string) => {
      track('operatorx_gpu_toggled', { op, gpu: hw, placement: 'chart' });
      pick(toggleHardwareSelection(hardware, hw, available));
    };
    const remove = (hw: string) => {
      track('operatorx_gpu_removed', { op, gpu: hw, placement: 'chart' });
      pick(removeHardwareSelection(hardware, hw));
    };
    const reset = () => {
      track('operatorx_legend_filter_reset', { op });
      setPickedHardware(null);
    };
    const inspect = (index: number) => {
      track('operatorx_case_opened', { op, metric: metric.id });
      setInspected(index);
    };
    const preview = (i: number) =>
      prefetchOperatorXTimelines(
        queryClient,
        op,
        caseRefs(view, hardware, i).map((r) => r.ref),
      );
    return buildModel(
      view,
      metric,
      { hardware, available, toggle, remove, reset },
      colors,
      baseline,
      {
        inspect,
        preview,
      },
    );
  }, [view, metric, hardware, available, colors, baseline, queryClient, op]);

  // The selector lists InferenceX models; a legacy `workload` id or an unknown model gives way
  // to the model of the workload shown, keeping the link's GPU picks.
  const legacyWorkload = search.has('workload');
  const requested = legacyWorkload ? null : search.get('model');
  const selection = useMemo(
    () => view && workloadSelection(view.workloads, view.workload, models, requested),
    [view, models, requested],
  );
  useEffect(() => {
    if (!selection || switching || models.length === 0) return;
    if (legacyWorkload || (requested && requested !== selection.model))
      setModel(selection.model, true);
  }, [selection, switching, models, legacyWorkload, requested]);

  if (error)
    return (
      <>
        <OperatorXHeader />
        <RetryableQueryError
          message={error.message}
          analyticsEvent="operatorx_comparison_retry"
          onRetry={refetch}
          testId="operatorx-comparison-error"
        />
      </>
    );
  if (isLoading || !view || !model || !selection) return <ComparisonSkeleton op={op} />;
  if (view.workloads.length === 0)
    return (
      <>
        <OperatorXHeader />
        <EmptyState>{strings.empty}</EmptyState>
      </>
    );

  return (
    <div className="flex flex-col gap-4">
      <OperatorXHeader>
        <ControlPanel
          legend={strings.controlsGroup}
          className="gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-5"
          data-testid="operatorx-controls"
        >
          <OperatorXModelSelector
            id="operatorx-workload"
            value={selection.model}
            models={models}
            other={selection.other}
            onChange={(v) => {
              track('operatorx_model_selected', { op, model: v });
              setModel(v);
            }}
          />
          <ControlGroup
            label={strings.devices}
            tooltip={strings.tooltips.devices}
            htmlFor="operatorx-parallel"
          >
            <SearchableSelect
              triggerId="operatorx-parallel"
              value={view.parallel || ONE_DEVICE}
              onValueChange={(v) => {
                track('operatorx_parallel_selected', { op, parallel: v });
                setParallel(v);
              }}
              searchable={false}
              groups={[
                {
                  label: '',
                  options: view.parallelOptions.map((o) => ({
                    value: o.key || ONE_DEVICE,
                    label: o.key ? o.label : strings.oneDevice,
                  })),
                },
              ]}
            />
          </ControlGroup>
          <ControlGroup
            label={strings.metric}
            tooltip={strings.tooltips.metric}
            htmlFor="operatorx-metric"
          >
            <SearchableSelect
              triggerId="operatorx-metric"
              value={metric.id}
              onValueChange={(v) => {
                track('operatorx_metric_selected', { op, metric: v });
                setParam('metric', v);
              }}
              searchable={false}
              groups={[
                {
                  label: '',
                  options: METRICS.map((m) => ({
                    value: m.id,
                    label:
                      locale === 'zh' ? `${m.label.zh}（${m.unit}）` : `${m.label.en} (${m.unit})`,
                  })),
                },
              ]}
            />
          </ControlGroup>

          <ControlGroup
            label={strings.baseline}
            tooltip={strings.tooltips.baseline}
            htmlFor="operatorx-baseline"
          >
            <SearchableSelect
              triggerId="operatorx-baseline"
              value={baseline ?? NO_BASELINE}
              onValueChange={(v) => {
                track('operatorx_baseline_selected', { op, gpu: v });
                setSearchParam(BASELINE_PARAM, v === NO_BASELINE ? null : v);
              }}
              searchable={false}
              groups={[
                {
                  label: '',
                  options: [
                    { value: NO_BASELINE, label: strings.none },
                    ...hardware.map((h) => ({ value: h, label: hardwareLabel(h) })),
                  ],
                },
              ]}
            />
          </ControlGroup>
        </ControlPanel>
        {selection.measured && (
          <div className="border-t border-border/30 pt-3">
            <CoverageStrip model={model} />
          </div>
        )}
      </OperatorXHeader>
      {selection.measured ? (
        <Pending
          active={switching}
          label={strings.loadingModel(getModelLabel(selection.model as Model))}
        >
          <div className="flex flex-col gap-4">
            {visibleVisualizations(op, baseline).map((viz, index) => (
              <VizCard key={viz.id} model={model} viz={viz} eager={index === 0} />
            ))}
          </div>
        </Pending>
      ) : (
        <EmptyState className="min-h-80" data-testid="operatorx-model-empty">
          {strings.noModelResults(getModelLabel(selection.model as Model))}
        </EmptyState>
      )}
      <CaseDetail
        op={op}
        view={view}
        hardware={hardware}
        colors={colors}
        caseIndex={inspected}
        onClose={() => setInspected(null)}
      />
    </div>
  );
}
