'use client';

import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';
import {
  concurrencyPlateau,
  evidenceFacts,
  meterPercent,
  plateauSummary,
  powerRange,
  powerUtilization,
  readSpeedup,
  scalingVsSpec,
  type ConcurrencyPlateauRow,
  type ScalingVsSpecRow,
} from './evidence';
import { hardwareLabel } from './hardware';
import { formatMetric, type VideoPoint } from './metrics';

const STRINGS = {
  en: {
    title: 'Compute-bound evidence',
    subtitle:
      'Three readings from the measured cells on why this workload behaves like a compute-bound diffusion model on the pinned runtime. Every number is computed from the published runs; the wording follows the numbers.',
    power: 'Board power vs. enforced limit',
    powerHint:
      'Mean GPU-board power of the participating boards while generating, against the power limit recorded around the run, not marketing TDP.',
    powerOne: (hardware: string, share: string) =>
      `${hardware} ran at ${share} of its enforced power limit while generating: near the cap, as a compute-saturated workload would.`,
    powerAll: (n: number, share: string) =>
      `All ${n} measured GPU types ran at ${share} of their enforced power limit while generating: near the cap, as a compute-saturated workload would.`,
    notRecorded: 'power or limit not recorded',
    meter: 'share of enforced power limit',
    plateau: 'Client concurrency plateau',
    plateauHint:
      "Newest cell per hardware and client concurrency; ratios are against the same hardware's C1 cell.",
    plateauSentence: (queued: number, deviation: string, latency: string) =>
      `Across ${queued} queued cells, throughput per GPU-hour stays within ${deviation} of C1 while P50 time to video rises to ${latency}: on the batch-one server, extra client concurrency queues requests instead of batching them.`,
    at: (concurrency: number, range: string) => `${range} at C${concurrency}`,
    hardware: 'Hardware',
    c: 'C',
    rate: 'Videos / GPU-hr',
    p50: 'P50 (s)',
    throughput: '× C1 throughput',
    latency: '× C1 latency',
    scaling: 'Observed speedup vs. spec-sheet ratios',
    scalingHint:
      'Consecutive hardware from slowest to fastest C1 P50. Observed = P50 ratio; spec ratios use per-GPU HBM bandwidth and dense tensor-core TFLOPS from the GPU specs page.',
    pair: 'Pair',
    observed: 'Observed (P50 ratio)',
    bandwidth: 'Memory bandwidth',
    bf16: 'BF16 dense',
    fp8: 'FP8 dense',
    reading: 'Reading',
    readings: {
      missing: 'spec missing',
      compute: 'closer to the FLOPS ratio',
      bandwidth: 'closer to the bandwidth ratio',
      between: 'between the two, not clearly closer to either',
      above: 'above both spec ratios, not clearly closer to either',
      below: 'below both spec ratios, not clearly closer to either',
    },
    scalingStep: (
      from: string,
      to: string,
      observed: string,
      bandwidth: string,
      flops: string,
      reading: string,
    ) =>
      `${from} → ${to}: ${observed} observed vs. ${bandwidth} bandwidth and ${flops} FLOPS, ${reading}.`,
    scalingTail:
      'A bandwidth-bound workload would track the bandwidth ratio; a compute-bound one the FLOPS ratio.',
    caveats: 'Read with these caveats',
    caveatServer:
      'Batch-one, single-replica server: client concurrency queues requests rather than batching them.',
    caveatGpus: (n: number, recipe: string) =>
      `${n} participating GPUs per video${recipe}; allocated boards beyond those sit idle.`,
    caveatGpusUnknown: 'Participating GPUs per video differ between cells or were not recorded.',
    recipe: (tp: number, ulysses: number) => ` (TP${tp} × Ulysses ${ulysses})`,
    caveatPower:
      'GPU-board power against the recorded enforced limit; not node, rack or facility power.',
    caveatSamples: (n: string) =>
      `n = ${n} clips per cell, one cohort per hardware: no error bars, and P90 is a display floor rather than a tail SLO.`,
    caveatSamplesUnknown: 'Sample counts were not recorded.',
    caveatWorkload: (workload: string) =>
      `Frozen workload ${workload}; every ratio compares the same clip across hardware.`,
    caveatWorkloadUnknown:
      'Cells do not share one workload label; cross-hardware ratios only hold for the same clip.',
    caveatAttention: (backends: string) =>
      `Attention backend differs by hardware (${backends}); each point is hardware plus its measured recipe.`,
  },
  zh: {
    title: '算力受限（compute-bound）的证据',
    subtitle:
      '来自实测 cell 的三组读数，说明该工作负载在固定 runtime 上为何表现为算力受限的扩散模型。所有数字均由已发布运行计算得出，措辞以数字为准。',
    power: '板卡功率 vs. 生效功率上限',
    powerHint:
      '生成期间各参与计算 GPU 板卡的平均功率，对照运行前后记录到的功率上限，而非标称 TDP。',
    powerOne: (hardware: string, share: string) =>
      `${hardware} 生成期间运行在生效功率上限的 ${share}：接近上限，符合算力饱和型负载的表现。`,
    powerAll: (n: number, share: string) =>
      `全部 ${n} 种实测硬件生成期间均运行在生效功率上限的 ${share}：接近上限，符合算力饱和型负载的表现。`,
    notRecorded: '未记录功率或上限',
    meter: '占生效功率上限的比例',
    plateau: '客户端并发平台期',
    plateauHint: '每种硬件、每个客户端并发下最新的 cell；比值均相对同一硬件的 C1 cell。',
    plateauSentence: (queued: number, deviation: string, latency: string) =>
      `在 ${queued} 个排队 cell 中，每 GPU 小时吞吐量与 C1 的偏差不超过 ${deviation}，而 P50 出片时间升至 ${latency}：在 batch-one 服务器上，额外的客户端并发只是让请求排队，并没有形成 batching。`,
    at: (concurrency: number, range: string) => `C${concurrency} 时 ${range}`,
    hardware: '硬件',
    c: 'C',
    rate: '视频数 / GPU 小时',
    p50: 'P50（s）',
    throughput: '吞吐量（相对 C1）',
    latency: '延迟（相对 C1）',
    scaling: '实测加速比 vs. 规格表比值',
    scalingHint:
      '按 C1 P50 从慢到快排列的相邻硬件。实测值为 P50 比值；规格比值取自 GPU 规格页的单卡 HBM 带宽与 dense tensor-core TFLOPS。',
    pair: '硬件对',
    observed: '实测（P50 比值）',
    bandwidth: '显存带宽',
    bf16: 'BF16 dense',
    fp8: 'FP8 dense',
    reading: '判读',
    readings: {
      missing: '缺少规格',
      compute: '更接近 FLOPS 比值',
      bandwidth: '更接近带宽比值',
      between: '介于两者之间，不明显偏向任一方',
      above: '高于两个规格比值，不明显偏向任一方',
      below: '低于两个规格比值，不明显偏向任一方',
    },
    scalingStep: (
      from: string,
      to: string,
      observed: string,
      bandwidth: string,
      flops: string,
      reading: string,
    ) =>
      `${from} → ${to}：实测 ${observed}，对比带宽比值 ${bandwidth}、FLOPS 比值 ${flops}，${reading}。`,
    scalingTail: '带宽受限的负载会跟随带宽比值，算力受限的负载会跟随 FLOPS 比值。',
    caveats: '阅读时请注意',
    caveatServer: 'batch-one 单副本服务器：客户端并发只会让请求排队，不会形成 batching。',
    caveatGpus: (n: number, recipe: string) =>
      `每条视频由 ${n} 张 GPU 参与计算${recipe}；超出部分的已分配板卡处于空闲。`,
    caveatGpusUnknown: '各 cell 参与计算的 GPU 数不一致或未记录。',
    recipe: (tp: number, ulysses: number) => `（TP${tp} × Ulysses ${ulysses}）`,
    caveatPower: 'GPU 板卡级功率，对照记录到的生效上限；不是节点、机柜或设施功率。',
    caveatSamples: (n: string) =>
      `每个 cell n = ${n} 条视频、每种硬件一个批次：没有误差棒；P90 仅在样本数达到显示门槛时展示，不能当作尾延迟 SLO。`,
    caveatSamplesUnknown: '未记录样本数。',
    caveatWorkload: (workload: string) =>
      `冻结的工作负载 ${workload}；所有比值都是同一条视频在不同硬件上的对比。`,
    caveatWorkloadUnknown: '各 cell 的工作负载标签不一致；跨硬件比值只在同一条视频下成立。',
    caveatAttention: (backends: string) =>
      `各硬件的 attention 后端不同（${backends}）；每个数据点都是“硬件 + 实测配置”。`,
  },
};

