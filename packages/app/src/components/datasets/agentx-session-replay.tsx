'use client';

import { RotateCcw } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/components/inference/replay/useReducedMotion';
import { Button } from '@/components/ui/button';
import { rangeTickAnchorClass } from '@/components/ui/range-ticks';
import { Stat } from '@/components/ui/stat';
import { track } from '@/lib/analytics/analytics';
import { cn } from '@/lib/shared/utils';

import {
  CONTEXT_CAP,
  DISPLAY_ROWS,
  type Frame,
  frameAt,
  LEAD_OUT_MS,
  nextChange,
  NOTES,
  REPLAY,
  REPLAY_ROWS,
  REST_FRAME,
  type StepNote,
  TIMELINE,
  WARM_PREFIX,
} from './agentx-session-replay-model';
import { SEG } from './trace-flamegraph';

type Locale = 'en' | 'zh';

const TICKS = [64_000, 128_000, 192_000, 256_000];

function tokens(n: number): string {
  return n >= 1000 ? `${Number((n / 1000).toFixed(1))}k` : String(n);
}

function requestNumber(n: number): string {
  return String(n).padStart(2, '0');
}

const STRINGS = {
  en: {
    eyebrow: 'Session Replay',
    replay: 'Replay',
    request: (range: string, total: number) => `Request ${range} / ${total}`,
    main: 'main',
    sub: (n: number) => `sub ${n}`,
    notes: {
      warmStart: `Replay joins mid-session. Warmup already holds the ${tokens(WARM_PREFIX)}-token prefix in KV cache.`,
      fanOut: 'Three subagents start in parallel with empty KV caches and prefill from scratch.',
      subagentsReturn: 'Subagent reports return to the main agent as new input.',
      mainTurns: 'Later turns reuse earlier context from KV cache and prefill only the new input.',
    } satisfies Record<StepNote, string>,
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
    notes: {
      warmStart: `回放从会话中途开始。warmup 已将 ${tokens(WARM_PREFIX)} token 的 prefix 写入 KV cache。`,
      fanOut: '三个 subagent 并行启动。它们的 KV cache 为空，prompt 需要从头 prefill。',
      subagentsReturn: 'subagent 的结果作为新 input 返回 main agent。',
      mainTurns: '后续轮次从 KV cache 复用此前的上下文，只 prefill 新增的 input。',
    } satisfies Record<StepNote, string>,
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

/** When a segment's animation starts and how long it runs, read by the rules in `motion.css`. */
function timing(at: number, ms: number, carry = 0): CSSProperties {
  return { '--at': `${at - LEAD_OUT_MS}ms`, '--ms': `${ms}ms`, '--carry': carry } as CSSProperties;
}

function Segment({
  value,
  color,
  className,
  minPx = 0,
  motion,
}: {
  value: number;
  color: string;
  className?: string;
  minPx?: number;
  motion: CSSProperties;
}) {
  return (
    <span
      className={cn('relative h-full shrink-0', className)}
      style={{
        ...motion,
        width: pct(value),
        minWidth: value > 0 ? minPx : 0,
        backgroundColor: color,
      }}
    />
  );
}

function Row({
  row,
  frame,
  label,
}: {
  row: (typeof DISPLAY_ROWS)[number];
  frame: Frame;
  label: string;
}) {
  const { start, prefill, decode, drawn } = TIMELINE[row.step];
  const playing = frame.phase === 'play';
  const active = playing && row.step === frame.step;
  return (
    <li className="flex h-(--row) items-center gap-2" data-testid="agentx-session-replay-row">
      <span
        className={cn(
          'min-w-12 shrink-0 whitespace-nowrap text-right text-xs leading-(--row) tabular-nums short:text-2xs',
          active ? 'font-semibold text-foreground' : 'text-muted-foreground',
          playing && row.step > frame.step ? 'opacity-60' : 'opacity-100',
        )}
      >
        {label}
      </span>
      <div className="relative flex h-[calc(var(--row)-0.25rem)] flex-1">
        <span
          className="replay-slot absolute inset-0 bg-foreground/5 opacity-0"
          style={timing(start, 150)}
        />
        <Segment
          value={row.cached}
          color={SEG.cached}
          className="replay-carry opacity-40"
          motion={timing(start, prefill - start, row.carry)}
        />
        <Segment
          value={row.fresh}
          color={SEG.uncached}
          minPx={2}
          className="replay-grow"
          motion={timing(prefill, decode - prefill)}
        />
        <Segment
          value={row.output}
          color={SEG.output}
          minPx={3}
          className="replay-grow"
          motion={timing(decode, drawn - decode)}
        />
      </div>
    </li>
  );
}

export function AgentXSessionReplay({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLOListElement>(null);
  const start = useRef<() => void>(undefined);
  const [frame, setFrame] = useState<Frame>(REST_FRAME);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (reducedMotion || !node || typeof IntersectionObserver === 'undefined') return undefined;
    // One clock: `elapsed` is how much of the replay has been shown and `since` is when it last
    // started running (null while it is stopped).
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
      } else {
        timer = window.setTimeout(tick, next - time);
      }
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
        clearTimeout(timer);
      }
      setPaused(active && !run);
    };
    start.current = () => {
      clearTimeout(timer);
      played = true;
      active = true;
      elapsed = 0;
      since = null;
      update();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        offscreen = !entry.isIntersecting;
        // First plays once half of the rows are on screen.
        if (!played && entry.intersectionRatio >= 0.5) start.current?.();
        else update();
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(node);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      clearTimeout(timer);
      setFrame(REST_FRAME);
      setPaused(false);
    };
  }, [reducedMotion]);

  const step = REPLAY[frame.step];
  const firstIndex = REPLAY_ROWS.indexOf(step.rows[0]) + 1;
  const lastIndex = firstIndex + step.rows.length - 1;
  const range =
    firstIndex === lastIndex
      ? requestNumber(firstIndex)
      : `${requestNumber(firstIndex)}–${requestNumber(lastIndex)}`;
  const shown = (n: number | null) => (n === null ? '–' : tokens(n));

  const stats = [
    { key: 'cached', label: t.stats.cached, value: tokens(frame.cached), color: SEG.cached },
    { key: 'fresh', label: t.stats.fresh, value: shown(frame.fresh), color: SEG.uncached },
    { key: 'output', label: t.stats.output, value: shown(frame.output), color: SEG.output },
    {
      key: 'hit',
      label: t.stats.hit,
      value: frame.hit === null ? '–' : `${(frame.hit * 100).toFixed(1)}%`,
      color: null,
    },
  ];

  return (
    <figure
      className="border-b border-border/20 px-5 py-5 sm:px-6"
      data-testid="agentx-session-replay"
      data-replay={frame.phase}
      data-replay-paused={paused ? '' : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {t.eyebrow}
          {reducedMotion ? null : (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t.replay}
              data-testid="agentx-session-replay-restart"
              className={cn('-my-3.5 md:-my-2', frame.phase !== 'rest' && 'invisible')}
              onClick={() => {
                track('agentx_replay_restarted');
                start.current?.();
              }}
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          )}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums font-medium">
          {t.request(range, REPLAY_ROWS.length)}
        </p>
      </div>
      <p className="mt-2 min-h-10 text-sm leading-5 text-foreground short:mt-1 sm:min-h-5">
        {t.notes[NOTES[frame.step]]}
      </p>

      <p className="mt-3 ml-14 text-xs text-muted-foreground short:mt-1.5" aria-hidden="true">
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
        <ol ref={ref} className="replay-rows relative [--row:0.875rem] short:[--row:0.625rem]">
          {DISPLAY_ROWS.map((row, index) => (
            <Row
              key={index}
              row={row}
              frame={frame}
              // A subagent's second request sits under its first, without repeating the label.
              label={row.lane === null ? t.main : row.carry ? '' : t.sub(row.lane + 1)}
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
                  className={cn('size-2 shrink-0', stat.key === 'cached' && 'opacity-40')}
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
