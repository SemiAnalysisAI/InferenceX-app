'use client';

import * as d3 from 'd3';
import { type CSSProperties, Fragment, useState } from 'react';

import { WidgetFrame, type WidgetProps } from '@/components/tutorial/widget-chrome';
import { Stat } from '@/components/ui/stat';
import { track } from '@/lib/analytics/analytics';
import { FloatingTooltip } from '@/lib/d3-chart/floating-tooltip';
import { CHART_TYPE } from '@/lib/d3-chart/typography';
import { cn } from '@/lib/shared/utils';
import type { ReferencePsnrEvidence } from '@/lib/video/reference-psnr-evidence';

import { hardwareLabel } from '../hardware';
import { videoHardwareColor } from '../hardware-colors';
import type { ReferencePsnrScore } from '../quality-method';

const STRINGS = {
  en: {
    title: 'PSNR against the official Diffusers reference, lossless clips only',
    measured: 'Measured',
    band: (from: number, to: number) => `Example cut-off · ${from}–${to} dB`,
    median: (value: string) => `median ${value} dB`,
    axis: 'PSNR against the official Diffusers reference (dB)',
    below: (hardware: string, cutoff: number) =>
      `${hardware} clips below ${cutoff} dB, with no lossy optimization`,
    spread: 'From the lowest to the highest lossless clip',
    source: 'Lossless SGLang, four GPUs, no lossy optimization. Every decoded frame is scored.',
    run: (runId: string) => `Run ${runId}`,
    unavailable: 'Published scores are unavailable right now. Reload the page to try again.',
    table: (count: number) => `All ${count} scores`,
    prompt: 'Prompt',
  },
  zh: {
    title: '与官方 Diffusers 参考视频比较的 PSNR，仅含无损视频',
    measured: '实测',
    band: (from: number, to: number) => `示例分档线 · ${from}–${to} dB`,
    median: (value: string) => `中位数 ${value} dB`,
    axis: '与官方 Diffusers 参考视频比较的 PSNR（dB）',
    below: (hardware: string, cutoff: number) =>
      `${hardware} 上低于 ${cutoff} dB 的视频，均未开启有损优化`,
    spread: '无损视频中最低分与最高分的差距',
    source: 'SGLang 无损配置，4 张 GPU，未开启任何有损优化，逐帧比较全部解码画面。',
    run: (runId: string) => `运行 ${runId}`,
    unavailable: '暂时无法读取已发布的分数，请刷新页面重试。',
    table: (count: number) => `全部 ${count} 个分数`,
    prompt: 'Prompt',
  },
} as const;

/** An example of the kind of cut-off this guide argues against, not a rule anyone adopted. */
const EXAMPLE_BAND = { from: 10, to: 17 } as const;
const ROW_HEIGHT = 76;
const BAND_LABEL_HEIGHT = 22;
const AXIS_HEIGHT = 28;
/** Unused x at each end, in percent, so the end tick labels are not clipped. */
const PAD = 2;
/** Beeswarm lanes above and below a row's centre line, in lane steps. */
const LANES = [0, -1, 1, -2, 2, -3, 3] as const;
const LANE_PX = 10;

interface Dot extends ReferencePsnrScore {
  lane: number;
}

interface Row {
  hardwareKey: string;
  label: string;
  median: number;
  below: number;
  dots: Dot[];
}

/** Each score's lane: the first in which no earlier dot sits within `gap` dB. */
function swarm(scores: readonly ReferencePsnrScore[], gap: number): Dot[] {
  const placed: Dot[] = [];
  for (const score of scores.toSorted((a, b) => a.psnrDb - b.psnrDb)) {
    const lane =
      LANES.find(
        (candidate) =>
          !placed.some((dot) => dot.lane === candidate && score.psnrDb - dot.psnrDb < gap),
      ) ?? 0;
    placed.push({ ...score, lane });
  }
  return placed;
}

/** The hardware hue for both themes, resolved in CSS so the server render matches either. */
function hueStyle(hardwareKey: string): CSSProperties {
  return {
    '--hw-light': videoHardwareColor(hardwareKey, 'light') ?? 'var(--foreground)',
    '--hw-dark': videoHardwareColor(hardwareKey, 'dark') ?? 'var(--foreground)',
  } as CSSProperties;
}
const HUE_CLASS = '[--hw:var(--hw-light)] dark:[--hw:var(--hw-dark)]';

