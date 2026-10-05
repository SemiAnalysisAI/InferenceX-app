'use client';

import { ControlPanel } from '@/components/ui/control-panel';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { metricLabel, X_METRICS, Y_METRICS, type XMetricId, type YMetricId } from './metrics';
import VideoApiReference from './VideoApiReference';
import VideoSelect from './VideoSelect';
import { VIDEO_MODELS, type VideoModel } from './models';
import { metricOptions, type VideoDashboardState } from './video-url-state';
import { QUALITY_METRICS, QUALITY_METRIC_IDS, type QualityMetricId } from './quality';

const STRINGS = {
  en: {
    benchmark: 'Benchmark config',
    chart: 'Chart config',
    model: 'Model',
    workload: 'Workload',
    deployment: 'Deployment',
    x: 'X-axis metric',
    y: 'Y-axis metric',
    quality: 'Quality dimension',
    threshold: 'Quality threshold (minimum)',
    off: 'Off — descriptive performance',
  },
  zh: {
    benchmark: '基准测试配置',
    chart: '图表配置',
    model: '模型',
    workload: '工作负载',
    deployment: '部署',
    x: 'X 轴指标',
    y: 'Y 轴指标',
    quality: '质量维度',
    threshold: '质量阈值（最低评分）',
    off: '关闭 — 仅描述性能',
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
 * (model selection, observed workload and deployment, plus API price) and
 * how it is plotted (the axes; the cost tier sits in the chart caption).
 */
export default function VideoConfigBar({
  state,
  onChange,
  workloadLabel,
  deploymentLabel,
}: {
  state: VideoDashboardState;
  onChange: (patch: Partial<VideoDashboardState>) => void;
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
        <VideoSelect
          label={s.model}
          value={state.model}
          onValueChange={(value) => change('model', value as VideoModel)}
          options={Object.entries(VIDEO_MODELS).map(([value, model]) => ({
            value,
            label: model.label,
          }))}
        />
        <Fact label={s.workload} value={workloadLabel} />
        <Fact label={s.deployment} value={deploymentLabel} />
        <VideoApiReference
          model={state.model}
          value={state.apiPrice}
          onChange={(apiPrice) => onChange({ apiPrice })}
        />
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
          options={Y_METRICS.filter((id) => state.model === 'h3' || id !== 'quality').map((id) => ({
            value: id,
            label: metricLabel(id, locale, options),
          }))}
        />
        {state.model === 'h3' && (
          <>
            <VideoSelect
              label={s.quality}
              value={state.qualityMetric}
              onValueChange={(value) => change('qualityMetric', value as QualityMetricId)}
              options={QUALITY_METRIC_IDS.map((id) => ({
                value: id,
                label: locale === 'zh' ? QUALITY_METRICS[id].labelZh : QUALITY_METRICS[id].label,
              }))}
            />
            <VideoSelect
              label={s.threshold}
              value={state.qualityThreshold === null ? 'off' : String(state.qualityThreshold)}
              onValueChange={(value) =>
                change('qualityThreshold', value === 'off' ? null : Number(value))
              }
              options={[
                { value: 'off', label: s.off },
                ...[
                  ...new Set([
                    0,
                    1,
                    2,
                    3,
                    4,
                    ...(state.qualityThreshold === null ? [] : [state.qualityThreshold]),
                  ]),
                ]
                  .sort((a, b) => a - b)
                  .map((value) => ({ value: String(value), label: `≥ ${value} / 4` })),
              ]}
            />
          </>
        )}
      </ControlPanel>
    </div>
  );
}
