'use client';

import { InfoHelp } from '@/components/ui/option-info';
import { useIsCoarsePointer } from '@/hooks/useMediaQuery';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import { speedVs, type StageOption } from './clip-stage';
import { layoutLabel } from './deployment';
import { compareLower, cost as dollars, reading, type Comparison } from './format';
import type { VideoPoint } from './metrics';
import { lossyLabel, optimizationsOf } from './optimizations';
import { precisionTag, type ResultCell } from './results';
import type { ResultsClip } from './results-clips';
import { SideDot, type StageClip } from './VideoClipStage';

/** Why reference PSNR alone cannot judge a clip; the quality explainer says it too. */
export const PIXELS_DIFFER = {
  en: 'Different engines and parallel layouts produce different pixels from the same prompt and seed',
  zh: '不同引擎或并行配置即使使用相同的 prompt 和 seed，生成的像素也会不同',
} as const;

/** "29% cheaper than H100", "2.09× the energy of H100": a cost or an energy against the pair's. */
const versusEn = (c: Comparison, name: string, noun: string, less: string, more: string) =>
  c.direction === 'same'
    ? `Same ${noun} as ${name}`
    : c.times
      ? c.direction === 'better'
        ? `${c.times}× ${less} than ${name}`
        : `${c.times}× the ${noun} of ${name}`
      : `${c.percent}% ${c.direction === 'better' ? less : more} than ${name}`;

/** "比 H100 低 29%": Chinese gives a saving as a percentage however large, a multiple only for an excess. */
const versusZh = (c: Comparison, name: string) =>
  c.direction === 'same'
    ? `与 ${name} 相同`
    : c.direction === 'better'
      ? `比 ${name} 低 ${c.percent}%`
      : c.times
        ? `为 ${name} 的 ${c.times} 倍`
        : `比 ${name} 高 ${c.percent}%`;

