'use client';

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/components/inference/replay/useReducedMotion';
import { Stat } from '@/components/ui/stat';
import { cn } from '@/lib/shared/utils';

import {
  CONTEXT_CAP,
  FIRST_FRAME,
  type Frame,
  frameDuration,
  LAST_FRAME,
  nextFrame,
  REPLAY,
  REPLAY_ROWS,
  type ReplayRow,
  sessionCacheHit,
  type StepNote,
  visibleTokens,
  WARM_PREFIX,
} from './agentx-session-replay-model';
import { SEG } from './trace-flamegraph';

type Locale = 'en' | 'zh';

const TICKS = [64_000, 128_000, 192_000, 256_000];
const CACHED_FILL = 'bg-[#059669] dark:bg-[#10b981]/70';

function tokens(n: number): string {
  return n >= 1000 ? `${Number((n / 1000).toFixed(1))}k` : String(n);
}

function requestNumber(n: number): string {
  return String(n).padStart(2, '0');
}

const STRINGS = {
  en: {
    eyebrow: 'Session replay',
    request: (range: string, total: number) => `Request ${range} / ${total}`,
    context: (n: number) => `context ${tokens(n)}`,
    main: 'main',
    sub: (n: number) => `sub ${n}`,
    notes: {
      warmStart: `Replay joins mid-session. Warmup already holds the ${tokens(WARM_PREFIX)}-token prefix in KV cache.`,
      fanOut:
        'Three subagents start in parallel with an empty KV cache, so each prompt prefills from scratch.',
      subagentsReturn:
        'Subagent reports return to the main agent as new input after its cached prefix.',
    } satisfies Record<StepNote, string>,
    phases: {
      cached: (n: number) => `${tokens(n)} tokens served from KV cache`,
      prefill: (n: number) => `Prefilling ${tokens(n)} new tokens`,
      decode: (n: number) => `Decoding ${tokens(n)} output tokens`,
    },
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
    request: (range: string, total: number) => `请求 ${range} / ${total}`,
    context: (n: number) => `上下文 ${tokens(n)}`,
    main: '主',
    sub: (n: number) => `子 ${n}`,
    notes: {
      warmStart: `回放从会话中途开始。warmup 已将 ${tokens(WARM_PREFIX)} token 的 prefix 写入 KV cache。`,
      fanOut: '三个 subagent 并行启动。它们的 KV cache 为空，prompt 需要从头 prefill。',
      subagentsReturn: 'subagent 的结果作为新 input 返回 main agent，接在已缓存的 prefix 之后。',
    } satisfies Record<StepNote, string>,
    phases: {
      cached: (n: number) => `${tokens(n)} token 来自 KV cache`,
      prefill: (n: number) => `正在 prefill ${tokens(n)} 个新 token`,
      decode: (n: number) => `正在 decode ${tokens(n)} 个 output token`,
    },
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

function Segment({
  value,
  color,
  className,
  minPx = 0,
}: {
  value: number;
  color?: string;
  className?: string;
  minPx?: number;
}) {
  return (
    <span
      className={cn('h-full shrink-0', className)}
      style={{ width: pct(value), minWidth: value > 0 ? minPx : 0, backgroundColor: color }}
    />
  );
}

function Row({ row, frame, label }: { row: ReplayRow; frame: Frame; label: string }) {
  const shown = visibleTokens(row, frame);
  const active = row.step === frame.step;
  return (
    <li className="flex h-3.5 items-center gap-2" data-testid="agentx-session-replay-row">
      <span
        className={cn(
          'min-w-12 shrink-0 whitespace-nowrap text-right text-xs leading-3.5 tabular-nums',
          active ? 'font-semibold text-foreground' : 'text-muted-foreground',
          shown ? 'opacity-100' : 'opacity-60',
        )}
      >
        {label}
      </span>
      <div className={cn('flex h-2.5 flex-1', !shown && 'bg-foreground/5')}>
        <Segment value={shown?.cached ?? 0} className={CACHED_FILL} />
        <Segment
          value={shown?.fresh ?? 0}
          color={SEG.uncached}
          minPx={2}
          className={cn(
            active && 'transition-[width] duration-600 ease-out motion-reduce:transition-none',
          )}
        />
        <Segment
          value={shown?.output ?? 0}
          color={SEG.output}
          minPx={3}
          className={cn(
            active && 'transition-[width] duration-450 ease-out motion-reduce:transition-none',
          )}
        />
      </div>
    </li>
  );
}

export function AgentXSessionReplay({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [frame, setFrame] = useState<Frame>(LAST_FRAME);

  useEffect(() => {
    const node = ref.current;
    if (reducedMotion || !node || typeof IntersectionObserver === 'undefined') {
      setFrame(LAST_FRAME);
      return undefined;
    }
    let current = FIRST_FRAME;
    let timer: number | undefined;
    const advance = () => {
      current = nextFrame(current);
      setFrame(current);
      timer = window.setTimeout(advance, frameDuration(current));
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (entry?.isIntersecting) timer = window.setTimeout(advance, frameDuration(current));
      },
      { threshold: 0.3 },
    );
    setFrame(current);
    observer.observe(node);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [reducedMotion]);

  const step = REPLAY[frame.step];
  const firstIndex = REPLAY_ROWS.indexOf(step.rows[0]) + 1;
  const lastIndex = firstIndex + step.rows.length - 1;
  const range =
    firstIndex === lastIndex
      ? requestNumber(firstIndex)
      : `${requestNumber(firstIndex)}–${requestNumber(lastIndex)}`;
  const totals = step.rows.reduce(
    (sum, row) => ({
      cached: sum.cached + row.cached,
      fresh: sum.fresh + row.fresh,
      output: sum.output + row.output,
    }),
    { cached: 0, fresh: 0, output: 0 },
  );
  const mainRow = step.rows[0].lane === null ? step.rows[0] : null;
  const caption = step.note
    ? t.notes[step.note]
    : frame.phase === 'cached'
      ? t.phases.cached(totals.cached)
      : frame.phase === 'prefill'
        ? t.phases.prefill(totals.fresh)
        : t.phases.decode(totals.output);

  const stats = [
    { key: 'cached', label: t.stats.cached, value: tokens(totals.cached), color: SEG.cached },
    { key: 'fresh', label: t.stats.fresh, value: tokens(totals.fresh), color: SEG.uncached },
    { key: 'output', label: t.stats.output, value: tokens(totals.output), color: SEG.output },
    {
      key: 'hit',
      label: t.stats.hit,
      value: `${(sessionCacheHit(REPLAY_ROWS, frame.step) * 100).toFixed(1)}%`,
      color: null,
    },
  ];

  return (
    <figure
      ref={ref}
      className="border-b border-border/20 px-5 py-5 sm:px-6"
      data-testid="agentx-session-replay"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-medium text-muted-foreground">{t.eyebrow}</p>
        <p className="text-xs text-muted-foreground tabular-nums font-medium">
          {t.request(range, REPLAY_ROWS.length)}
          {mainRow ? ` · ${t.context(mainRow.cached + mainRow.fresh)}` : null}
        </p>
      </div>
      <p className="mt-2 min-h-10 text-sm leading-5 text-foreground sm:min-h-5">{caption}</p>

      <p className="mt-3 ml-14 text-xs text-muted-foreground" aria-hidden="true">
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
          {TICKS.map((tick) => (
            <span
              key={tick}
              className="absolute top-0 -translate-x-full pr-1"
              style={{ left: pct(tick) }}
            >
              {tokens(tick)}
            </span>
          ))}
        </div>
        <ol className="relative">
          {REPLAY_ROWS.map((row, index) => (
            <Row
              key={index}
              row={row}
              frame={frame}
              label={row.lane === null ? t.main : t.sub(row.lane + 1)}
            />
          ))}
        </ol>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border/20 pt-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <Stat
            key={stat.key}
            valueFirst
            value={stat.value}
            label={
              <span className="inline-flex items-center gap-1.5">
                {stat.color ? (
                  <span
                    aria-hidden="true"
                    className={cn('size-2 shrink-0', stat.key === 'cached' && CACHED_FILL)}
                    style={stat.key === 'cached' ? undefined : { backgroundColor: stat.color }}
                  />
                ) : null}
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
