'use client';

import { RotateCcw } from 'lucide-react';
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/components/inference/replay/useReducedMotion';
import { Button } from '@/components/ui/button';
import { rangeTickAnchorClass } from '@/components/ui/range-ticks';
import { Stat } from '@/components/ui/stat';
import { track } from '@/lib/analytics/analytics';
import { cn } from '@/lib/shared/utils';

import {
  type Caption,
  carryDistance,
  CONTEXT_CAP,
  DISPLAY_ROWS,
  type Frame,
  frameAt,
  LEAD_OUT_MS,
  nextChange,
  REPLAY,
  REPLAY_ROWS,
  type ReplayRow,
  REST_FRAME,
  TIMELINE,
  WARM_PREFIX,
} from './agentx-session-replay-model';
import { SEG } from './trace-flamegraph';

type Locale = 'en' | 'zh';

const TICKS = [64_000, 128_000, 192_000, 256_000];

/** The replay first plays once this share of the rows is on screen. */
const START_RATIO = 0.5;

function tokens(n: number): string {
  return n >= 1000 ? `${Number((n / 1000).toFixed(1))}k` : String(n);
}

/** Shown in place of a number whose bar segment has not started yet. */
const PENDING = '–';

function requestNumber(n: number): string {
  return String(n).padStart(2, '0');
}

const STRINGS = {
  en: {
    eyebrow: 'Session replay',
    replay: 'Replay',
    request: (range: string, total: number) => `Request ${range} / ${total}`,
    main: 'main',
    sub: (n: number) => `sub ${n}`,
    captions: {
      warmStart: `Replay joins mid-session. Warmup already holds the ${tokens(WARM_PREFIX)}-token prefix in KV cache.`,
      fanOut: 'Three subagents start in parallel with empty KV caches and prefill from scratch.',
      subagentsReturn: 'Subagent reports return to the main agent as new input.',
      mainTurns: 'Later turns reuse earlier context from KV cache and prefill only the new input.',
    } satisfies Record<Caption, string>,
    stats: {
      cached: 'From KV cache',
      fresh: 'Prefilled',
      output: 'Decoded',
      hit: 'Session cache hit',
    },
    legend: { cached: 'Cached prefix', fresh: 'Uncached input', output: 'Output' },
    axis: 'Context tokens per request',
    footnote:
      'Illustrative 20-request session sized to the AgentX v1.0 trace profile: 142k median input and 444 median output tokens per request. Subagents appear in 44% of v1.0 sessions.',
  },
  zh: {
    eyebrow: '会话回放',
    replay: '重新播放',
    request: (range: string, total: number) => `请求 ${range} / ${total}`,
    main: '主',
    sub: (n: number) => `子 ${n}`,
    captions: {
      warmStart: `回放从会话中途开始。warmup 已将 ${tokens(WARM_PREFIX)} token 的 prefix 写入 KV cache。`,
      fanOut: '三个 subagent 并行启动。它们的 KV cache 为空，prompt 需要从头 prefill。',
      subagentsReturn: 'subagent 的结果作为新 input 返回 main agent。',
      mainTurns: '后续轮次从 KV cache 复用此前的上下文，只 prefill 新增的 input。',
    } satisfies Record<Caption, string>,
    stats: {
      cached: '来自 KV cache',
      fresh: '已 prefill',
      output: '已 decode',
      hit: '会话 cache 命中率',
    },
    legend: { cached: '缓存前缀', fresh: '未缓存输入', output: '输出' },
    axis: '单请求 context token 数',
    footnote:
      '示意会话共 20 个请求，规模按 AgentX v1.0 trace 概况设定：单请求 input token 数中位数为 142k，output token 数中位数为 444。v1.0 数据集中 44% 的会话包含 subagent。',
  },
} as const;

function pct(n: number): string {
  return `${(n / CONTEXT_CAP) * 100}%`;
}

/** The delay and length of one segment's animation, read by the rules in `motion.css`. */
function motion(at: number, until: number, carry?: number): CSSProperties {
  return {
    '--replay-at': `${at - LEAD_OUT_MS}ms`,
    '--replay-ms': `${until - at}ms`,
    ...(carry === undefined ? null : { '--replay-carry': carry }),
  } as CSSProperties;
}