const STRINGS = {
  en: {
    pair: (a: string, b: string) => `${a} against ${b}`,
    against: 'against',
    unofficial: 'Unofficial run',
    official: (name: string) => `${name} official`,
    notMeasured: 'Not measured yet',
    diagnosticMetric: 'Not provided for this diagnostic.',
    speed: (name: string) => `Speed vs ${name}`,
    speedLossless: 'Speed vs lossless',
    speedRatio: {
      faster: (x: string) => `${x}× faster`,
      slower: (x: string) => `${x}× slower`,
      same: () => 'Same speed',
    },
    p50Pair: (a: string, b: string) => `p50 ${a} s vs ${b} s`,
    speedHelp: 'Ratio of the two cells’ median latency per clip.',
    wall: 'Wall time (this prompt)',
    psnr: 'PSNR vs reference',
    paired: 'Paired scores',
    planned: 'Planned',
    pairedScores: 'PSNR · SSIM · LPIPS vs lossless',
    pairedPending:
      'Scoring against the same engine’s lossless output is planned; no scorer computes it yet.',
    energy: 'Mean energy per clip',
    cost: '$ per clip',
    costHelp: (
      perSecond: string | null,
      allocated: string | null,
      allocatedPerSecond: string | null,
    ) =>
      `Modelled TCO per valid clip on the participating GPUs, from the selected tier and the recorded GPU count${perSecond === null ? '' : `: ${perSecond} per video-second`}. On the allocated GPUs: ${allocated === null ? 'not measured yet' : `${allocated} per clip${allocatedPerSecond === null ? '' : `, ${allocatedPerSecond} per video-second`}`}.`,
    versus: {
      cost: (c: Comparison, name: string) => versusEn(c, name, 'cost', 'cheaper', 'pricier'),
      energy: (c: Comparison, name: string) =>
        versusEn(c, name, 'energy', 'less energy', 'more energy'),
    },
    exactMatch: 'Exact match',
    incompatibleShort: 'Incompatible pair',
    incompatible: 'Paired media are incompatible; PSNR is unavailable.',
    psnrMeasured: (frames: number) =>
      `Higher is closer to the reference. Decoded RGB24 · all ${frames} frames · full-stream MSE. Descriptive cross-engine comparison; no quality pass/fail threshold. ${PIXELS_DIFFER.en}, so a low value alone does not indicate a defect.`,
    energyNote:
      'Mean GPU-board energy per valid clip in the selected measurement cell; not a per-clip energy trace.',
    psnrNote: 'No sealed paired PSNR result is available for this clip.',
    unscored: {
      invalid_candidate: 'Invalid clip',
      checksum_mismatch: 'Checksum mismatch',
      no_reference: 'No reference',
      settings_mismatch: 'Settings differ',
      unreadable: 'Unreadable artifact',
    },
    unscoredNote: {
      invalid_candidate: () =>
        'The quality scorer did not compare this clip because it is not a valid measured output.',
      checksum_mismatch: () =>
        'The quality scorer did not compare this clip because its bytes do not match the recorded SHA256.',
      no_reference: () =>
        'The quality scorer did not compare this clip because the reference set has no clip for this case.',
      settings_mismatch: (fields: string[]) =>
        `The quality scorer did not compare this clip because its settings differ from the reference${fields.length > 0 ? `: ${fields.join(', ')}` : ''}.`,
      unreadable: () =>
        'The quality scorer could not read this artifact, so none of its clips were compared.',
    },
  },
  zh: {
    pair: (a: string, b: string) => `${a} 对比 ${b}`,
    against: '对比',
    unofficial: '非官方运行',
    official: (name: string) => `${name} 官方运行`,
    notMeasured: '尚未测量',
    diagnosticMetric: '此次重跑未提供该指标。',
    speed: (name: string) => `速度（相对 ${name}）`,
    speedLossless: '速度（相对无损对照）',
    speedRatio: {
      faster: (x: string) => `加速 ${x}×`,
      slower: (x: string) => `耗时为其 ${x} 倍`,
      same: () => '速度相同',
    },
    p50Pair: (a: string, b: string) => `p50 ${a} s 对比 ${b} s`,
    speedHelp: '两个测量单元单条视频中位延迟之比。',
    wall: '出片时间（当前 prompt）',
    psnr: '相对参考的 PSNR',
    paired: '配对评分',
    planned: '计划中',
    pairedScores: '相对无损对照的 PSNR · SSIM · LPIPS',
    pairedPending: '以同一引擎无损输出为基准的质量评分仍在计划中，目前还没有评分器计算。',
    energy: '每条视频平均能耗',
    cost: '每条视频成本',
    costHelp: (
      perSecond: string | null,
      allocated: string | null,
      allocatedPerSecond: string | null,
    ) =>
      `按所选成本档位和记录的 GPU 数量估算的参与 GPU 每条有效视频 TCO${perSecond === null ? '' : `，折合每视频秒 ${perSecond}`}。按分配 GPU 估算：${allocated === null ? '尚未测量' : `每条视频 ${allocated}${allocatedPerSecond === null ? '' : `，每视频秒 ${allocatedPerSecond}`}`}。`,
    // The cell's label names the quantity, so both metrics share one wording.
    versus: { cost: versusZh, energy: versusZh },
    exactMatch: '完全一致',
    incompatibleShort: '配对不兼容',
    incompatible: '配对媒体不兼容，无法提供 PSNR。',
    psnrMeasured: (frames: number) =>
      `数值越高越接近参考视频。解码后 RGB24 · 全部 ${frames} 帧 · 全流 MSE。仅作跨引擎数值对比，不设质量合格阈值。${PIXELS_DIFFER.zh}，因此仅凭 PSNR 偏低不能说明输出有问题。`,
    energyNote: '所选测量单元每条有效视频的平均 GPU 板卡能耗，不是单条视频的能耗轨迹。',
    psnrNote: '此视频尚无已封存的配对 PSNR 结果。',
    unscored: {
      invalid_candidate: '无效视频',
      checksum_mismatch: '校验和不符',
      no_reference: '无参考视频',
      settings_mismatch: '配置不一致',
      unreadable: '产物无法读取',
    },
    unscoredNote: {
      invalid_candidate: () => '该视频不是有效的测量输出，质量评分器未作比较。',
      checksum_mismatch: () => '该视频文件的 SHA256 与记录值不符，质量评分器未作比较。',
      no_reference: () => '参考集中没有该用例的视频，质量评分器未作比较。',
      settings_mismatch: (fields: string[]) =>
        `该视频的配置与参考不一致${fields.length > 0 ? `（${fields.join('、')}）` : ''}，质量评分器未作比较。`,
      unreadable: () => '质量评分器无法读取该产物，因此其中的视频均未比较。',
    },
  },
};

