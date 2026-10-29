import { CompareInterpolatedTable } from '@/components/compare/compare-interpolated-table';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  type CompareTableViewInput,
  resolveCompareTableView,
} from '@/lib/compare/compare-table-view';

const STRINGS = {
  en: {
    loading: 'Loading comparison data for the selected workload…',
    error:
      'Comparison data for the selected workload failed to load. Reload the page or choose another sequence in the chart controls below.',
    empty:
      'No interpolated comparison data is available for the selected workload. Choose another sequence in the chart controls below.',
  },
  zh: {
    loading: '正在加载所选工作负载的对比数据…',
    error: '所选工作负载的对比数据加载失败。请刷新页面，或在下方图表控件中选择其他序列。',
    empty: '所选工作负载暂时没有可用于插值对比的数据。请在下方图表控件中选择其他序列。',
  },
} as const;

interface CompareTableRendererProps extends CompareTableViewInput {
  aLabel: string;
  bLabel: string;
  /** Empty state for the server-rendered sequence. */
  emptyStateText: string;
  visibleMetricLabels?: string[];
  metricLabelOverrides?: Record<string, string>;
}

export function CompareTableRenderer({
  aLabel,
  bLabel,
  emptyStateText,
  visibleMetricLabels,
  metricLabelOverrides,
  ...viewInput
}: CompareTableRendererProps) {
  const t = STRINGS[useLocale()];
  const view = resolveCompareTableView(viewInput);

  if (view.status !== 'table') {
    const text = {
      'ssr-empty': emptyStateText,
      loading: t.loading,
      error: t.error,
      empty: t.empty,
    }[view.status];
    return (
      <div
        className="border border-border/50 rounded-md px-4 py-3 text-sm text-muted-foreground bg-muted/30"
        data-testid="compare-table-status"
        data-status={view.status}
        role={view.status === 'error' ? 'alert' : 'status'}
      >
        {text}
      </div>
    );
  }

  return (
    <CompareInterpolatedTable
      key={view.key}
      aLabel={aLabel}
      bLabel={bLabel}
      ssrRows={view.data.ssrRows}
      defaultTargets={view.data.defaultTargets}
      interactivityRange={view.interactivityRange}
      gpuDataPointsA={view.pointsA}
      gpuDataPointsB={view.pointsB}
      visibleMetricLabels={visibleMetricLabels}
      metricLabelOverrides={metricLabelOverrides}
    />
  );
}
