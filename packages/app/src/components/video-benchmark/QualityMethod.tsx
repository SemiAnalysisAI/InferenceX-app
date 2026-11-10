'use client';

import { ArrowRight, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import type { StageCandidate } from './clip-stage';
import { hardwareLabel } from './hardware';
import type { VideoPoint } from './metrics';
import { referencePsnrRange, showMeTarget, type LossyPair } from './quality-method';

const METHODOLOGY = {
  en: 'https://github.com/SemiAnalysisAI/InferenceX/blob/main/video-generation/README.md#reference-psnr',
  zh: 'https://github.com/SemiAnalysisAI/InferenceX/blob/main/video-generation/README_zh.md#参考-psnr',
};

const STRINGS = {
  en: {
    title: 'How we score quality',
    today:
      'Today each clip is scored by PSNR against the official Diffusers reference, over every decoded frame of the same prompt and seed.',
    range: (clips: number, hardware: string, min: string, max: string) =>
      `The ${clips} lossless clips loaded here (${hardware}) score ${min}–${max} dB.`,
    why: 'Different engines and parallel layouts produce different pixels from the same prompt and seed, so a reference score mixes those differences with any change a lossy optimization makes.',
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
      `本页已加载的 ${clips} 条无损视频（${hardware}）PSNR 在 ${min}–${max} dB 之间。`,
    why: '不同引擎或并行配置即使使用相同的 prompt 和 seed，生成的像素也会不同，因此相对参考的分数会把这些差异与有损优化可能带来的变化混在一起。',
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
  return (
    <details
      data-testid="video-results-quality-method"
      className="group/quality border-t pt-3"
      onToggle={(event) => {
        if (event.currentTarget.open) track('video_results_quality_method_opened');
      }}
    >
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 transition-transform group-open/quality:rotate-90"
        />
        {s.title}
      </summary>
      <div className="mt-3 flex max-w-4xl flex-col gap-3 leading-relaxed">
        <p className="max-w-measure">
          {[
            s.today,
            range &&
              s.range(
                range.clips,
                range.hardware.map(hardwareLabel).join(locale === 'zh' ? '、' : ', '),
                range.min.toFixed(1),
                range.max.toFixed(1),
              ),
            s.why,
          ]
            .filter(Boolean)
            .join(locale === 'zh' ? '' : ' ')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{s.paired}</span>
          <span className="rounded-full border px-2 py-0.5 text-2xs text-muted-foreground">
            {s.planned}
          </span>
        </div>
        <p className="-mt-1.5 max-w-measure text-muted-foreground">{s.pairedBody}</p>
        <MethodDiagram s={s} />
        <p className="max-w-measure text-muted-foreground">{s.floor}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {target && (
            <span className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="video-results-quality-show-me"
                onClick={() => {
                  track('video_results_quality_show_me', { gpu: target.hardwareKey });
                  onShowMe(target);
                }}
              >
                {s.showMe}
              </Button>
              <span className="text-muted-foreground">{s.showMeHelp(targetLabel)}</span>
            </span>
          )}
          <a
            href={METHODOLOGY[locale]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => track('video_results_quality_methodology_clicked')}
          >
            {s.methodology}
          </a>
        </div>
      </div>
    </details>
  );
}

type Strings = (typeof STRINGS)['en'] | (typeof STRINGS)['zh'];

/** Held fixed → two runs → score every frame → report, as a row from 1024 px and a column below. */
function MethodDiagram({ s }: { s: Strings }) {
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
        <dl className="flex flex-col gap-1">
          {s.metrics.map(([name, help]) => (
            <div key={name} className="flex flex-wrap gap-x-2">
              <dt className="w-12 shrink-0 font-mono font-medium">{name}</dt>
              <dd className="m-0 min-w-0 text-muted-foreground">{help}</dd>
            </div>
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
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border bg-background p-2.5">
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
          ? 'rounded border border-amber-500/50 bg-amber-500/5 px-2 py-1'
          : 'rounded border px-2 py-1'
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
          className="font-medium whitespace-nowrap text-primary hover:underline"
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