type Strings = (typeof STRINGS)['en'] | (typeof STRINGS)['zh'];

export interface ReadoutSide {
  /** "B200", "Diffusers reference", or "B200 lossless" for a twin, whose pill says lossless apart. */
  name: string;
  /** The side's stage pill: its color and unofficial tag. */
  pill: StageClip;
  /** Null for the Diffusers reference and for a missing lossless twin. */
  point: VideoPoint | null;
  /** The side's clip of the shown prompt; undefined while its media read is in flight. */
  clip: ResultsClip | null | undefined;
  cost?: ResultCell['cost'];
}

/** Per-side metrics: each reads one side, so a pair shows the subject's value and its pair's. */
type SideMetric = 'wall' | 'psnr' | 'energy' | 'cost';
/** `paired` stands for the PSNR, SSIM and LPIPS against the lossless twin that no scorer computes yet. */
type Metric = 'speed' | 'paired' | SideMetric;

/**
 * What each pair reads out, in order, one row of at most five cells. A pair against another
 * config leads with speed; quality comes next, then latency and cost as in the board, then energy.
 */
const ROWS: Record<StageOption['kind'], readonly Metric[]> = {
  reference: ['psnr', 'wall', 'cost', 'energy'],
  hardware: ['speed', 'psnr', 'wall', 'cost', 'energy'],
  twin: ['speed', 'paired', 'psnr', 'cost', 'energy'],
};

const PENDING = '…';

interface Reading {
  value: string;
  help?: string;
  /** A line under the value that is not about the pair. */
  sub?: string;
}

interface SideRead {
  /** The matched-noise rerun carries only its PSNR; every other value is not its own. */
  rerunHasIt?: true;
  read: (side: ReadoutSide, s: Strings) => Reading;
}

/**
 * The number behind a lower-is-better value, so its cell can say how the subject stands against
 * its pair. Wall time and PSNR have none: one prompt's times are never divided, and the readout
 * forms no cross-GPU quality score.
 */
const AMOUNTS = {
  cost: ({ cost }: ReadoutSide) => cost?.participating?.perVideo,
  energy: ({ point }: ReadoutSide) => point?.energyKj,
};
const compared = (metric: SideMetric): metric is keyof typeof AMOUNTS => metric in AMOUNTS;

const SIDE_METRICS: Record<SideMetric, SideRead> = {
  wall: {
    read: ({ clip }, s) => {
      if (clip === undefined) return { value: PENDING };
      const seconds = reading(clip?.record.seconds);
      return { value: seconds === null ? s.notMeasured : `${seconds} s` };
    },
  },
  psnr: {
    rerunHasIt: true,
    read: ({ clip }, s) => {
      if (clip === undefined) return { value: PENDING };
      const quality = clip?.quality;
      if (quality) {
        const psnr = reading(quality.psnrDb);
        return {
          value:
            quality.status === 'identical'
              ? s.exactMatch
              : quality.status === 'incompatible'
                ? s.incompatibleShort
                : psnr === null
                  ? s.notMeasured
                  : `${psnr} dB`,
          help:
            quality.status === 'incompatible'
              ? s.incompatible
              : s.psnrMeasured(quality.totalFrames),
        };
      }
      if (clip?.unscored)
        return {
          value: s.unscored[clip.unscored.reason],
          help: s.unscoredNote[clip.unscored.reason](clip.unscored.fields),
        };
      return { value: s.notMeasured, help: s.psnrNote };
    },
  },
  energy: {
    read: ({ point }, s) => {
      const kj = reading(point?.energyKj);
      return { value: kj === null ? s.notMeasured : `${kj} kJ`, help: s.energyNote };
    },
  },
  // The chart's basis is the participating GPUs; per video-second and the allocated basis sit in the help.
  cost: {
    read: ({ cost }, s) => ({
      value: dollars(cost?.participating?.perVideo) ?? s.notMeasured,
      help: s.costHelp(
        dollars(cost?.participating?.perVideoSecond),
        dollars(cost?.allocated?.perVideo),
        dollars(cost?.allocated?.perVideoSecond),
      ),
    }),
  },
};

