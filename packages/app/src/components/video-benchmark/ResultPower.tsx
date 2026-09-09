'use client';

import { useState } from 'react';
import VideoSelect from './VideoSelect';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { useLocale } from '@/lib/use-locale';
import { at, entries, number, ROLES, rows, text, type Json } from './bundle';

const STRINGS = {
  en: {
    title: 'Measured GPU power & energy',
    phase: 'Power window',
    startup: 'Startup',
    warmup: 'Warmup',
    measurement: 'Generation',
    baseline: 'Baseline',
    candidate: 'Candidate',
    unavailable: 'Unavailable',
    note: 'Generation power covers submission → observed provider completion, excluding download and local decoding. Startup and warmup are separate. Averages and energy are backend-validated, time-weighted board measurements; sampled peaks are not instantaneous peaks or whole-node power.',
    mean: 'Mean aggregate power (W)',
    peak: 'Observed aggregate peak (W)',
    energy: 'Integrated energy (kJ)',
    perClip: 'Energy / valid clip (kJ/clip)',
    duration: 'Window duration (s)',
    gpu: 'GPU UUID',
    memory: 'Client memory peak, including warmup (MiB)',
    meanGpu: 'Mean (W)',
    peakGpu: 'Observed peak (W)',
    ratio: 'Mean / specification TDP (%)',
    windows: 'Window coverage and validity',
    full: 'Full recorded result',
    fullNote:
      'Original contract fields, including configurations, timing sources, power limits, metric definitions and validity reasons. Missing values remain null. Reprocessing does not create a new GPU measurement.',
    producer: 'Export CI run',
    execution: 'Original execution CI run',
    limits:
      'Board power excludes CPU and facility energy. Specification TDP is separate from configured limits; later inventory does not establish historical settings.',
  },
  zh: {
    title: '实测 GPU 功率与能耗',
    phase: '功率统计时段',
    startup: '启动',
    warmup: 'Warmup',
    measurement: '生成',
    baseline: '基线',
    candidate: '候选',
    unavailable: '无数据',
    note: '生成阶段功率覆盖从请求提交到观测到服务端完成为止，不含下载和本地解码。启动与 warmup 单独统计。平均功率与能耗由后端校验，基于板卡功率按时间加权计算；观测峰值取自离散采样，不是瞬时峰值，也不代表整机功率。',
    mean: '合计平均功率（W）',
    peak: '合计观测峰值（W）',
    energy: '积分能耗（kJ）',
    perClip: '每有效视频能耗（kJ/clip）',
    duration: '时段时长（s）',
    gpu: 'GPU UUID',
    memory: '客户端显存采样峰值（含 warmup，MiB）',
    meanGpu: '平均功率（W）',
    peakGpu: '观测峰值（W）',
    ratio: '平均功率 / 规格 TDP（%）',
    windows: '时段覆盖与有效性',
    full: '完整结果记录',
    fullNote:
      '原始契约字段全文，包括配置、计时来源、功率上限、指标定义和有效性判定原因。缺失值保持 null。重新处理不会产生新的 GPU 测量数据。',
    producer: '导出产物的 CI 运行',
    execution: '原始执行的 CI 运行',
    limits:
      '板卡功率不含 CPU 与设施能耗。规格 TDP 不等于运行时配置的功率上限；事后采集的硬件信息不能证明当时的实际设置。',
  },
};
const kilo = (value: Json) => {
  const n = number(value);
  return n === null ? null : n / 1000;
};

