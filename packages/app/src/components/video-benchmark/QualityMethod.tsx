'use client';

import { ArrowRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { videoQualityGuidePath } from '@/lib/video/quality-guide-path';
import type { StageCandidate } from './clip-stage';
import { hardwareLabel } from './hardware';
import type { VideoPoint } from './metrics';
import { referencePsnrRange, showMeTarget, type LossyPair } from './quality-method';
import { PIXELS_DIFFER } from './VideoClipReadout';

const STRINGS = {
  en: {
    title: 'How we score quality',
    today:
      'Today each clip is scored by PSNR against the official Diffusers reference, over every decoded frame of the same prompt and seed.',
    range: (clips: number, hardware: string, min: string, max: string) =>
      `${clips === 1 ? 'The 1 lossless clip loaded here' : `The ${clips} lossless clips loaded here`} (${hardware}) ${clips === 1 ? 'scores' : 'score'} ${min === max ? min : `${min}–${max}`} dB.`,
    whyTitle: 'Why not score against the official reference?',
    why: `${PIXELS_DIFFER.en}, so a reference score mixes those differences with any change a lossy optimization makes.`,
    paired: 'Paired lossless scores',
    planned: 'Planned',
    pairedBody:
      'No scorer computes these yet. The plan is to score each lossy config against its own lossless run.',
    fixedTitle: 'Held fixed',
    fixed: ['GPU', 'Engine', 'Server layout', 'Prompt', 'Seed'],
    runsTitle: 'Two runs',
    lossless: 'Lossless run',
    losslessSub: 'lossy options off',
    lossy: 'Lossy run',
    lossySub: 'lossy options on',
    scoreTitle: 'Score every decoded frame',
    metrics: [
      ['PSNR', 'dB · higher is closer'],
      ['SSIM', '≤ 1 · higher is closer'],
      ['LPIPS', '0 = identical · lower is closer'],
    ],
    reportTitle: 'Report per config',
    report: 'The median and the worst clip over the scored prompts (up to 20).',
    floor:
      'The plan also runs the lossless config twice. The gap between those two runs would be the noise floor for the pair.',
    showMe: 'Show me',
    showMeHelp: (hardware: string) => `Plays ${hardware} against the Diffusers reference in Wipe.`,
    methodology: 'Full methodology →',
    lossyHint:
      'Lossy configs trade some quality for speed. Scoring each one against its own lossless run is planned.',
    seeChanges: 'See what changes ↓',
  },
  zh: {
    title: '质量评分方法',
    today:
      '目前每条视频都与官方 Diffusers 参考视频比较 PSNR：使用相同的 prompt 和 seed，逐帧比较全部解码画面。',
    range: (clips: number, hardware: string, min: string, max: string) =>
      `本页已加载的 ${clips} 条无损视频（${hardware}）PSNR ${min === max ? `为 ${min} dB` : `在 ${min}–${max} dB 之间`}。`,
    whyTitle: '为什么不以官方参考视频为基准评分？',
    why: `${PIXELS_DIFFER.zh}，因此相对参考的分数会把这些差异与有损优化可能带来的变化混在一起。`,
    paired: '与无损运行的配对评分',
    planned: '计划中',
    pairedBody: '目前还没有评分器计算这些分数。计划改为以每个有损配置自己的无损运行为基准评分。',
    fixedTitle: '保持不变',
    fixed: ['GPU', '引擎', '服务器布局', 'prompt', 'seed'],
    runsTitle: '两次运行',
    lossless: '无损运行',
    losslessSub: '关闭有损选项',
    lossy: '有损运行',
    lossySub: '开启有损选项',
    scoreTitle: '逐帧比较解码画面',
    metrics: [
      ['PSNR', 'dB · 越高越接近'],
      ['SSIM', '≤ 1 · 越高越接近'],
      ['LPIPS', '0 表示完全一致 · 越低越接近'],
    ],
    reportTitle: '按配置报告',
    report: '已评分的 prompt（最多 20 条）中的中位数和最差的一条视频。',
    floor: '按计划，无损配置还会再运行一次，两次运行之间的差距即为这组配对的本底噪声。',
    showMe: '播放示例',
    showMeHelp: (hardware: string) => `以卷帘视图对比播放 ${hardware} 与 Diffusers 参考视频。`,
    methodology: '完整方法说明 →',
    lossyHint: '有损配置以部分画质换取速度。以各配置自身无损运行为基准的评分尚在计划中。',
    seeChanges: '查看画面变化 ↓',
  },
};

/**
 * "How we score quality", under the stage readout: today's reference PSNR with the live range of
 * the leads' clips, the planned paired lossless method, and "Show me".
 */
export default function QualityMethod({
  leads,
  namedRun,
  onShowMe,
}: {
  /** The visible hardware leads and their loaded sides. */
  leads: readonly StageCandidate[];
  /** `?unofficialrun=`, whose leads Show me tries first. */
  namedRun?: string;
  /** Plays `point` against its Diffusers reference in Wipe. */
  onShowMe: (point: VideoPoint) => void;
}) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const range = referencePsnrRange(leads);
  const target = showMeTarget(leads, namedRun);
  const targetLabel = target ? hardwareLabel(target.hardwareKey ?? '') : '';
  const helpId = useId();
  return (
    <details
      data-testid="video-results-quality-method"
      className="group/quality text-xs"
      onToggle={(event) => {
        if (event.currentTarget.open) track('video_results_quality_method_opened');
      }}
    >
      <summary className="flex w-full cursor-pointer list-none items-center gap-2 rounded-lg border border-border/30 bg-card px-3 py-2.5 text-sm font-semibold group-open/quality:rounded-b-none hover:bg-muted/10 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform group-open/quality:rotate-90"
        />
        {s.title}
      </summary>
      <div className="flex flex-col gap-3 rounded-b-lg border border-t-0 border-border/30 p-3.5 leading-relaxed">
        <p className="max-w-measure">{s.today}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{s.paired}</span>
          <span className="rounded-full border border-border/30 px-2 py-0.5 text-2xs text-muted-foreground">
            {s.planned}
          </span>
        </div>
        <p className="-mt-1.5 max-w-measure text-muted-foreground">{s.pairedBody}</p>
        <MethodDiagram locale={locale} />
        <p className="max-w-measure rounded-lg bg-muted/20 px-3 py-2">{s.floor}</p>
        <div
          data-testid="video-results-quality-why"
          className="flex max-w-measure flex-col gap-1.5 border-l-3 border-border-alt py-0.5 pl-3"
        >
          <p className="text-sm font-semibold">{s.whyTitle}</p>
          <p className="text-muted-foreground">
            {range &&
              `${s.range(
                range.clips,
                range.hardware.map(hardwareLabel).join(locale === 'zh' ? '、' : ', '),
                range.min.toFixed(1),
                range.max.toFixed(1),
              )}${locale === 'zh' ? '' : ' '}`}
            {s.why}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {target && (
            <span className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="video-results-quality-show-me"
                aria-describedby={helpId}
                onClick={() => {
                  track('video_results_quality_show_me', { gpu: target.hardwareKey });
                  onShowMe(target);
                }}
              >
                {s.showMe}
              </Button>
              <span id={helpId} className="text-muted-foreground">
                {s.showMeHelp(targetLabel)}
              </span>
            </span>
          )}
          <Link
            href={videoQualityGuidePath(locale)}
            className="text-brand-fill underline underline-offset-2"
            onClick={() => track('video_results_quality_methodology_clicked')}
          >
            {s.methodology}
          </Link>
        </div>
      </div>
    </details>
  );
}

