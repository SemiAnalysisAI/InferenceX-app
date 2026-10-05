'use client';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/use-locale';
import { layoutLabel } from './deployment';
import type { VideoPoint } from './metrics';
import { QUALITY_METRICS, qualityMeasurement } from './quality';
import type { VideoDashboardState } from './video-url-state';

const STRINGS = {
  en: {
    title: 'Selected measurement',
    close: 'Close details',
    configuration: 'Configuration',
    capacity: 'GPUs per replica / replicas / observed batch / configured maximum batch',
    counts: 'Valid / completed / scheduled / failed',
    samples: 'Latency samples',
    runtime: 'Engine / runtime / precision / attention',
    settings: 'Generation settings',
    workload: 'Canonical workload identity',
    scheduling: 'Scheduling / acceleration / configuration evidence',
    health: 'Hardware health',
    unknown: 'unknown',
    provenance: 'Run / artifact / source',
    calibration: 'Quality calibration',
    unjudged: 'unjudged',
    quality: 'Quality dimension / assessed coverage',
    score: 'recorded rating',
    fidelity: 'Numerical fidelity',
    evidence: 'Original run and artifacts',
    noHealth:
      'No complete health attestation. Absence of a recorded failure does not prove healthy hardware.',
    cost: 'TCO is modelled from participating GPU-hours; energy is measured GPU-board energy over the recorded generation window.',
  },
  zh: {
    title: '所选测量',
    close: '关闭详情',
    configuration: '配置',
    capacity: '每副本 GPU 数 / 副本数 / 实际 batch / 配置的最大 batch',
    counts: '有效 / 完成 / 计划 / 失败',
    samples: '延迟样本数',
    runtime: '引擎 / runtime / precision / attention',
    settings: '生成参数',
    workload: '完整工作负载身份',
    scheduling: '调度方式 / 加速方法 / 配置证据',
    health: '硬件健康状态',
    unknown: '未知',
    provenance: '运行 / 产物 / 来源',
    calibration: '质量校准',
    unjudged: '尚未评判',
    quality: '质量维度 / 已评覆盖',
    score: '记录的评分',
    fidelity: '数值保真度',
    evidence: '原始运行与产物',
    noHealth: '缺少完整健康证明。未记录到故障不等于已验证硬件健康。',
    cost: 'TCO 按参与计算的 GPU 小时建模；能耗为记录的生成窗口内实测 GPU 板卡能耗。',
  },
};

export default function VideoPointDetails({
  point: p,
  state,
  onClose,
}: {
  point: VideoPoint;
  state: VideoDashboardState;
  onClose: () => void;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const d = p.deployment;
  const quality = qualityMeasurement(p, state.qualityMetric);
  const metric = QUALITY_METRICS[state.qualityMetric];
  const fields: [string, string | number][] = [
    [
      s.configuration,
      `${layoutLabel(p, locale)} · Ring ${d?.ring ?? '—'} · CFG ${d?.cfg ?? '—'} · offload ${d?.offload ? JSON.stringify(d.offload) : '—'}`,
    ],
    [
      s.capacity,
      [d?.gpusPerReplica, p.replicas, d?.batchSize, d?.maxBatchSize]
        .map((v) => v ?? '—')
        .join(' / '),
    ],
    [s.counts, [p.valid, p.completed, p.scheduled, p.failed].map((v) => v ?? '—').join(' / ')],
    [s.samples, p.samples],
    [
      s.runtime,
      [d?.engine, p.runtime, d?.precision, p.server?.attention].map((v) => v ?? '—').join(' / '),
    ],
    [s.settings, d?.generationKey ?? p.workload],
    [
      s.scheduling,
      [
        d?.scheduling,
        `batch delay ${d?.batchDelayMs ?? '—'} ms`,
        d?.acceleration,
        d?.configEvidence,
      ]
        .map((v) => v ?? '—')
        .join(' / '),
    ],
    [
      s.health,
      `${p.hardwareHealth?.status ?? s.unknown}: ${p.hardwareHealth?.reason ?? s.noHealth}`,
    ],
    [
      s.quality,
      `${locale === 'zh' ? metric.labelZh : metric.label} · ${quality?.status ?? s.unjudged} · ${s.score}: ${quality?.value ?? '—'} · ${quality?.samples ?? '—'}/${quality?.total ?? p.samples} · ${quality?.evaluatorId ?? '—'}@${quality?.evaluatorVersion ?? '—'}`,
    ],
    [s.calibration, quality?.calibration ? JSON.stringify(quality.calibration) : s.unjudged],
    [s.fidelity, `${p.provenance?.fidelity ?? '—'} · ${p.provenance?.calibration ?? '—'}`],
    [s.provenance, `${p.runId} / ${p.artifactId} / ${p.provenance?.sourceId ?? '—'}`],
    [
      'SHA256 / commit',
      `${p.provenance?.manifestSha256 ?? '—'} / ${p.provenance?.sourceSha ?? '—'}`,
    ],
  ];
  return (
    <section
      className="min-w-0 space-y-2 rounded-lg border p-3"
      data-testid="video-point-details"
      aria-label={s.title}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {s.title}: {p.hardwareName}
        </p>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {s.close}
        </Button>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
        {fields.map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{s.cost}</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{s.workload}</summary>
        <p className="pt-2 [overflow-wrap:anywhere]">{p.workloadKey ?? '—'}</p>
      </details>
      <a
        className="text-xs underline underline-offset-2"
        href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${p.runId}`}
        target="_blank"
        rel="noreferrer"
      >
        {s.evidence} #{p.runId} · artifact {p.artifactId}
      </a>
    </section>
  );
}