export default function ResultPower({ result }: { result: Json }) {
  const s = STRINGS[useLocale()];
  const [phase, setPhase] = useState<'startup' | 'warmup' | 'measurement'>('measurement');
  const fmt = (value: Json) => {
    const n = number(value);
    return n === null ? s.unavailable : n.toLocaleString('en-US', { maximumFractionDigits: 3 });
  };
  return (
    <>
      <Card className="gap-4" data-testid="result-power">
        <Heading>{s.title}</Heading>
        <p className="text-sm text-muted-foreground">{s.note}</p>
        <div className="w-full max-w-xs">
          <VideoSelect
            label={s.phase}
            value={phase}
            onValueChange={(value) => setPhase(value as typeof phase)}
            options={(['startup', 'warmup', 'measurement'] as const).map((value) => ({
              value,
              label: s[value],
            }))}
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {ROLES.map((role) => {
            const power = at(result, 'roles', role, 'power');
            const data = at(power, 'phases', phase);
            const valid = at(data, 'valid') === true;
            const value = (...keys: string[]) => (valid ? at(data, ...keys) : null);
            const fraction = number(value('tdp_comparison', 'aggregate_average_fraction_of_tdp'));
            return (
              <div key={role} className="min-w-0 space-y-3">
                <Heading level="card">
                  {s[role]} · {text(at(data, 'status')) || s.unavailable}
                </Heading>
                <dl className="space-y-2 text-sm">
                  {[
                    [s.mean, value('aggregate', 'avg_power_w')],
                    [s.peak, value('aggregate', 'observed_peak_power_w')],
                    [s.energy, kilo(value('aggregate', 'energy_j'))],
                    [s.perClip, kilo(value('aggregate', 'joules_per_valid_clip'))],
                    [s.duration, value('duration_seconds')],
                    [s.ratio, fraction === null ? null : fraction * 100],
                  ].map(([label, n]) => (
                    <div key={String(label)} className="flex justify-between gap-4">
                      <dt>{String(label)}</dt>
                      <dd>{fmt(n as Json)}</dd>
                    </div>
                  ))}
                </dl>
                {!valid && (
                  <p className="break-words text-sm">
                    {rows(at(data, 'invalid_reasons')).map(text).join(', ') || s.unavailable}
                  </p>
                )}
                {valid && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>
                          <th>{s.gpu}</th>
                          <th>{s.meanGpu}</th>
                          <th>{s.peakGpu}</th>
                          <th>{s.memory}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries(at(data, 'per_gpu')).map(([uuid, gpu]) => (
                          <tr key={uuid}>
                            <td className="max-w-48 break-all py-2 pr-3">{uuid}</td>
                            <td>{fmt(at(gpu, 'avg_power_w'))}</td>
                            <td>{fmt(at(gpu, 'observed_peak_power_w'))}</td>
                            <td>
                              {fmt(
                                at(
                                  result,
                                  'roles',
                                  role,
                                  'metrics',
                                  'gpu_memory',
                                  'client_including_warmup_observed_peak_mib_by_gpu',
                                  uuid,
                                ),
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-sm">{s.memory}</summary>
                  <dl className="mt-2 space-y-2 text-xs">
                    {entries(
                      at(
                        result,
                        'roles',
                        role,
                        'metrics',
                        'gpu_memory',
                        'client_including_warmup_observed_peak_mib_by_gpu',
                      ),
                    ).map(([uuid, mib]) => (
                      <div key={uuid} className="flex justify-between gap-3">
                        <dt className="break-all">{uuid}</dt>
                        <dd>{fmt(mib)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
                <details>
                  <summary className="cursor-pointer text-sm">{s.windows}</summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs">
                    {JSON.stringify(
                      rows(at(power, 'windows')).filter((w) => at(w, 'phase') === phase),
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">{s.limits}</p>
      </Card>
      <Card className="gap-3">
        <Heading>{s.full}</Heading>
        <p className="text-sm text-muted-foreground">{s.fullNote}</p>
        {[
          [s.execution, at(result, 'execution', 'ci', 'run_id')],
          [s.producer, at(result, 'producer', 'ci', 'run_id')],
        ].map(([label, id]) =>
          /^[1-9]\d*$/u.test(text(id)) ? (
            <a
              key={String(label)}
              className="text-sm text-primary underline"
              href={`https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${encodeURIComponent(text(id))}`}
              target="_blank"
              rel="noreferrer"
            >
              {String(label)} · #{text(id)}
            </a>
          ) : (
            <p key={String(label)} className="text-sm">
              {String(label)} · {s.unavailable}
            </p>
          ),
        )}
        {entries(result).map(([key, value]) => (
          <details key={key}>
            <summary className="cursor-pointer font-mono text-sm">{key}</summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(value, null, 2)}
            </pre>
          </details>
        ))}
      </Card>
    </>
  );
}