/** Each drawn row with how far above it the bar it inherits sits (see `carryDistance`). */
const ROWS = DISPLAY_ROWS.map((row, index) => ({
  row,
  carry: carryDistance(DISPLAY_ROWS, index),
  /** A subagent's later request: drawn under its first without repeating the label. */
  continues: row.lane !== null && DISPLAY_ROWS[index - 1]?.lane === row.lane,
}));

function Row({
  row,
  carry,
  label,
  frame,
}: {
  row: ReplayRow;
  carry: number;
  label: string;
  frame: Frame;
}) {
  const playing = frame.phase === 'play';
  const timing = TIMELINE[row.step];
  const { pace } = REPLAY[row.step];
  return (
    <li
      className="agentx-replay-row flex items-center gap-2"
      data-testid="agentx-session-replay-row"
    >
      <span
        className={cn(
          'agentx-replay-label min-w-12 shrink-0 whitespace-nowrap text-right text-xs tabular-nums',
          playing && row.step === frame.step
            ? 'font-semibold text-foreground'
            : 'text-muted-foreground',
          playing && row.step > frame.step && 'opacity-60',
        )}
      >
        {label}
      </span>
      <div className="agentx-replay-track relative flex flex-1">
        <span
          className="agentx-replay-slot absolute inset-0 bg-foreground/5"
          style={motion(timing.start, timing.start + 150)}
        />
        <span
          className="agentx-replay-cached agentx-replay-carry relative h-full shrink-0"
          style={{
            width: pct(row.cached),
            backgroundColor: SEG.cached,
            ...motion(timing.start, timing.prefill, carry),
          }}
        />
        <span
          className="agentx-replay-grow relative h-full shrink-0"
          style={{
            width: pct(row.fresh),
            minWidth: 2,
            backgroundColor: SEG.uncached,
            ...motion(timing.prefill, timing.prefill + pace.prefill),
          }}
        />
        <span
          className="agentx-replay-grow relative h-full shrink-0"
          style={{
            width: pct(row.output),
            minWidth: 2,
            backgroundColor: SEG.output,
            ...motion(timing.decode, timing.decode + pace.decode),
          }}
        />
      </div>
    </li>
  );
}