const scoreLabel = (value: number) => value.toFixed(1);
/** Per-clip scores keep two decimals, so 16.96 and 17.02 read apart around the cut-off. */
const clipScoreLabel = (value: number) => value.toFixed(2);

interface Active {
  prompt: string;
  x: number;
  y: number;
}

/** The hovered or tapped clip, anchored at its dot's centre in viewport coordinates. */
function activeAt(dot: Element, prompt: string): Active {
  const box = dot.getBoundingClientRect();
  return { prompt, x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * The guide's opening chart: every lossless clip of the pinned run, one strip per GPU, against
 * an example 10–17 dB cut-off. Hovering a clip rings the same prompt on the other GPU.
 */
export function ReferencePsnrWidget({
  locale,
  alt,
  evidence,
}: WidgetProps & { evidence: ReferencePsnrEvidence }) {
  const t = STRINGS[locale];
  const [active, setActive] = useState<Active | null>(null);
  const hardware = evidence.hardware;
  const runUrl = `https://github.com/SemiAnalysisAI/InferenceX/actions/runs/${evidence.runId}`;

  return (
    <WidgetFrame scope="video" name="reference-psnr" alt={alt}>
      <figure className="m-0">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-medium">{t.title}</span>
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
            {t.measured}
          </span>
        </div>
        {hardware ? (
          <Strip locale={locale} hardware={hardware} active={active} onActive={setActive} />
        ) : (
          <p
            role="status"
            data-testid="video-quality-guide-psnr-unavailable"
            style={{ height: BAND_LABEL_HEIGHT + 2 * ROW_HEIGHT + AXIS_HEIGHT + 20 }}
            className="flex items-center rounded-lg bg-muted/30 px-4 text-sm text-muted-foreground"
          >
            {t.unavailable}
          </p>
        )}
        <figcaption className="mt-3 text-xs text-muted-foreground">
          <a
            href={runUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono underline underline-offset-2 hover:text-foreground"
            onClick={() => track('video_quality_guide_run_opened')}
          >
            {t.run(evidence.runId)}
          </a>
          {' · '}
          {t.source}
        </figcaption>
      </figure>
      {hardware && <Scores locale={locale} hardware={hardware} />}
    </WidgetFrame>
  );
}

function Strip({
  locale,
  hardware,
  active,
  onActive,
}: {
  locale: WidgetProps['locale'];
  hardware: NonNullable<ReferencePsnrEvidence['hardware']>;
  active: Active | null;
  onActive: (next: Active | null) => void;
}) {
  const t = STRINGS[locale];
  const all = hardware.flatMap((lead) => lead.scores.map((score) => score.psnrDb));
  const lo = Math.min(EXAMPLE_BAND.from, 2 * Math.floor(Math.min(...all) / 2));
  const hi = Math.max(30, 2 * Math.ceil(Math.max(...all) / 2));
  const x = (value: number) => PAD + ((value - lo) / (hi - lo)) * (100 - 2 * PAD);
  const pct = (value: number) => `${x(value)}%`;
  const ticks = d3.range(lo, hi + 1, 2);
  const rows: Row[] = hardware.map((lead) => {
    const values = lead.scores.map((score) => score.psnrDb);
    return {
      hardwareKey: lead.hardwareKey,
      label: hardwareLabel(lead.hardwareKey),
      median: d3.median(values) ?? 0,
      below: values.filter((value) => value < EXAMPLE_BAND.to).length,
      // Dots closer than 3.5 % of the axis share no lane; about 0.7 dB on a 20 dB axis.
      dots: swarm(lead.scores, (hi - lo) * 0.035),
    };
  });
  const band = (
    <>
      <rect
        x={pct(lo)}
        width={`${x(EXAMPLE_BAND.to) - x(lo)}%`}
        y={0}
        height="100%"
        fill="var(--warning)"
        fillOpacity={0.12}
      />
      <line
        x1={pct(EXAMPLE_BAND.to)}
        x2={pct(EXAMPLE_BAND.to)}
        y1={0}
        y2="100%"
        stroke="var(--warning)"
        strokeWidth={1.2}
        strokeDasharray="4 3"
      />
    </>
  );
  const grid = ticks.map((tick) => (
    <line
      key={tick}
      x1={pct(tick)}
      x2={pct(tick)}
      y1={0}
      y2="100%"
      stroke="var(--border)"
      strokeOpacity={0.5}
    />
  ));

  return (
    <div
      className="grid grid-cols-[4.5rem_minmax(0,1fr)] sm:grid-cols-[6.5rem_minmax(0,1fr)]"
      // A touch pointer leaves on lift; its tooltip stays until another dot is tapped.
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') onActive(null);
      }}
    >
      <span />
      <svg aria-hidden="true" width="100%" height={BAND_LABEL_HEIGHT} className="block">
        {band}
        <text
          x={`${x(lo) + 0.8}%`}
          y={15}
          fontSize={CHART_TYPE.annotation}
          fontWeight={600}
          fill="var(--warning)"
        >
          {t.band(EXAMPLE_BAND.from, EXAMPLE_BAND.to)}
        </text>
      </svg>
      {rows.map((row) => (
        <Fragment key={row.hardwareKey}>
          <div
            style={hueStyle(row.hardwareKey)}
            className={cn(HUE_CLASS, 'flex flex-col justify-center pr-3 text-right')}
          >
            <span className="text-sm font-semibold text-(--hw)">{row.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {t.median(scoreLabel(row.median))}
            </span>
          </div>
          <svg
            aria-hidden="true"
            width="100%"
            height={ROW_HEIGHT}
            style={hueStyle(row.hardwareKey)}
            className={cn(HUE_CLASS, 'block')}
            data-testid="video-quality-guide-psnr-row"
          >
            {band}
            {grid}
            <line
              x1={pct(row.median)}
              x2={pct(row.median)}
              y1={6}
              y2={ROW_HEIGHT - 6}
              stroke="var(--foreground)"
              strokeOpacity={0.7}
              strokeWidth={1.4}
              strokeDasharray="3 2"
            />
            {row.dots.map((dot) => {
              const on = active?.prompt === dot.prompt;
              return (
                <g
                  key={dot.prompt}
                  data-testid="video-quality-guide-psnr-dot"
                  opacity={active && !on ? 0.35 : 1}
                  className="cursor-pointer"
                  onPointerEnter={(event) => onActive(activeAt(event.currentTarget, dot.prompt))}
                  onClick={(event) => {
                    onActive(activeAt(event.currentTarget, dot.prompt));
                    track('video_quality_guide_psnr_point', {
                      gpu: row.hardwareKey,
                      value: dot.caseId ?? dot.prompt,
                    });
                  }}
                >
                  <circle
                    cx={pct(dot.psnrDb)}
                    cy={ROW_HEIGHT / 2 + dot.lane * LANE_PX}
                    r={9}
                    fill="transparent"
                  />
                  <circle
                    cx={pct(dot.psnrDb)}
                    cy={ROW_HEIGHT / 2 + dot.lane * LANE_PX}
                    r={on ? 6.5 : 5}
                    fill="var(--hw)"
                    fillOpacity={0.85}
                    stroke={on ? 'var(--foreground)' : 'var(--background)'}
                    strokeWidth={on ? 2 : 1.2}
                  />
                </g>
              );
            })}
          </svg>
        </Fragment>
      ))}
      <span />
      <svg aria-hidden="true" width="100%" height={AXIS_HEIGHT} className="block">
        <line x1={pct(lo)} x2={pct(hi)} y1={0.5} y2={0.5} stroke="var(--border)" />
        {ticks.map((tick) => (
          <text
            key={tick}
            x={pct(tick)}
            y={18}
            textAnchor="middle"
            fontSize={CHART_TYPE.axisLabel}
            fill="var(--muted-foreground)"
            // Every other label below 640 px, so phone-width labels never touch.
            className={(tick - lo) % 4 === 0 ? undefined : 'max-sm:hidden'}
          >
            {tick}
          </text>
        ))}
      </svg>
      <span />
      <p className="h-5 text-center text-xs text-muted-foreground">{t.axis}</p>
      {/* A fresh tooltip per clip is placed before its first paint, so it never shifts. */}
      {active && <PsnrTooltip key={active.prompt} active={active} hardware={hardware} />}
    </div>
  );
}

function PsnrTooltip({
  active,
  hardware,
}: {
  active: Active;
  hardware: NonNullable<ReferencePsnrEvidence['hardware']>;
}) {
  const matches = hardware.flatMap((lead) => {
    const score = lead.scores.find((item) => item.prompt === active.prompt);
    return score ? [{ hardwareKey: lead.hardwareKey, score }] : [];
  });
  const caseId = matches[0]?.score.caseId;
  return (
    <FloatingTooltip
      role="status"
      x={active.x}
      y={active.y}
      className="w-64 text-xs"
      data-testid="video-quality-guide-psnr-tooltip"
    >
      {caseId && <p className="font-mono font-semibold text-foreground">{caseId}</p>}
      <p className="mt-0.5 line-clamp-3 text-muted-foreground">{active.prompt}</p>
      <dl className="mt-2 grid grid-cols-[auto_auto] justify-start gap-x-4 gap-y-0.5">
        {matches.map(({ hardwareKey, score }) => (
          <Fragment key={hardwareKey}>
            <dt
              style={hueStyle(hardwareKey)}
              className={cn(HUE_CLASS, 'font-semibold text-(--hw)')}
            >
              {hardwareLabel(hardwareKey)}
            </dt>
            <dd className="m-0 font-mono text-foreground tabular-nums">
              {clipScoreLabel(score.psnrDb)} dB
            </dd>
          </Fragment>
        ))}
      </dl>
    </FloatingTooltip>
  );
}

/** The stat tiles and the full score table, both computed from the published scores. */
function Scores({
  locale,
  hardware,
}: {
  locale: WidgetProps['locale'];
  hardware: NonNullable<ReferencePsnrEvidence['hardware']>;
}) {
  const t = STRINGS[locale];
  const all = hardware.flatMap((lead) => lead.scores);
  const values = all.map((score) => score.psnrDb);
  const prompts = [...new Set(all.map((score) => score.prompt))]
    .map((prompt) => {
      const row = hardware.map((lead) => lead.scores.find((score) => score.prompt === prompt));
      return {
        prompt,
        caseId: row.find(Boolean)?.caseId ?? null,
        row,
        mean: d3.mean(row, (score) => score?.psnrDb) ?? 0,
      };
    })
    .toSorted((a, b) => a.mean - b.mean);

  return (
    <>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        {hardware.map((lead) => (
          <Stat
            key={lead.hardwareKey}
            boxed
            valueFirst
            size="lg"
            style={hueStyle(lead.hardwareKey)}
            className={HUE_CLASS}
            valueClassName="text-(--hw)"
            label={t.below(hardwareLabel(lead.hardwareKey), EXAMPLE_BAND.to)}
            value={`${lead.scores.filter((score) => score.psnrDb < EXAMPLE_BAND.to).length} / ${lead.scores.length}`}
          />
        ))}
        <Stat
          boxed
          valueFirst
          size="lg"
          label={t.spread}
          value={`${scoreLabel(Math.max(...values) - Math.min(...values))} dB`}
        />
      </dl>
      <details
        className="group/scores mt-4 rounded-lg border border-border/40"
        onToggle={(event) => {
          if (event.currentTarget.open) track('video_quality_guide_scores_opened');
        }}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          {t.table(all.length)}
        </summary>
        <div className="max-h-96 overflow-auto border-t border-border/40">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {t.prompt}
                </th>
                {hardware.map((lead) => (
                  <th
                    key={lead.hardwareKey}
                    scope="col"
                    className="px-3 py-2 text-right font-medium"
                  >
                    {hardwareLabel(lead.hardwareKey)} (dB)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prompts.map(({ prompt, caseId, row }) => (
                <tr key={prompt} className="border-t border-border/30">
                  <th
                    scope="row"
                    title={prompt}
                    className="max-w-48 truncate px-3 py-1.5 text-left font-mono font-normal"
                  >
                    {caseId ?? prompt}
                  </th>
                  {row.map((score, index) => (
                    <td
                      key={hardware[index].hardwareKey}
                      className={cn(
                        'px-3 py-1.5 text-right font-mono tabular-nums',
                        score && score.psnrDb < EXAMPLE_BAND.to && 'text-warning',
                      )}
                    >
                      {score ? clipScoreLabel(score.psnrDb) : '–'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
