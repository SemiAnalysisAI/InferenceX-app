'use client';

import { useEffect, useRef, useState } from 'react';

import type { Locale } from '@/lib/i18n/i18n';
import { calendarStepAtFraction, fractionAtDateIndex } from './replayFrameData';

const STRINGS = {
  en: {
    timeline: 'Benchmark date timeline',
    snapshot: 'Observed snapshot',
    transition: 'Illustrative transition',
    note: 'Between snapshots, motion is interpolated, not measured. Unchanged configurations carry forward.',
  },
  zh: {
    timeline: '基准测试日期时间轴',
    snapshot: '实测快照',
    transition: '插值过渡动画',
    note: '快照之间的动画由插值生成，并非实测结果。未更新的配置沿用此前结果。',
  },
} as const;

function replayDateLabel(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Export-visible rail; native controls remain separate from the captured artwork. */
export default function ReplayDateTimeline({
  dates,
  fraction,
  locale,
}: {
  dates: readonly string[];
  fraction: number;
  locale: Locale;
}) {
  const t = STRINGS[locale];
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  if (dates.length === 0) return null;
  const step = calendarStepAtFraction(dates, fraction);
  const index = Math.floor(step);
  const transitioning = step - index > 1e-9;
  // Reserve the endpoints, then admit only labels with enough physical room.
  const labelIndices = new Set([0, dates.length - 1]);
  let lastPosition = 0;
  for (let i = 1; i < dates.length - 1; i++) {
    const position = fractionAtDateIndex(dates, i) * width;
    if (position - lastPosition >= 84 && width - position >= 84) {
      labelIndices.add(i);
      lastPosition = position;
    }
  }

  return (
    <div
      ref={ref}
      className="mt-4 px-1"
      data-testid="replay-date-timeline"
      role="group"
      aria-label={t.timeline}
    >
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <span className="text-xs font-medium" data-testid="replay-snapshot-status">
          {transitioning ? t.transition : t.snapshot}
        </span>
        <span className="text-xs tabular-nums">
          {dates[index]}
          {transitioning ? ` → ${dates[Math.min(index + 1, dates.length - 1)]}` : ''}
        </span>
      </div>
      <div className="relative h-12" aria-hidden="true">
        <div className="absolute inset-x-0 top-1 h-px bg-border" />
        <div
          className="absolute left-0 top-1 h-0.5 bg-foreground"
          style={{ width: `${fraction * 100}%` }}
          data-testid="replay-date-progress"
        />
        {dates.map((date, i) => {
          const position = fractionAtDateIndex(dates, i);
          return (
            <div
              key={date}
              className="absolute top-0"
              style={{ left: `${position * 100}%` }}
              data-date={date}
              data-testid="replay-date-tick"
            >
              <span className="block h-2 w-px bg-foreground" />
              {labelIndices.has(i) && (
                <span
                  className="absolute top-4 whitespace-nowrap text-xs tabular-nums"
                  style={{
                    transform:
                      i === 0
                        ? undefined
                        : i === dates.length - 1
                          ? 'translateX(-100%)'
                          : 'translateX(-50%)',
                  }}
                >
                  {replayDateLabel(date, locale)}
                </span>
              )}
            </div>
          );
        })}
        <span
          className="absolute top-0 size-2.5 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-background"
          style={{ left: `${fraction * 100}%` }}
          data-testid="replay-date-playhead"
        />
      </div>
      <p className="text-xs text-muted-foreground">{t.note}</p>
    </div>
  );
}
