'use client';

import { ControlPanel } from '@/components/ui/control-panel';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { metricLabel, X_METRICS, Y_METRICS, type XMetricId, type YMetricId } from './metrics';
import VideoApiReference from './VideoApiReference';
import VideoSelect from './VideoSelect';
import { metricOptions, type VideoDashboardState } from './video-url-state';

const STRINGS = {
  en: {
    benchmark: 'Benchmark config',
    chart: 'Chart config',
    model: 'Model',
    workload: 'Workload',
    deployment: 'Deployment',
    x: 'X-axis metric',
    y: 'Y-axis metric',
  },
  zh: {
    benchmark: '基准测试配置',
    chart: '图表配置',
    model: '模型',
    workload: '工作负载',
    deployment: '部署',
    x: 'X 轴指标',
    y: 'Y 轴指标',
  },
};

/** A fixed fact of the campaign, laid out like a control so the panel reads as one row. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="video-config-fact">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex min-h-9 items-center text-sm break-words">{value}</span>
    </div>
  );
}

/**
 * Two control panels mirroring the inference tab: what is being compared
 * (frozen for this campaign, so model, workload and deployment are stated,
 * not selectable, beside the one editable input, the API list price) and
 * how it is plotted (the axes; the cost tier sits in the chart caption).
 */
export default function VideoConfigBar({
  state,
  onChange,
  modelLabel,
  workloadLabel,
  deploymentLabel,
}: {
  state: VideoDashboardState;
  onChange: (patch: Partial<VideoDashboardState>) => void;
  modelLabel: string;
  workloadLabel: string;
  /** Measured server layouts (GPUs per video and model split). */
  deploymentLabel: string;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const options = metricOptions(state);
  const change = <K extends keyof VideoDashboardState>(key: K, value: VideoDashboardState[K]) => {
    onChange({ [key]: value } as Partial<VideoDashboardState>);
    track(`video_${key}_changed`, { value: String(value) });
  };
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="video-config-bar">
      <ControlPanel legend={s.benchmark} className="sm:grid-cols-2 xl:grid-cols-4">
        <Fact label={s.model} value={modelLabel} />
        <Fact label={s.workload} value={workloadLabel} />
        <Fact label={s.deployment} value={deploymentLabel} />
        <VideoApiReference value={state.apiPrice} onChange={(apiPrice) => onChange({ apiPrice })} />
      </ControlPanel>
      <ControlPanel legend={s.chart} className="sm:grid-cols-2">
        <VideoSelect
          label={s.x}
          value={state.x}
          onValueChange={(value) => change('x', value as XMetricId)}
          options={X_METRICS.map((id) => ({ value: id, label: metricLabel(id, locale, options) }))}
        />
        <VideoSelect
          label={s.y}
          value={state.y}
          onValueChange={(value) => change('y', value as YMetricId)}
          options={Y_METRICS.map((id) => ({ value: id, label: metricLabel(id, locale, options) }))}
        />
      </ControlPanel>
    </div>
  );
}
