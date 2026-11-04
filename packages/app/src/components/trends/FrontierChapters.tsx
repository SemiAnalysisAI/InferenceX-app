'use client';

import React, { useMemo, useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

import type { FrontierSeriesStyle } from './FrontierChart';
import { shortImage, type FrontierChapter } from './frontier-history-core';

const STRINGS = {
  en: {
    enters: (driver: string) => `${driver} enters`,
    newConfig: (driver: string, configs: string) => `${driver}: new config ${configs}`,
    update: (config: string, from: string, to: string) =>
      `${config}: software update ${from} → ${to}`,
    rerun: (driver: string, grew: boolean) =>
      `${driver}: re-run ${grew ? 'improved' : 'regressed'}`,
    regression: (driver: string, config: string) => `${driver}: ${config} regressed`,
    regressionImage: (config: string, from: string, to: string) =>
      `${config} regressed on ${to} (was ${from})`,
    ground: (percent: string) => `${percent} ground covered`,
    peak: (grew: boolean, ratio: string, x: number, unit: string) =>
      `${grew ? 'up to' : 'down to'} ${ratio} at ${x} ${unit}`,
    unknown: 'unknown',
  },
  zh: {
    enters: (driver: string) => `${driver} 首次出现`,
    newConfig: (driver: string, configs: string) => `${driver}：新配置 ${configs}`,
    update: (config: string, from: string, to: string) => `${config}：软件更新 ${from} → ${to}`,
    rerun: (driver: string, grew: boolean) => `${driver}：重新测试后${grew ? '提升' : '下降'}`,
    regression: (driver: string, config: string) => `${driver}：${config} 性能下降`,
    regressionImage: (config: string, from: string, to: string) =>
      `${config} 换用 ${to} 后性能下降（此前为 ${from}）`,
    ground: (percent: string) => `覆盖面积 ${percent}`,
    peak: (grew: boolean, ratio: string, x: number, unit: string) =>
      `${x} ${unit} 处${grew ? '最高达' : '降至'} ${ratio}`,
    unknown: '未知',
  },
} as const;

interface ChapterProps {
  chapters: readonly FrontierChapter[];
  dates: readonly string[];
  dateIndex: number;
  styles: ReadonlyMap<string, FrontierSeriesStyle>;
  configLabel: (config: string) => string;
  /** Interactivity unit, e.g. tok/s/user. */
  unit: string;
  formatDate: (date: string) => string;
  onSeek: (index: number) => void;
}

function useChapterText(props: Pick<ChapterProps, 'styles' | 'configLabel' | 'unit'>) {
  const locale = useLocale();
  const t = STRINGS[locale];
  return useMemo(() => {
    const label = (key: string) => props.styles.get(key)?.label ?? key;
    const title = (chapter: FrontierChapter) => {
      const driver = label(chapter.driver);
      const grew = chapter.change === null || chapter.change > 1;
      switch (chapter.cause) {
        case 'new-series': {
          return t.enters(driver);
        }
        case 'new-config': {
          return t.newConfig(driver, chapter.configs.map(props.configLabel).join(', '));
        }
        case 'software-update': {
          return t.update(
            props.configLabel(chapter.configs[0]),
            shortImage(chapter.image?.from ?? null, t.unknown),
            shortImage(chapter.image?.to ?? null, t.unknown),
          );
        }
        case 'regression': {
          const config = props.configLabel(chapter.configs[0] ?? chapter.driver);
          return chapter.image
            ? t.regressionImage(
                config,
                shortImage(chapter.image.from, t.unknown),
                shortImage(chapter.image.to, t.unknown),
              )
            : t.regression(driver, config);
        }
        case 'rerun': {
          return t.rerun(driver, grew);
        }
      }
    };
    const detail = (chapter: FrontierChapter) => {
      const parts: string[] = [];
      if (chapter.change !== null) {
        const percent = Math.round((chapter.change - 1) * 100);
        parts.push(t.ground(`${percent > 0 ? '+' : '−'}${Math.abs(percent)}%`));
      }
      if (chapter.peak) {
        const { ratio, x } = chapter.peak;
        parts.push(
          t.peak(ratio > 1, `${ratio.toFixed(ratio >= 10 ? 0 : 2)}x`, Math.round(x), props.unit),
        );
      }
      return parts.join(' · ');
    };
    return { title, detail };
  }, [t, props.styles, props.configLabel, props.unit]);
}

/** Slider thumb diameter; the chapter track is inset by its radius to match the thumb's travel. */
const THUMB_PX = 16;

/**
 * The date slider, drawn like video chapters: its track is split at each frontier step and
 * colored by the series that caused it, filled up to the current date. Hovering names the
 * chapter under the pointer; the native range input keeps keyboard and pointer control.
 */
export function FrontierTimeline({
  chapters,
  dates,
  dateIndex,
  styles,
  configLabel,
  unit,
  formatDate,
  onSeek,
  label,
}: ChapterProps & { label: string }) {
  const text = useChapterText({ styles, configLabel, unit });
  const [hovered, setHovered] = useState<number | null>(null);
  const last = Math.max(1, dates.length - 1);
  const position = (index: number) => (index / last) * 100;
  // Several series can step on the same date; they share one segment and one tooltip.
  const byDate = new Map<number, FrontierChapter[]>();
  for (const chapter of chapters)
    byDate.set(chapter.dateIndex, [...(byDate.get(chapter.dateIndex) ?? []), chapter]);
  const segments = [
    { start: 0, chapter: null as FrontierChapter | null, all: [] as FrontierChapter[] },
    ...[...byDate]
      .filter(([start]) => start > 0)
      .map(([start, all]) => ({ start, chapter: all[0], all })),
  ].map((segment, index, all) => ({ ...segment, end: all[index + 1]?.start ?? last }));
  const segmentAt = (index: number) => segments.findLastIndex((s) => s.start <= index);
  const current = segments[segmentAt(dateIndex)];
  const shown = hovered === null ? null : segments[segmentAt(hovered)];
  const colorOf = (chapter: FrontierChapter | null) =>
    chapter
      ? (styles.get(chapter.driver)?.color ?? 'var(--muted-foreground)')
      : 'var(--muted-foreground)';

  return (
    <div
      className="relative h-5"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const fraction = (event.clientX - bounds.left - THUMB_PX / 2) / (bounds.width - THUMB_PX);
        setHovered(Math.round(Math.min(1, Math.max(0, fraction)) * last));
      }}
      onPointerLeave={() => setHovered(null)}
    >
      <div className="pointer-events-none absolute inset-x-2 top-1/2 h-1.5 -translate-y-1/2">
        {segments.map((segment) => {
          const played = Math.min(
            100,
            Math.max(
              0,
              ((dateIndex - segment.start) / Math.max(1, segment.end - segment.start)) * 100,
            ),
          );
          const color = colorOf(segment.chapter);
          return (
            <span
              key={segment.start}
              className="absolute inset-y-0 rounded-full"
              style={{
                left: `${position(segment.start)}%`,
                width: `max(3px, calc(${position(segment.end) - position(segment.start)}% - 2px))`,
                background: `linear-gradient(to right, ${color} ${played}%, color-mix(in oklab, ${color} 30%, transparent) ${played}%)`,
              }}
            />
          );
        })}
      </div>
      <input
        type="range"
        min={0}
        max={last}
        step={1}
        value={dateIndex}
        aria-label={label}
        aria-valuetext={`${formatDate(dates[dateIndex])}${current?.chapter ? ` · ${text.title(current.chapter)}` : ''}`}
        data-testid="frontier-date-slider"
        onChange={(event) => onSeek(Number(event.target.value))}
        onPointerUp={() => track('historical_frontier_date_set', { date: dates[dateIndex] })}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent
          [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:cursor-pointer
          [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2
          [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary
          [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:bg-transparent
          [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background
          [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow"
      />
      {shown?.chapter && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full z-20 mb-2 w-72 max-w-[80vw] -translate-x-1/2 rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm"
          style={{ left: `clamp(9rem, ${position(shown.start)}%, calc(100% - 9rem))` }}
        >
          <div className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: colorOf(shown.chapter) }}
            />
            {formatDate(dates[shown.start])}
          </div>
          {shown.all.map((chapter) => (
            <div key={`${chapter.track}:${chapter.driver}`} className="pt-0.5">
              <div className="font-semibold">{text.title(chapter)}</div>
              <div className="text-muted-foreground">{text.detail(chapter)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The chapter the current date is in, spelled out under the timeline. */
export function FrontierChapterNow({
  chapters,
  dates,
  dateIndex,
  styles,
  configLabel,
  unit,
  formatDate,
}: Omit<ChapterProps, 'onSeek'>) {
  const text = useChapterText({ styles, configLabel, unit });
  const latest = chapters.findLast((chapter) => chapter.dateIndex <= dateIndex);
  if (!latest) return null;
  const sameDay = chapters.filter((chapter) => chapter.dateIndex === latest.dateIndex);
  return (
    <div className="px-1 pt-2 text-xs" data-testid="frontier-chapter-now">
      {sameDay.map((current) => (
        <p key={`${current.track}:${current.driver}`}>
          <span
            aria-hidden
            className="mr-1.5 inline-block size-2 rounded-full align-middle"
            style={{
              background: styles.get(current.driver)?.color ?? 'var(--muted-foreground)',
            }}
          />
          <span className="text-muted-foreground tabular-nums">
            {formatDate(dates[current.dateIndex])}
          </span>
          <span className="font-medium"> · {text.title(current)}</span>
          <span className="text-muted-foreground"> · {text.detail(current)}</span>
        </p>
      ))}
    </div>
  );
}