/** One side's value of a per-side metric. */
function readSide(metric: SideMetric, side: ReadoutSide, diagnostic: boolean, s: Strings): Reading {
  // A missing twin has no cell, so none of its values will ever arrive.
  if (side.point === null) return { value: '—' };
  const { rerunHasIt, read } = SIDE_METRICS[metric];
  if (diagnostic && !rerunHasIt)
    return { value: '—', help: s.diagnosticMetric, sub: s.diagnosticMetric };
  return read(side, s);
}

interface Cell extends Reading {
  metric: Metric;
  label: string;
  /** The pair's line, after its color dot: how the subject stands against it, then its own value. */
  pair?: { words?: string; value: string };
  /** The lossy pair's headline trade, tinted; its value turns green only when the subject is faster. */
  lead?: { faster: boolean };
}

function cell(
  metric: Metric,
  kind: StageOption['kind'],
  a: ReadoutSide,
  b: ReadoutSide,
  diagnostic: boolean,
  s: Strings,
): Cell {
  if (metric === 'speed') {
    // Both pairs compare cell p50s, the deployment medians the chart plots; wall time is per prompt.
    const label = kind === 'twin' ? s.speedLossless : s.speed(b.name);
    if (diagnostic) return { metric, label, value: '—', sub: s.diagnosticMetric };
    const speed = speedVs(a.point?.p50 ?? null, b.point?.p50 ?? null);
    // No ratio is coming without both p50s, so this is a dash, not "Not measured yet".
    if (speed === null) return { metric, label, value: '—' };
    const subject = reading(a.point?.p50);
    const pair = reading(b.point?.p50);
    return {
      metric,
      label,
      value: s.speedRatio[speed.direction](speed.times),
      sub: subject !== null && pair !== null ? s.p50Pair(subject, pair) : undefined,
      help: s.speedHelp,
      lead: kind === 'twin' ? { faster: speed.direction === 'faster' } : undefined,
    };
  }
  if (metric === 'paired')
    // Paired scores need the lossless twin; without one they will never be measured.
    return b.point === null
      ? { metric, label: s.paired, value: '—' }
      : {
          metric,
          label: s.paired,
          value: s.planned,
          sub: s.pairedScores,
          help: s.pairedPending,
        };
  const own = { metric, label: s[metric], ...readSide(metric, a, diagnostic, s) };
  if (kind === 'reference') return own;
  const theirs = readSide(metric, b, diagnostic, s).value;
  // The rerun's cost and energy are not its own, so nothing is compared.
  const comparison =
    compared(metric) && !diagnostic ? compareLower(AMOUNTS[metric](a), AMOUNTS[metric](b)) : null;
  const words = comparison && compared(metric) ? s.versus[metric](comparison, b.name) : null;
  return { ...own, pair: words ? { words, value: theirs } : { value: `${b.name} ${theirs}` } };
}

/** The pill's name, the side's layout, precision and lossy optimizations, and its unofficial tag. */
function PairSide({
  side,
  diagnostic,
  locale,
}: {
  side: ReadoutSide;
  diagnostic: boolean;
  locale: 'en' | 'zh';
}) {
  const s = STRINGS[locale];
  const { pill, point } = side;
  // The matched-noise rerun has its own GPU count, which only the pill knows.
  const meta =
    point && !diagnostic
      ? [layoutLabel(point, locale), precisionTag(point), lossyLabel(optimizationsOf(point))]
          .filter(Boolean)
          .join(' · ')
      : pill.meta;
  return (
    <span
      className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5"
      data-readout-side={pill.id}
    >
      <SideDot color={pill.color} />
      <b className="font-medium">{side.name}</b>
      {meta && <span className="text-muted-foreground">{meta}</span>}
      {pill.unofficial && (
        <span
          className="rounded border px-1 text-2xs"
          style={pill.color ? { borderColor: pill.color } : undefined}
        >
          {s.unofficial}
        </span>
      )}
    </span>
  );
}

