'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@/lib/i18n/use-locale';
import { speedVs, type StageOption } from './clip-stage';
import { layoutLabel } from './deployment';
import type { VideoPoint } from './metrics';
import { lossyLabel, optimizationsOf } from './optimizations';
import type { ResultCell } from './results';
import type { ResultsClip } from './results-clips';
import { SideDot, type StageClip } from './VideoClipStage';

const STRINGS = {
  en: {
    pair: (a: string, b: string) => `${a} against ${b}`,
    against: 'against',
    unofficial: 'Unofficial run',
    official: (name: string) => `${name} official`,
    notMeasured: 'Not measured yet',
    diagnosticMetric: 'Not provided for this diagnostic.',
    speed: (name: string) => `Speed vs ${name}`,
    speedRatio: {
      faster: (x: string) => `${x}× faster`,
      slower: (x: string) => `${x}× slower`,
      same: () => 'Same speed',
    },
    p50Pair: (a: string, b: string) => `p50 ${a} s vs ${b} s`,
    speedHelp: 'Ratio of the two cells’ median latency per clip.',
    wall: 'Wall time (this prompt)',
    psnr: 'PSNR vs reference',
    psnrLossless: 'PSNR vs lossless',
    ssimLossless: 'SSIM vs lossless',
    lpipsLossless: 'LPIPS vs lossless',
    higherCloser: 'Higher is closer',
    lowerCloser: 'Lower is closer',
    pairedPending: 'Scores against the same engine’s lossless output are not published yet.',
    energy: 'Energy per clip',
    energySub: 'Cell mean',
    participating: 'TCO per clip (participating)',
    allocated: 'TCO per clip (allocated)',
    perVideoSecond: (value: string) => `$${value} / video-s`,
    costHelp: 'Modelled TCO per valid clip from the selected tier and the recorded GPU count.',
    exactMatch: 'Exact match',
    incompatibleShort: 'Incompatible pair',
    incompatible: 'Paired media are incompatible; PSNR is unavailable.',
    psnrMeasured: (frames: number) =>
      `Decoded RGB24 · all ${frames} frames · full-stream MSE. Descriptive cross-engine comparison; no quality pass/fail threshold. Different engines and parallel layouts produce different pixels from the same prompt and seed, so a low value alone does not indicate a defect.`,
    energyNote:
      'Mean GPU-board joules per valid clip in the selected measurement cell; not a per-clip energy trace.',
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
    speedRatio: {
      faster: (x: string) => `加速 ${x}×`,
      slower: (x: string) => `耗时为其 ${x} 倍`,
      same: () => '速度相同',
    },
    p50Pair: (a: string, b: string) => `p50 ${a} s 对比 ${b} s`,
    speedHelp: '两个测量单元单条视频中位延迟之比。',
    wall: '出片时间（当前 prompt）',
    psnr: '相对参考的 PSNR',
    psnrLossless: '相对无损对照的 PSNR',
    ssimLossless: '相对无损对照的 SSIM',
    lpipsLossless: '相对无损对照的 LPIPS',
    higherCloser: '越高越接近',
    lowerCloser: '越低越接近',
    pairedPending: '与同一引擎无损输出对比的质量分尚未发布。',
    energy: '每条视频能耗',
    energySub: '测量单元均值',
    participating: '每条视频 TCO（参与 GPU）',
    allocated: '每条视频 TCO（分配 GPU）',
    perVideoSecond: (value: string) => `$${value} / 视频秒`,
    costHelp: '按所选成本档位和记录的 GPU 数量估算的每条有效视频 TCO。',
    exactMatch: '完全一致',
    incompatibleShort: '配对不兼容',
    incompatible: '配对媒体不兼容，无法提供 PSNR。',
    psnrMeasured: (frames: number) =>
      `解码后 RGB24 · 全部 ${frames} 帧 · 全流 MSE。仅作跨引擎数值对比，不设质量合格阈值。不同引擎或并行配置即使使用相同的 prompt 和 seed，生成的像素也会不同，因此仅凭 PSNR 偏低不能说明输出有问题。`,
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
type SideMetric = 'wall' | 'psnr' | 'energy' | 'participating' | 'allocated';
/** Scores against the lossless twin, unpublished until paired scoring lands; each with its polarity. */
const LOSSLESS_SCORES = {
  psnrLossless: 'higherCloser',
  ssimLossless: 'higherCloser',
  lpipsLossless: 'lowerCloser',
} as const;
type LosslessScore = keyof typeof LOSSLESS_SCORES;
type Metric = 'speed' | SideMetric | LosslessScore;

const isLosslessScore = (metric: Metric): metric is LosslessScore => metric in LOSSLESS_SCORES;

/**
 * What each pair reads out, in order. A lossy pair leads with its trade against lossless. Energy
 * stays in the third of five columns, so switching the pair does not move it.
 */
const ROWS: Record<StageOption['kind'], readonly Metric[]> = {
  reference: ['wall', 'psnr', 'energy', 'participating', 'allocated'],
  lead: ['wall', 'psnr', 'energy', 'participating', 'allocated', 'speed'],
  twin: [
    'speed',
    'psnrLossless',
    'ssimLossless',
    'lpipsLossless',
    'participating',
    'wall',
    'psnr',
    'energy',
    'allocated',
  ],
};

const PENDING = '…';
const display = (value: number | null | undefined, digits = 1) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: digits })
    : null;