/**
 * Held fixed → two runs → score every frame → report, as a row from 1024 px and a column below.
 * The quality guide draws the same diagram.
 */
export function MethodDiagram({ locale }: { locale: Locale }) {
  const s = STRINGS[locale];
  return (
    <div
      data-testid="video-results-quality-diagram"
      className="grid gap-1.5 lg:grid-cols-[minmax(0,0.8fr)_auto_minmax(0,1.2fr)_auto_minmax(0,1.2fr)_auto_minmax(0,1fr)]"
    >
      <Node title={s.fixedTitle}>
        <ul className="flex flex-col gap-1 text-muted-foreground">
          {s.fixed.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Node>
      <Arrow />
      <Node title={s.runsTitle}>
        <Lane name={s.lossless} sub={s.losslessSub} />
        <Lane name={s.lossy} sub={s.lossySub} lossy />
      </Node>
      <Arrow />
      <Node title={s.scoreTitle}>
        {/* An auto name column keeps every description on the same line start. */}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
          {s.metrics.map(([name, help]) => (
            <Fragment key={name}>
              <dt className="font-mono font-medium">{name}</dt>
              <dd className="m-0 text-muted-foreground">{help}</dd>
            </Fragment>
          ))}
        </dl>
      </Node>
      <Arrow />
      <Node title={s.reportTitle}>
        <p className="text-muted-foreground">{s.report}</p>
      </Node>
    </div>
  );
}

const Arrow = () => (
  <ArrowRight
    aria-hidden="true"
    className="size-3.5 rotate-90 place-self-center text-muted-foreground lg:rotate-0"
  />
);

function Node({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/30 bg-muted/10 p-3">
      <span className="font-medium">{title}</span>
      {children}
    </div>
  );
}

function Lane({ name, sub, lossy = false }: { name: string; sub: string; lossy?: boolean }) {
  return (
    <div
      className={
        lossy
          ? 'rounded-md border border-amber-500/50 bg-amber-500/5 px-2 py-1'
          : 'rounded-md border border-border/30 bg-card px-2 py-1'
      }
    >
      <span className="block">{name}</span>
      <span className="block text-muted-foreground">{sub}</span>
    </div>
  );
}

/**
 * Under the legend's lossy lines: what lossy configs trade, and "See what changes", which plays
 * `pair` on the stage. Without a pair with clips the button is absent and the note stays.
 */
export function LossyQualityHint({
  pair,
  onSeeChanges,
}: {
  pair: LossyPair | null;
  onSeeChanges: (pair: LossyPair) => void;
}) {
  const s = STRINGS[useLocale()];
  return (
    <p
      data-testid="video-results-lossy-hint"
      className="no-export mt-2 text-xs text-muted-foreground"
    >
      {s.lossyHint}{' '}
      {pair && (
        <button
          type="button"
          data-testid="video-results-lossy-see-changes"
          className="font-semibold whitespace-nowrap text-brand-fill hover:underline"
          onClick={() => {
            track('video_results_lossy_see_changes', {
              gpu: pair.lossy.hardwareKey,
              engine: pair.lossy.results?.engine ?? null,
            });
            onSeeChanges(pair);
          }}
        >
          {s.seeChanges}
        </button>
      )}
    </p>
  );
}
