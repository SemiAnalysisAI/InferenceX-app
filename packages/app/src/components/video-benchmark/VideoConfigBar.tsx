'use client';

import { ControlPanel } from '@/components/ui/control-panel';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import type { CostTier } from './hardware';
import {
  COST_TIERS,
  metricLabel,
  TIER_LABELS,
  X_METRICS,
  Y_METRICS,
  type GpuBasis,
  type XMetricId,
  type YMetricId,
} from './metrics';
import VideoSelect from './VideoSelect';
import type { VideoDashboardState } from './video-url-state';

const STRINGS = {
  en: {
    benchmark: 'Benchmark config',
    chart: 'Chart config',
    model: 'Model',
    workload: 'Workload',
    deployment: 'Deployment',
    x: 'X-axis metric',
    y: 'Y-axis metric',
    tier: 'Cost tier',
    basis: 'GPU basis',
    participating: 'Participating GPUs (boards generating the clip)',
    allocated: 'Allocated GPUs (boards the job reserved)',
  },
  zh: {
    benchmark: '基准测试配置',
    chart: '图表配置',
    model: '模型',
    workload: '工作负载',
    deployment: '部署',
    x: 'X 轴指标',
    y: 'Y 轴指标',
    tier: '成本档位',
    basis: 'GPU 口径',
    participating: '参与计算的 GPU（实际生成视频的板卡）',
    allocated: '已分配的 GPU（作业预留的板卡）',
  },
};

/**
 * Two control panels mirroring the inference tab: what is being compared
 * (frozen for this campaign, so model, workload and the measured deployments
 * are single-option selects that state the comparison rather than change it)
 * and how it is plotted. Queued cells, optimal-only and the cross-hardware
 * frontier are legend switches, as on the inference chart.
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
  /** Measured server layouts (GPUs per video and model split), stated rather than selectable. */
  deploymentLabel: string;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const options = { tier: state.tier, basis: state.basis };
  const change = <K extends keyof VideoDashboardState>(key: K, value: VideoDashboardState[K]) => {
    onChange({ [key]: value } as Partial<VideoDashboardState>);
    track(`video_${key}_changed`, { value: String(value) });
  };
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="video-config-bar">
      <ControlPanel legend={s.benchmark} className="sm:grid-cols-3">
        <VideoSelect
          label={s.model}
          value="model"
          onValueChange={() => {}}
          options={[{ value: 'model', label: modelLabel }]}
        />
        <VideoSelect
          label={s.workload}
          value="workload"
          onValueChange={() => {}}
          options={[{ value: 'workload', label: workloadLabel }]}
        />
        <VideoSelect
          label={s.deployment}
          value="deployment"
          onValueChange={() => {}}
          options={[{ value: 'deployment', label: deploymentLabel }]}
        />
      </ControlPanel>
      <ControlPanel legend={s.chart} className="sm:grid-cols-2 xl:grid-cols-4">
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
        <VideoSelect
          label={s.tier}
          value={state.tier}
          onValueChange={(value) => change('tier', value as CostTier)}
          options={COST_TIERS.map((tier) => ({ value: tier, label: TIER_LABELS[tier][locale] }))}
        />
        <VideoSelect
          label={s.basis}
          value={state.basis}
          onValueChange={(value) => change('basis', value as GpuBasis)}
          options={[
            { value: 'participating', label: s.participating },
            { value: 'allocated', label: s.allocated },
          ]}
        />
      </ControlPanel>
    </div>
  );
}