/** The readout's element id, which the detail page's PSNR link lands on in the phone layout. */
export const READOUT_ID = 'comparison-readout';

export interface VideoClipReadoutProps {
  kind: StageOption['kind'];
  a: ReadoutSide;
  /** Its pair: the reference, another hardware's lead (or its own GPU's official lead), or the lossless twin. */
  b: ReadoutSide;
  /** The matched-noise rerun carries PSNR only; the cell's time, energy and cost are not its own. */
  diagnostic: boolean;
}

export default function VideoClipReadout({ kind, a, b: pair, diagnostic }: VideoClipReadoutProps) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const touch = useIsCoarsePointer();
  // An unofficial run against its own GPU's official lead would otherwise read "B200 against B200".
  const b =
    a.pill.unofficial && !pair.pill.unofficial && pair.name === a.name
      ? { ...pair, name: s.official(pair.name) }
      : pair;
  const cells = ROWS[kind].map((metric) => cell(metric, kind, a, b, diagnostic, s));
  return (
    <section
      id={READOUT_ID}
      data-testid="video-results-readout"
      data-pair={kind}
      aria-label={s.pair(a.name, b.name)}
      aria-live="polite"
      className="scroll-mt-24 space-y-2 text-xs"
    >
      <p
        data-testid="video-results-readout-pair"
        className="flex flex-wrap items-center gap-x-2 gap-y-1"
      >
        <PairSide side={a} diagnostic={diagnostic} locale={locale} />
        <span className="text-muted-foreground">{s.against}</span>
        <PairSide side={b} diagnostic={diagnostic} locale={locale} />
      </p>
      {/* Auto columns keep every pair, four or five cells, on one row from lg. A phone lists the
          cells in one column, each a label over its value with the pair's line beside it. */}
      <dl className="m-0 grid grid-cols-2 overflow-hidden rounded-lg border border-border/30 bg-muted/10 tabular-nums max-md:grid-cols-1 max-md:divide-y max-md:divide-border/30 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none lg:divide-x lg:divide-border/30">
        {cells.map((item) => (
          <div
            key={item.metric}
            data-metric={item.metric}
            data-lead={item.lead ? '' : undefined}
            title={item.help}
            className={cn(
              'flex min-w-0 flex-col gap-0.5 px-3.5 py-2.5 max-md:flex-row max-md:flex-wrap max-md:items-baseline max-md:gap-x-3',
              item.lead && 'bg-success/10',
            )}
          >
            <dt className="text-2xs text-muted-foreground max-md:basis-full max-md:text-xs">
              {item.label}
              {/* A touch screen never shows the cell's hover title. */}
              {touch && item.help && (
                <InfoHelp
                  label={item.label}
                  value={`readout-${item.metric}`}
                  align="start"
                  // The panel clips at its top edge, so the hit area sits a little lower.
                  triggerClassName="-my-1.5 ml-0.5 align-middle [--hit-y:4px]"
                >
                  {item.help}
                </InfoHelp>
              )}
            </dt>
            <dd
              className={cn(
                'm-0 font-mono text-base font-medium break-words max-md:font-sans max-md:text-lg max-md:font-semibold',
                item.lead?.faster && 'font-semibold text-success',
              )}
            >
              {item.value}
            </dd>
            {item.sub && (
              <dd className="m-0 text-2xs break-words text-muted-foreground max-md:text-xs">
                {item.sub}
              </dd>
            )}
            {item.pair && (
              <dd className="m-0 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground max-md:text-xs">
                <SideDot color={b.pill.color} />
                <span className="min-w-0 break-words">
                  {item.pair.words && <span className="text-foreground">{item.pair.words}</span>}
                  {item.pair.words && ' · '}
                  {item.pair.value}
                </span>
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