export function AgentXSessionReplay({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  const reducedMotion = useReducedMotion();
  const rowsRef = useRef<HTMLOListElement>(null);
  const [frame, setFrame] = useState<Frame>(REST_FRAME);
  const [paused, setPaused] = useState(false);
  const control = useRef<{ start: () => void; seek: () => void } | null>(null);

  useEffect(() => {
    const rows = rowsRef.current;
    if (reducedMotion || !rows) return undefined;

    // One clock: `elapsed` is how much of the replay has been shown, and `since` is when it
    // last started running (null while it is stopped).
    let elapsed = 0;
    let since: number | null = null;
    let active = false;
    let played = false;
    let offscreen = false;
    let timer: number | undefined;

    const now = () => (since === null ? elapsed : elapsed + performance.now() - since);
    const tick = () => {
      const time = now();
      const next = nextChange(time);
      setFrame(frameAt(time));
      if (next === null) {
        active = false;
        since = null;
        elapsed = 0;
        return;
      }
      timer = window.setTimeout(tick, next - time);
    };
    // Runs the clock only while a replay is under way and the reader can see it.
    const update = () => {
      const run = active && !offscreen && document.visibilityState !== 'hidden';
      if (run && since === null) {
        since = performance.now();
        tick();
      } else if (!run && since !== null) {
        elapsed = now();
        since = null;
        window.clearTimeout(timer);
      }
      setPaused(active && !run);
    };

    control.current = {
      start: () => {
        window.clearTimeout(timer);
        played = true;
        active = true;
        elapsed = 0;
        since = null;
        update();
      },
      // The bars are CSS animations that all began when drawing began, so setting their
      // time to the clock's keeps them on it across a pause.
      seek: () => {
        const time = now() - LEAD_OUT_MS;
        if (time < 0 || typeof rows.getAnimations !== 'function') return;
        for (const animation of rows.getAnimations({ subtree: true })) {
          animation.currentTime = time;
        }
      },
    };

    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              // Several threshold crossings can arrive at once; the last is the current state.
              const entry = entries.at(-1);
              if (!entry) return;
              offscreen = !entry.isIntersecting;
              if (!played && entry.intersectionRatio >= START_RATIO) control.current?.start();
              else update();
            },
            { threshold: [0, START_RATIO] },
          );
    observer?.observe(rows);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
      window.clearTimeout(timer);
      control.current = null;
      setFrame(REST_FRAME);
      setPaused(false);
    };
  }, [reducedMotion]);

  useLayoutEffect(() => {
    control.current?.seek();
  }, [frame.phase, paused]);

  const step = REPLAY[frame.step];
  const firstIndex = REPLAY_ROWS.indexOf(step.rows[0]) + 1;
  const lastIndex = firstIndex + step.rows.length - 1;
  const range =
    firstIndex === lastIndex
      ? requestNumber(firstIndex)
      : `${requestNumber(firstIndex)}–${requestNumber(lastIndex)}`;

  const stats = [
    { key: 'cached', label: t.stats.cached, value: tokens(frame.cached), color: SEG.cached },
    {
      key: 'fresh',
      label: t.stats.fresh,
      value: frame.fresh === null ? PENDING : tokens(frame.fresh),
      color: SEG.uncached,
    },
    {
      key: 'output',
      label: t.stats.output,
      value: frame.output === null ? PENDING : tokens(frame.output),
      color: SEG.output,
    },
    {
      key: 'hit',
      label: t.stats.hit,
      value: frame.hit === null ? PENDING : `${(frame.hit * 100).toFixed(1)}%`,
      color: null,
    },
  ];

  return (
    <figure
      className="agentx-replay border-b border-border/20 px-5 py-5 sm:px-6"
      data-testid="agentx-session-replay"
      data-replay={frame.phase}
      data-replay-paused={paused ? '' : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium text-muted-foreground">{t.eyebrow}</p>
          {reducedMotion ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t.replay}
              title={t.replay}
              data-testid="agentx-session-replay-restart"
              className={cn(
                '-my-3.5 text-muted-foreground md:-my-2',
                frame.phase !== 'rest' && 'invisible',
              )}
              onClick={() => {
                track('agentx_replay_restarted');
                control.current?.start();
              }}
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums font-medium">
          {t.request(range, REPLAY_ROWS.length)}
        </p>
      </div>
      <p className="agentx-replay-caption mt-2 min-h-10 text-sm leading-5 text-foreground sm:min-h-5">
        {t.captions[frame.caption]}
      </p>

      <p className="agentx-replay-axis mt-3 ml-14 text-xs text-muted-foreground" aria-hidden="true">
        {t.axis}
      </p>
      <div className="relative mt-0.5" aria-hidden="true">
        <div className="pointer-events-none absolute inset-y-0 right-0 left-14">
          {TICKS.map((tick) => (
            <span
              key={tick}
              className="absolute inset-y-0 border-l border-border/20"
              style={{ left: pct(tick) }}
            />
          ))}
        </div>
        <div className="relative mb-1 ml-14 h-4 text-xs text-muted-foreground tabular-nums">
          {[0, ...TICKS].map((tick, index) => (
            <span
              key={tick}
              className={`absolute top-0 ${rangeTickAnchorClass(index, TICKS.length + 1)}`}
              style={{ left: pct(tick) }}
            >
              {tokens(tick)}
            </span>
          ))}
        </div>
        <ol ref={rowsRef} className="agentx-replay-rows relative">
          {ROWS.map(({ row, carry, continues }, index) => (
            <Row
              key={index}
              row={row}
              carry={carry}
              frame={frame}
              label={row.lane === null ? t.main : continues ? '' : t.sub(row.lane + 1)}
            />
          ))}
        </ol>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border/20 pt-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <Stat
            key={stat.key}
            valueFirst
            valueClassName="pl-3.5"
            value={stat.value}
            label={
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn('size-2 shrink-0', stat.key === 'cached' && 'agentx-replay-cached')}
                  style={stat.color ? { backgroundColor: stat.color } : undefined}
                />
                {stat.label}
              </span>
            }
          />
        ))}
      </dl>

      <figcaption className="mt-3 text-xs leading-5 text-muted-foreground">{t.footnote}</figcaption>
    </figure>
  );
}