interface Reading {
  value: string;
  help?: string;
  /** The line under the subject's value. */
  sub?: string;
}

interface SideRead {
  /** The matched-noise rerun carries only its PSNR; every other value is not its own. */
  rerunHasIt?: true;
  read: (side: ReadoutSide, s: Strings) => Reading;
  context?: (side: ReadoutSide, s: Strings) => string | undefined;
}

const costRead = (basis: 'participating' | 'allocated'): SideRead => ({
  read: ({ cost }, s) => {
    const perVideo = display(cost?.[basis]?.perVideo, 4);
    return { value: perVideo === null ? s.notMeasured : `$${perVideo}`, help: s.costHelp };
  },
  context: ({ cost }, s) => {
    const perSecond = display(cost?.[basis]?.perVideoSecond, 4);
    return perSecond === null ? undefined : s.perVideoSecond(perSecond);
  },
});

const SIDE_METRICS: Record<SideMetric, SideRead> = {
  wall: {
    read: ({ clip }, s) => {
      if (clip === undefined) return { value: PENDING };
      const seconds = display(clip?.record.seconds);
      return { value: seconds === null ? s.notMeasured : `${seconds} s` };
    },
  },
  psnr: {
    rerunHasIt: true,
    read: ({ clip }, s) => {
      if (clip === undefined) return { value: PENDING };
      const quality = clip?.quality;
      if (quality) {
        const psnr = display(quality.psnrDb, 2);
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
    context: (_, s) => s.higherCloser,
  },
  energy: {
    read: ({ point }, s) => {
      const kj = point?.energyKj ?? null;
      const joules = display(kj === null ? null : kj * 1000, 0);
      return { value: joules === null ? s.notMeasured : `${joules} J`, help: s.energyNote };
    },
    context: (_, s) => s.energySub,
  },
  participating: costRead('participating'),
  allocated: costRead('allocated'),
};

/** One side's value of a per-side metric, with its context line. */
function readSide(metric: SideMetric, side: ReadoutSide, diagnostic: boolean, s: Strings): Reading {
  const { rerunHasIt, read, context } = SIDE_METRICS[metric];
  if (diagnostic && !rerunHasIt)
    return { value: '—', help: s.diagnosticMetric, sub: s.diagnosticMetric };
  return { ...read(side, s), sub: context?.(side, s) };
}

interface Cell extends Reading {
  metric: Metric;
  label: string;
  /** The pair's own value, after its color dot. */
  pairValue?: string;
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
    const label = s.speed(b.name);
    if (diagnostic) return { metric, label, value: '—', sub: s.diagnosticMetric };
    const speed = speedVs(a.point?.p50 ?? null, b.point?.p50 ?? null);
    // No ratio is coming without both p50s, so this is a dash, not "Not measured yet".
    if (speed === null) return { metric, label, value: '—' };
    const subject = display(a.point?.p50);
    const pair = display(b.point?.p50);
    return {
      metric,
      label,
      value: s.speedRatio[speed.direction](speed.times),
      sub: subject !== null && pair !== null ? s.p50Pair(subject, pair) : undefined,
      help: s.speedHelp,
    };
  }
  if (isLosslessScore(metric))
    // Paired scores need the lossless twin; without one they will never be measured.
    return b.point === null
      ? { metric, label: s[metric], value: '—' }
      : {
          metric,
          label: s[metric],
          value: s.notMeasured,
          sub: s[LOSSLESS_SCORES[metric]],
          help: s.pairedPending,
        };
  return {
    metric,
    label: s[metric],
    ...readSide(metric, a, diagnostic, s),
    pairValue:
      kind === 'reference' ? undefined : `${b.name} ${readSide(metric, b, diagnostic, s).value}`,
  };
}

/** The pill's name, the side's layout and lossy optimizations, and its unofficial tag. */
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
      ? [layoutLabel(point, locale), lossyLabel(optimizationsOf(point))].filter(Boolean).join(' · ')
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

export interface VideoClipReadoutProps {
  kind: StageOption['kind'];
  a: ReadoutSide;
  /** Its pair: the reference, another hardware's lead (or its own GPU's official lead), or the lossless twin. */
  b: ReadoutSide;
  /** The matched-noise rerun carries PSNR only; the cell's time, energy and cost are not its own. */
  diagnostic: boolean;
  footer?: ReactNode;
}

export default function VideoClipReadout({
  kind,
  a,
  b: pair,
  diagnostic,
  footer,
}: VideoClipReadoutProps) {
  const locale = useLocale();
  const s = STRINGS[locale];
  // An unofficial run against its own GPU's official lead would otherwise read "B200 against B200".
  const b =
    a.pill.unofficial && !pair.pill.unofficial && pair.name === a.name
      ? { ...pair, name: s.official(pair.name) }
      : pair;
  const cells = ROWS[kind].map((metric) => cell(metric, kind, a, b, diagnostic, s));
  return (
    <section
      data-testid="video-results-readout"
      data-pair={kind}
      aria-label={s.pair(a.name, b.name)}
      className="space-y-3 rounded-lg border bg-muted/30 p-3 text-xs"
    >
      {/* The footer stays outside the live region, so opening it does not re-announce the values. */}
      <div aria-live="polite" className="space-y-3">
        <p
          data-testid="video-results-readout-pair"
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <PairSide side={a} diagnostic={diagnostic} locale={locale} />
          <span className="text-muted-foreground">{s.against}</span>
          <PairSide side={b} diagnostic={diagnostic} locale={locale} />
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 tabular-nums lg:grid-cols-5">
          {cells.map((item) => (
            <div
              key={item.metric}
              data-metric={item.metric}
              title={item.help}
              className="flex min-w-0 flex-col gap-0.5"
            >
              <dt className="text-2xs text-muted-foreground">{item.label}</dt>
              <dd className="m-0 text-base font-medium break-words">{item.value}</dd>
              {item.sub && (
                <dd className="m-0 text-2xs break-words text-muted-foreground">{item.sub}</dd>
              )}
              {item.pairValue && (
                <dd className="m-0 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
                  <SideDot color={b.pill.color} />
                  <span className="min-w-0 break-words">{item.pairValue}</span>
                </dd>
              )}
            </div>
          ))}
        </dl>
      </div>
      {footer}
    </section>
  );
}
