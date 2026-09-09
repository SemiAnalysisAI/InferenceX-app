'use client';

import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { useLocale } from '@/lib/use-locale';
import { at, entries, number, ROLES, rows, text, type Bundle } from './bundle';

const STRINGS = {
  en: {
    title: 'Benchmark result',
    baseline: 'Baseline',
    candidate: 'Candidate',
    change: 'Observed change',
    metric: 'Metric',
    latency: 'Latency',
    throughput: 'Valid clips',
    completion: 'Completed / scheduled',
    memory: 'Peak GPU memory',
    power: 'Mean GPU power',
    energy: 'Energy / valid clip',
    missing: 'Unavailable',
    lower: 'Lower is better',
    higher: 'Higher is better',
    noClaim:
      'Descriptive comparison. Calibration and release qualification are separate; small differences do not establish a performance improvement.',
    aa: 'Same-runtime A/A check',
    comparison: 'Comparison',
    execution: 'Execution',
    calibration: 'Calibration',
    qualified: 'Release qualified',
    yes: 'Yes',
    no: 'No',
    chips: 'participating GPUs',
    verified: 'CI checksums verified',
    stored: 'Media stored for direct playback',
    memoryNote:
      'Maximum sampled memory across participating GPUs, including warmup. Power is the participating-GPU average during generation; energy excludes CPU and facility power.',
    counts: 'Counts are for the measured block; warmup is excluded.',
  },
  zh: {
    title: '基准测试结果',
    baseline: '基线',
    candidate: '候选',
    change: '观测变化',
    metric: '指标',
    latency: '延迟',
    throughput: '有效视频数',
    completion: '已完成 / 计划',
    memory: 'GPU 显存峰值',
    power: 'GPU 平均功率',
    energy: '每有效视频能耗',
    missing: '无数据',
    lower: '越低越好',
    higher: '越高越好',
    noClaim: '此处仅描述观测差异。校准与发布资格单独判定，微小差异不能证明性能提升。',
    aa: '同运行时 A/A 检查',
    comparison: '对比状态',
    execution: '执行状态',
    calibration: '校准状态',
    qualified: '具备发布资格',
    yes: '是',
    no: '否',
    chips: '个 GPU 参与计算',
    verified: 'CI 校验和已验证',
    stored: '媒体已存储，可直接播放',
    memoryNote:
      '显存为参与计算的 GPU 中最高的采样值，包含 warmup。功率取生成阶段各参与计算 GPU 的平均值；能耗不含 CPU 与设施用电。',
    counts: '计数仅涵盖正式测量时段，不含 warmup。',
  },
};
const fmt = (v: number | null, digits = 2) =>
  v === null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: digits });