const number = (value: number, digits: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const times = (value: number | null) => (value === null ? '—' : `${number(value, 2)}×`);
/** "92–97" or "97" when both ends print alike. */
function span(min: number, max: number, digits: number): string {
  const low = number(min, digits);
  const high = number(max, digits);
  return low === high ? low : `${low}–${high}`;
}
/** Percent range: "92–97%" in English, "92%–97%" in Chinese. */
function percentSpan(min: number, max: number, digits: number, locale: Locale): string {
  const low = number(min, digits);
  const high = number(max, digits);
  if (low === high) return `${low}%`;
  return locale === 'zh' ? `${low}%–${high}%` : `${low}–${high}%`;
}
function list(items: string[], locale: Locale): string {
  if (locale === 'zh') return items.join('、');
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function HardwareName({ hardwareKey, color }: { hardwareKey: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {hardwareLabel(hardwareKey)}
    </span>
  );
}

const HEAD = 'pb-2 pr-3 font-normal text-muted-foreground';
const CELL = 'border-t border-border/40 py-1.5 pr-3';

export interface VideoEvidenceProps {
  points: VideoPoint[];
  colorFor: (hardwareKey: string) => string;
}

/**
 * Compute-bound evidence panel: board power at the enforced limit, the
 * client-concurrency plateau and observed speedups against spec-sheet ratios.
 * Each exhibit renders only when the measured cells support it, and every
 * sentence is built from the computed numbers; the section disappears when
 * nothing is measured.
 */
export default function VideoEvidence({ points, colorFor }: VideoEvidenceProps) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const power = powerUtilization(points);
  const range = powerRange(power);
  const plateau = concurrencyPlateau(points);
  const summary = plateauSummary(plateau);
  const scaling = scalingVsSpec(points);
  if (range === null && summary === null && scaling.length === 0) return null;
  const facts = evidenceFacts(points);

  const powerSentence =
    range === null
      ? null
      : range.measured === 1
        ? s.powerOne(
            hardwareLabel(power.find((row) => row.percentOfCap !== null)?.hardwareKey ?? ''),
            percentSpan(range.min, range.max, 0, locale),
          )
        : s.powerAll(range.measured, percentSpan(range.min, range.max, 0, locale));

  const plateauSentence =
    summary === null
      ? null
      : s.plateauSentence(
          summary.queued,
          `${number(summary.throughputDeviationPct, 1)}%`,
          list(
            summary.latency.map((entry) =>
              s.at(entry.concurrency, `${span(entry.min, entry.max, 2)}×`),
            ),
            locale,
          ),
        );
  const plateauGroups = new Map<string, ConcurrencyPlateauRow[]>();
  for (const row of plateau) {
    const group = plateauGroups.get(row.hardwareKey) ?? [];
    group.push(row);
    plateauGroups.set(row.hardwareKey, group);
  }

  const flops = (row: ScalingVsSpecRow) => {
    const bf16 = times(row.bf16Ratio);
    const fp8 = times(row.fp8Ratio);
    return bf16 === fp8 ? bf16 : `${bf16} (BF16) / ${fp8} (FP8)`;
  };
  const readingText = (row: ScalingVsSpecRow) => {
    const reading = readSpeedup(row);
    if (reading === null) return s.readings.missing;
    return reading.decisive ? s.readings[reading.closest] : s.readings[reading.position];
  };
  const scalingSentence =
    scaling.length === 0
      ? null
      : `${scaling
          .map((row) =>
            s.scalingStep(
              hardwareLabel(row.fromKey),
              hardwareLabel(row.toKey),
              times(row.observedSpeedup),
              times(row.memoryBandwidthRatio),
              flops(row),
              readingText(row),
            ),
          )
          .join(' ')} ${s.scalingTail}`;

  const caveats = [
    s.caveatServer,
    facts.participating === null
      ? s.caveatGpusUnknown
      : s.caveatGpus(
          facts.participating,
          facts.tp !== null && facts.ulysses !== null ? s.recipe(facts.tp, facts.ulysses) : '',
        ),
    s.caveatPower,
    facts.samples === null
      ? s.caveatSamplesUnknown
      : s.caveatSamples(span(facts.samples.min, facts.samples.max, 0)),
    facts.workload === null ? s.caveatWorkloadUnknown : s.caveatWorkload(facts.workload),
    ...(facts.attention.length > 0
      ? [
          s.caveatAttention(
            facts.attention
              .map((entry) => `${hardwareLabel(entry.hardwareKey)} ${entry.attention}`)
              .join(' · '),
          ),
        ]
      : []),
  ];

  return (
    <section
      className="space-y-3"
      data-testid="video-evidence"
      aria-labelledby="video-evidence-title"
    >
      <div>
        <Heading as="h2" level="section" id="video-evidence-title">
          {s.title}
        </Heading>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground">{s.subtitle}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {range !== null && (
          <Card className="gap-3 p-4" data-testid="video-evidence-power">
            <div>
              <Heading as="h3" level="card">
                {s.power}
              </Heading>
              <p className="mt-1 text-xs text-muted-foreground">{s.powerHint}</p>
            </div>
            <ul className="space-y-2.5">
              {power.map((row) => (
                <li
                  key={row.hardwareKey}
                  className="space-y-1 text-xs"
                  data-testid="video-evidence-power-row"
                  data-hardware={row.hardwareKey}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                    <HardwareName hardwareKey={row.hardwareKey} color={colorFor(row.hardwareKey)} />
                    <span className="tabular-nums text-muted-foreground">
                      {row.avgPowerW !== null && row.enforcedLimitW !== null
                        ? `${number(row.avgPowerW, 0)} W / ${number(row.enforcedLimitW, 0)} W`
                        : s.notRecorded}
                      {row.percentOfCap !== null && (
                        <span className="ml-2 font-medium text-foreground">
                          {number(row.percentOfCap, 1)}%
                        </span>
                      )}
                    </span>
                  </div>
                  {row.percentOfCap !== null && (
                    <div
                      role="meter"
                      aria-label={`${hardwareLabel(row.hardwareKey)} ${s.meter}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={meterPercent(row.percentOfCap)}
                      className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${meterPercent(row.percentOfCap)}%`,
                          backgroundColor: colorFor(row.hardwareKey),
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-sm" data-testid="video-evidence-power-reading">
              {powerSentence}
            </p>
          </Card>
        )}
        {summary !== null && (
          <Card
            className={`gap-3 p-4 ${range === null ? 'lg:col-span-3' : 'lg:col-span-2'}`}
            data-testid="video-evidence-plateau"
          >
            <div>
              <Heading as="h3" level="card">
                {s.plateau}
              </Heading>
              <p className="mt-1 text-xs text-muted-foreground">{s.plateauHint}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead>
                  <tr>
                    <th className={HEAD}>{s.hardware}</th>
                    <th className={`${HEAD} text-right`}>{s.c}</th>
                    <th className={`${HEAD} text-right`}>{s.rate}</th>
                    <th className={`${HEAD} text-right`}>{s.p50}</th>
                    <th className={`${HEAD} text-right`}>{s.throughput}</th>
                    <th className={`${HEAD} text-right`}>{s.latency}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...plateauGroups].map(([hardwareKey, rows]) =>
                    rows.map((row, index) => (
                      <tr
                        key={`${hardwareKey}:${row.concurrency}`}
                        data-hardware={hardwareKey}
                        data-concurrency={row.concurrency}
                      >
                        {index === 0 && (
                          <th
                            scope="rowgroup"
                            rowSpan={rows.length}
                            className={`${CELL} align-top font-medium`}
                          >
                            <HardwareName hardwareKey={hardwareKey} color={colorFor(hardwareKey)} />
                          </th>
                        )}
                        <td className={`${CELL} text-right`}>C{row.concurrency}</td>
                        <td className={`${CELL} text-right`}>
                          {formatMetric(row.videosPerGpuHour, 'videosPerGpuHour')}
                        </td>
                        <td className={`${CELL} text-right`}>
                          {formatMetric(row.p50, 'p50Latency')}
                        </td>
                        <td className={`${CELL} text-right`}>{times(row.throughputRatioVsC1)}</td>
                        <td className={`${CELL} text-right`}>{times(row.latencyRatioVsC1)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-sm" data-testid="video-evidence-plateau-reading">
              {plateauSentence}
            </p>
          </Card>
        )}
        {scaling.length > 0 && (
          <Card className="gap-3 p-4 lg:col-span-3" data-testid="video-evidence-scaling">
            <div>
              <Heading as="h3" level="card">
                {s.scaling}
              </Heading>
              <p className="mt-1 text-xs text-muted-foreground">{s.scalingHint}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead>
                  <tr>
                    <th className={HEAD}>{s.pair}</th>
                    <th className={`${HEAD} text-right`}>{s.observed}</th>
                    <th className={`${HEAD} text-right`}>{s.bandwidth}</th>
                    <th className={`${HEAD} text-right`}>{s.bf16}</th>
                    <th className={`${HEAD} text-right`}>{s.fp8}</th>
                    <th className={HEAD}>{s.reading}</th>
                  </tr>
                </thead>
                <tbody>
                  {scaling.map((row) => (
                    <tr
                      key={`${row.fromKey}-${row.toKey}`}
                      data-testid="video-evidence-scaling-row"
                      data-pair={`${row.fromKey}-${row.toKey}`}
                    >
                      <th scope="row" className={`${CELL} font-medium`}>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <HardwareName hardwareKey={row.fromKey} color={colorFor(row.fromKey)} />
                          <span aria-hidden="true">→</span>
                          <HardwareName hardwareKey={row.toKey} color={colorFor(row.toKey)} />
                        </span>
                      </th>
                      <td className={`${CELL} text-right font-medium`}>
                        {times(row.observedSpeedup)}
                      </td>
                      <td className={`${CELL} text-right`}>{times(row.memoryBandwidthRatio)}</td>
                      <td className={`${CELL} text-right`}>{times(row.bf16Ratio)}</td>
                      <td className={`${CELL} text-right`}>{times(row.fp8Ratio)}</td>
                      <td className={CELL}>{readingText(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm" data-testid="video-evidence-scaling-reading">
              {scalingSentence}
            </p>
          </Card>
        )}
      </div>
      <div data-testid="video-evidence-caveats">
        <Heading as="h3" level="label">
          {s.caveats}
        </Heading>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