export default function ResultSummary({ bundle: b, stored }: { bundle: Bundle; stored: boolean }) {
  const s = STRINGS[useLocale()];
  const roleMetric = (role: string, metric: string): number | null => {
    const summary = at(b.report, 'roles', role, 'summary');
    const phase = at(b.result, 'roles', role, 'power', 'phases', 'measurement');
    if (metric === 'latency') return number(at(summary, 'latency_median_seconds'));
    if (metric === 'throughput') {
      const rate = number(at(summary, 'valid_clips_per_second'));
      return rate === null ? null : rate * 3600;
    }
    if (metric === 'memory') {
      const values = entries(
        at(
          b.result,
          'roles',
          role,
          'metrics',
          'gpu_memory',
          'client_including_warmup_observed_peak_mib_by_gpu',
        ),
      )
        .map(([, v]) => number(v))
        .filter((v): v is number => v !== null);
      return values.length > 0 ? Math.max(...values) / 1024 : null;
    }
    if (at(phase, 'valid') !== true) return null;
    if (metric === 'energy') {
      const joules = number(at(phase, 'aggregate', 'joules_per_valid_clip'));
      return joules === null ? null : joules / 1000;
    }
    const values = entries(at(phase, 'per_gpu')).map(([, gpu]) => number(at(gpu, 'avg_power_w')));
    return values.length > 0 && values.every((v): v is number => v !== null)
      ? values.reduce((sum, v) => sum + v, 0) / values.length
      : null;
  };
  const runtime = ROLES.map((r) => at(b.report, 'roles', r, 'source_identity', 'source_sha256'));
  const configs = ROLES.map((r) =>
    at(b.documents.get(`gpu/${r}/run.json`), 'configuration', 'configuration_sha256'),
  );
  const sameRuntime =
    configs[0] !== null &&
    configs[0] === configs[1] &&
    runtime[0] !== null &&
    runtime[0] === runtime[1] &&
    at(b.report, 'same_workload') === true &&
    at(b.report, 'same_gpu_uuid_set') === true;
  const gpus = rows(at(b.job, 'roles', 'baseline', 'telemetry_summary', 'gpu_identity'));
  const gpuNames = [...new Set(gpus.map((gpu) => text(at(gpu, 'name'))).filter(Boolean))].join(
    ', ',
  );
  const runId = text(at(b.manifest, 'run_id'));
  const completion = (role: string) => {
    const summary = at(b.documents.get(`gpu/${role}/run.json`), 'summary');
    const scheduled = number(at(b.report, 'roles', role, 'summary', 'scheduled'));
    return `${fmt(number(at(summary, 'completed')), 0)} / ${fmt(scheduled, 0)}`;
  };
  return (
    <Card className="min-w-0 gap-4" data-testid="result-summary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="section">{s.title}</Heading>
          <p className="mt-1 text-xs text-muted-foreground">
            <a
              className="text-primary underline"
              href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${runId}`}
              target="_blank"
              rel="noreferrer"
            >
              CI #{runId}
            </a>
            {' · '}
            {gpus.length > 0 ? gpus.length : '—'} {s.chips}
            {gpuNames ? ` (${gpuNames})` : ''}
            {sameRuntime ? ` · ${s.aa}` : ''}
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs">
          {stored ? s.stored : s.verified}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <p>
          {s.execution}: <strong>{text(at(b.ci, 'phase')) || s.missing}</strong>
        </p>
        <p>
          {s.comparison}: <strong>{text(at(b.ci, 'regression_status')) || s.missing}</strong>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {s.calibration}: {text(at(b.report, 'policy', 'calibration_status')) || s.missing}
        {' · '}
        {s.qualified}:{' '}
        {at(b.ci, 'release_qualified') === true
          ? s.yes
          : at(b.ci, 'release_qualified') === false
            ? s.no
            : s.missing}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="pb-2 font-normal">{s.metric}</th>
              <th className="pb-2 pl-3 text-right font-normal">{s.baseline}</th>
              <th className="pb-2 pl-3 text-right font-normal">{s.candidate}</th>
              <th className="pb-2 pl-3 text-right font-normal">{s.change}</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['latency', s.latency, 's', s.lower],
                ['throughput', s.throughput, 'clips/h', s.higher],
                ['memory', s.memory, 'GiB/GPU', s.lower],
                ['power', s.power, 'W/GPU', ''],
                ['energy', s.energy, 'kJ/clip', s.lower],
              ] as const
            ).map(([metric, label, unit, hint]) => {
              const baseline = roleMetric('baseline', metric),
                candidate = roleMetric('candidate', metric);
              const change =
                baseline !== null && baseline > 0 && candidate !== null
                  ? (candidate / baseline - 1) * 100
                  : null;
              return (
                <tr key={metric} className="border-b last:border-0">
                  <th className="py-2 pr-3 font-normal" title={hint || undefined}>
                    <span className="font-medium">{label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{unit}</span>
                  </th>
                  <td
                    className="whitespace-nowrap px-2 py-2 text-right"
                    aria-label={baseline === null ? s.missing : undefined}
                  >
                    {baseline === null ? '—' : fmt(baseline)}
                  </td>
                  <td
                    className="whitespace-nowrap px-2 py-2 text-right font-semibold"
                    aria-label={candidate === null ? s.missing : undefined}
                  >
                    {candidate === null ? '—' : fmt(candidate)}
                  </td>
                  <td className="whitespace-nowrap pl-2 py-2 text-right text-muted-foreground">
                    {change === null ? '—' : `${change > 0 ? '+' : ''}${fmt(change)}%`}
                  </td>
                </tr>
              );
            })}
            <tr>
              <th className="pt-3 font-normal">{s.completion}</th>
              <td className="pt-3 text-right">{completion('baseline')}</td>
              <td className="pt-3 text-right font-semibold">{completion('candidate')}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        — = {s.missing}
        <br />
        {s.counts}
        <br />
        {s.noClaim}
      </p>
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {s.memory} / {s.power}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">{s.memoryNote}</p>
      </details>
    </Card>
  );
}
