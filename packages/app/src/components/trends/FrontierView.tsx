'use client';

import dynamic from 'next/dynamic';
import { Pause, Play, TrendingDown } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import { VENDOR_LOGO_ICONS } from '@/lib/catalog/vendor-logos';
import { useLocale } from '@/lib/i18n/use-locale';

import { FrontierChapterNow, FrontierTimeline } from './FrontierChapters';
import FrontierChart, {
  type FrontierChartProps,
  type FrontierRegressionNote,
} from './FrontierChart';
import { FrontierAreaTimeline, FrontierLeadBars } from './FrontierComparePanels';
import FrontierDataTable from './FrontierDataTable';
import { FrontierSoftwareGain, FrontierSoftwareGainBars } from './FrontierSoftwarePanels';
import {
  frontierAreas,
  frontierChapters,
  frontierRegressions,
  historyFromFirstData,
  shortImage,
  type FrontierHistory,
  type FrontierOvertake,
  type FrontierRegression,
} from './frontier-history-core';

const FrontierMemeOverlay = dynamic(() => import('./frontier-memes/FrontierMemeOverlay'), {
  ssr: false,
});

/** The three Historical views built on the frontier history. */
export type FrontierSection = 'frontier' | 'compare' | 'software';
/** What a series is in Frontier and Compare: one chip, or every chip of a vendor. */
export type FrontierGrouping = 'gpu' | 'vendor';

export const FRONTIER_SECTIONS: readonly FrontierSection[] = ['frontier', 'compare', 'software'];

export const isFrontierSection = (view: string): view is FrontierSection =>
  (FRONTIER_SECTIONS as readonly string[]).includes(view);

/** Picker value for every vendor; vendor names never collide with it. */
const ALL_VENDORS = '__all__';
/** Full history plays in roughly this long, plus pauses on chapters and the meme. */
const PLAYBACK_MS = 14_000;
/** Playback pauses this long on each chapter. */
const CHAPTER_HOLD_MS = 1_000;
const MEME_HOLD_MS = 2_600;
/** The meme celebrates another vendor taking part of the frontier from this one. */
const MEME_VICTIM_VENDOR = 'NVIDIA';

/** A regression's figures, formatted for the sentence that explains it. */
interface RegressionText {
  /** Chip or vendor name. */
  name: string;
  /** Ground lost against the best, e.g. `15%`. */
  drop: string;
  bestDate: string;
  peak: { drop: string; x: number } | null;
  image: { config: string; from: string; to: string } | null;
}

const STRINGS = {
  en: {
    play: 'Play',
    pause: 'Pause',
    replay: 'Replay',
    date: 'Snapshot date',
    vendor: 'Vendor',
    allVendors: 'All',
    compareBy: 'Compare',
    chips: 'Chips',
    vendors: 'Vendors',
    frontierHint: (vendor: string | null) =>
      vendor
        ? `The best result at every interactivity across ${vendor} chips, colored by the chip that holds it.`
        : 'The best result at every interactivity, colored by the chip that holds it.',
    compareHint: (grouping: FrontierGrouping) =>
      `Each ${grouping === 'gpu' ? "chip's" : "vendor's"} own frontier side by side, with who leads and by how much.`,
    softwareHint:
      'The hardware is held constant: each chip against its own first run, so every gain is software, serving configuration or precision.',
    pick: (grouping: FrontierGrouping) => (grouping === 'gpu' ? 'Chips shown' : 'Vendors shown'),
    hidden: (vendor: string, chips: string, precision: string) =>
      `${vendor} (${chips}) only has ${precision} data for this model and scenario.`,
    include: (precision: string) => `Include ${precision}`,
    startKey:
      "Dashed line: each curve's first run. Where it sits outside today's curve, a later run measured lower. Hover a line for details.",
    regressionsTitle: 'Below their best',
    regression: ({ name, drop, bestDate, peak, image }: RegressionText) =>
      [
        `${name} covers ${drop} less ground than at its best (${bestDate})${
          peak ? `, and is ${peak.drop} lower at ${peak.x} tok/s/user` : ''
        }.`,
        image ? `${image.config} changed serving image from ${image.from} to ${image.to}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    unknown: 'unknown',
  },
  zh: {
    play: '播放',
    pause: '暂停',
    replay: '重播',
    date: '快照日期',
    vendor: '厂商',
    allVendors: '全部',
    compareBy: '对比',
    chips: '芯片',
    vendors: '厂商',
    frontierHint: (vendor: string | null) =>
      vendor
        ? `${vendor} 各芯片在每个交互性水平上的最优结果，按占据该区段的芯片着色。`
        : '各交互性水平上的最优结果，按占据该区段的芯片着色。',
    compareHint: (grouping: FrontierGrouping) =>
      `并排展示各${grouping === 'gpu' ? '芯片' : '厂商'}自身的前沿，以及谁领先、领先多少。`,
    softwareHint:
      '硬件保持不变：每款芯片都与自身的首次测试对比，因此各项提升都来自软件、部署配置或精度。',
    pick: (grouping: FrontierGrouping) => (grouping === 'gpu' ? '显示的芯片' : '显示的厂商'),
    hidden: (vendor: string, chips: string, precision: string) =>
      `${vendor}（${chips}）在该模型与场景下仅有 ${precision} 数据。`,
    include: (precision: string) => `加入 ${precision}`,
    startKey:
      '虚线：各曲线的首次测试结果。若虚线位于当前曲线之外，说明之后的测试结果更低。悬停可查看详情。',
    regressionsTitle: '低于自身最佳水平',
    regression: ({ name, drop, bestDate, peak, image }: RegressionText) =>
      `${name} 的覆盖面积比最佳时（${bestDate}）少 ${drop}${
        peak ? `，在 ${peak.x} tok/s/user 处低 ${peak.drop}` : ''
      }。${image ? `${image.config} 的 serving 镜像由 ${image.from} 改为 ${image.to}。` : ''}`,
    unknown: '未知',
  },
};

export interface HiddenVendorNote {
  vendor: string;
  /** Chip names with data at the other precision. */
  chips: string;
  precisions: string[];
  precisionLabel: string;
}

type FrontierViewProps = Omit<FrontierChartProps, 'dateIndex' | 'variant'> & {
  section: FrontierSection;
  /** Compare only: vendors or chips side by side. The other views always show chips. */
  grouping: FrontierGrouping;
  onGroupingChange: (grouping: FrontierGrouping) => void;
  /** Vendors with data, for the vendor picker. */
  vendors: readonly string[];
  /** The chosen vendor, whose chips alone are shown; null for every vendor. */
  vendor: string | null;
  onVendorChange: (vendor: string | null) => void;
  memesEnabled: boolean;
  vendorOf: (seriesKey: string) => string | null;
  hiddenVendors: readonly HiddenVendorNote[];
  onAddPrecisions: (precisions: string[]) => void;
};

/**
 * Series selected when a view opens: every vendor, the two chips covering the most ground
 * today, or the three biggest chips for software gains.
 */
function defaultSelection(
  history: FrontierHistory,
  candidates: ReadonlySet<string>,
  section: FrontierSection,
  grouping: FrontierGrouping,
): string[] {
  const last = history.dates.length - 1;
  const ranked = [...frontierAreas(history)]
    .filter(([key, areas]) => candidates.has(key) && (areas[last] ?? 0) > 0)
    .toSorted((a, b) => b[1][last] - a[1][last])
    .map(([key]) => key);
  if (section === 'software') return ranked.slice(0, 3);
  return grouping === 'vendor' ? ranked : ranked.slice(0, 2);
}

/** The largest stretch of the curve another vendor took from NVIDIA on a date, if any. */
function headlineOvertake(
  history: FrontierHistory,
  dateIndex: number,
  vendorOf: (seriesKey: string) => string | null,
  keys: readonly string[],
): FrontierOvertake | null {
  const candidates = history.overtakes.filter(
    (o) =>
      o.dateIndex === dateIndex &&
      o.kind !== 'tie' &&
      keys.includes(o.winner) &&
      keys.includes(o.loser) &&
      vendorOf(o.loser) === MEME_VICTIM_VENDOR &&
      vendorOf(o.winner) !== MEME_VICTIM_VENDOR,
  );
  return (
    candidates.toSorted(
      (a, b) => b.levelCount * (b.multiplier ?? 1) - a.levelCount * (a.multiplier ?? 1),
    )[0] ?? null
  );
}

function useDateFormatter(locale: 'en' | 'zh') {
  return useMemo(() => {
    const day = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return (date: string) => day.format(new Date(`${date}T00:00:00Z`));
  }, [locale]);
}

/**
 * The Frontier, Compare and Software gains views: the frontier chart with playback, chapters
 * and a data table, plus each view's own controls and panels.
 */
export default function FrontierView({
  section,
  grouping,
  onGroupingChange,
  vendors,
  vendor,
  onVendorChange,
  memesEnabled,
  vendorOf,
  hiddenVendors,
  onAddPrecisions,
  ...chartProps
}: FrontierViewProps) {
  const { history: fullHistory, styles: allStyles } = chartProps;
  const locale = useLocale();
  const t = STRINGS[locale];
  const formatDate = useDateFormatter(locale);
  // Compare and Software gains draw each selected series on its own; Frontier pools them all.
  const perSeries = section !== 'frontier';
  // Comparing vendors shows every vendor; otherwise a chosen vendor narrows the view to its chips.
  const showsVendorPicker = !(section === 'compare' && grouping === 'vendor');
  const styles = useMemo(
    () =>
      vendor && showsVendorPicker
        ? new Map([...allStyles].filter(([key]) => vendorOf(key) === vendor))
        : allStyles,
    [allStyles, vendor, showsVendorPicker, vendorOf],
  );

  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    setSelected(defaultSelection(fullHistory, new Set(styles.keys()), section, grouping));
  }, [fullHistory, styles, section, grouping]);
  const visibleKeys = useMemo(
    () => (perSeries ? selected : [...styles.keys()]),
    [perSeries, selected, styles],
  );
  const visibleStyles = useMemo(
    () =>
      perSeries
        ? new Map(selected.flatMap((key) => (styles.has(key) ? [[key, styles.get(key)!]] : [])))
        : styles,
    [perSeries, selected, styles],
  );
  // The timeline opens on the first date the series on screen have data, not an empty stretch.
  const history = useMemo(
    () => historyFromFirstData(fullHistory, visibleKeys),
    [fullHistory, visibleKeys],
  );
  // Frontier explains steps of the pooled curve; the other views each selected series.
  const chapters = useMemo(
    () => frontierChapters(history, visibleKeys, !perSeries),
    [perSeries, history, visibleKeys],
  );

  const last = history.dates.length - 1;
  const [rawDateIndex, setDateIndex] = useState(last);
  // Clamped while the timeline's start moves, before the effect below remaps to the same date.
  const dateIndex = Math.min(rawDateIndex, last);
  // The frontier follows the latest full runs, so a re-run that measured lower replaces a
  // better curve; series well below their own best are named rather than silently lower.
  const regressions = useMemo(
    () => frontierRegressions(history, dateIndex, visibleKeys),
    [history, dateIndex, visibleKeys],
  );
  const [playing, setPlaying] = useState(false);
  const [memeOvertake, setMemeOvertake] = useState<FrontierOvertake | null>(null);
  const holdUntil = useRef(0);
  // One meme per playback run: the first time another vendor takes ground from NVIDIA.
  const memeShownThisRun = useRef(false);

  useEffect(() => {
    setPlaying(false);
    setMemeOvertake(null);
  }, [fullHistory]);

  // When the timeline's start moves, stay on the same date (or the latest if it is gone).
  const shownDates = useRef(history.dates);
  useEffect(() => {
    const previous = shownDates.current;
    shownDates.current = history.dates;
    if (previous === history.dates) return;
    setDateIndex((index) => {
      const same = history.dates.indexOf(previous[index]);
      return same === -1 ? history.dates.length - 1 : same;
    });
  }, [history.dates]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => {
        if (Date.now() < holdUntil.current) return;
        setDateIndex((index) => {
          if (index >= last) {
            setPlaying(false);
            return index;
          }
          return index + 1;
        });
      },
      Math.max(40, PLAYBACK_MS / Math.max(1, last)),
    );
    return () => clearInterval(timer);
  }, [playing, last]);

  // Playback lingers on each chapter so its step and explanation can be read.
  useEffect(() => {
    if (playing && chapters.some((chapter) => chapter.dateIndex === dateIndex))
      holdUntil.current = Math.max(holdUntil.current, Date.now() + CHAPTER_HOLD_MS);
  }, [playing, dateIndex, chapters]);

  useEffect(() => {
    if (!memesEnabled || !playing || memeShownThisRun.current) return;
    const overtake = headlineOvertake(history, dateIndex, vendorOf, visibleKeys);
    if (!overtake) return;
    memeShownThisRun.current = true;
    holdUntil.current = Date.now() + MEME_HOLD_MS;
    setMemeOvertake(overtake);
    track('historical_frontier_meme_shown', { gpu: overtake.winner });
  }, [memesEnabled, playing, history, dateIndex, vendorOf, visibleKeys]);

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      track('historical_frontier_paused', { date: history.dates[dateIndex] });
      return;
    }
    // A run starts at the beginning (Replay, or dragged back to the start); pausing and
    // resuming mid-way stays in the same run.
    if (dateIndex >= last) setDateIndex(0);
    if (dateIndex >= last || dateIndex === 0) memeShownThisRun.current = false;
    setPlaying(true);
    track('historical_frontier_played', { date: history.dates[dateIndex] });
  };
  const seek = (index: number) => {
    setPlaying(false);
    setDateIndex(index);
  };
  const seekFromPanel = (index: number) => {
    seek(index);
    track('historical_frontier_date_set', { date: history.dates[index] });
  };
  const toggleSelected = (key: string) => {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    setSelected(next);
    track('historical_frontier_series_toggled', { gpu: key, enabled: next.includes(key) });
  };

  const label = useCallback((key: string) => styles.get(key)?.label ?? key, [styles]);
  const { configLabel } = chartProps;
  const regressionNotes = useMemo(() => {
    const percent = (ratio: number) => `${Math.round((1 - ratio) * 100)}%`;
    const describe = (r: FrontierRegression) =>
      t.regression({
        name: label(r.key),
        drop: percent(r.change),
        bestDate: formatDate(r.bestDate),
        peak: r.peak && { drop: percent(r.peak.ratio), x: Math.round(r.peak.x) },
        image:
          r.config && r.image
            ? {
                config: configLabel(r.config),
                from: shortImage(r.image.from, t.unknown),
                to: shortImage(r.image.to, t.unknown),
              }
            : null,
      });
    return new Map<string, FrontierRegressionNote>(
      regressions.map((r) => [r.key, { badge: `▼${percent(r.change)}`, text: describe(r) }]),
    );
  }, [regressions, label, configLabel, formatDate, t]);
  const memeContext = useMemo(
    () =>
      memeOvertake && {
        overtake: memeOvertake,
        winnerLabel: label(memeOvertake.winner),
        loserLabel: label(memeOvertake.loser),
      },
    [memeOvertake, label],
  );
  const chapterProps = {
    chapters,
    dates: history.dates,
    dateIndex,
    styles,
    configLabel: chartProps.configLabel,
    unit: 'tok/s/user',
    formatDate,
  };
  // The view's controls sit in the chart caption, after its title, costs and notices.
  const controls = (
    <div className="flex flex-col gap-3 pt-3" data-testid="frontier-controls">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {section === 'compare' && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t.compareBy}</span>
            <SegmentedToggle<FrontierGrouping>
              ariaLabel={t.compareBy}
              testId="frontier-grouping"
              role="group"
              value={grouping}
              onValueChange={onGroupingChange}
              options={[
                { value: 'vendor', label: t.vendors, testId: 'frontier-grouping-vendor' },
                { value: 'gpu', label: t.chips, testId: 'frontier-grouping-gpu' },
              ]}
            />
          </div>
        )}
        {showsVendorPicker && vendors.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t.vendor}</span>
            <SegmentedToggle<string>
              ariaLabel={t.vendor}
              testId="frontier-vendor"
              role="group"
              value={vendor ?? ALL_VENDORS}
              onValueChange={(value) => onVendorChange(value === ALL_VENDORS ? null : value)}
              options={[
                { value: ALL_VENDORS, label: t.allVendors, testId: 'frontier-vendor-all' },
                ...vendors.map((name) => ({
                  value: name,
                  label: name,
                  testId: `frontier-vendor-${name}`,
                  icon: VENDOR_LOGO_ICONS[name] ? (
                    <img
                      src={VENDOR_LOGO_ICONS[name].href}
                      alt=""
                      aria-hidden
                      className="size-3 object-contain"
                    />
                  ) : undefined,
                })),
              ]}
            />
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {section === 'frontier'
          ? t.frontierHint(vendor)
          : section === 'compare'
            ? t.compareHint(grouping)
            : t.softwareHint}
      </p>
      {perSeries && (
        <div role="group" aria-label={t.pick(grouping)} className="flex flex-wrap gap-1.5">
          {[...styles].map(([key, style]) => {
            const on = selected.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                data-testid={`frontier-series-${key}`}
                onClick={() => toggleSelected(key)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  on ? 'border-foreground/30 bg-secondary font-medium' : 'text-muted-foreground'
                }`}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ background: on ? style.color : 'var(--muted)' }}
                />
                {style.label}
              </button>
            );
          })}
        </div>
      )}
      {hiddenVendors.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {hiddenVendors.map((note) => (
            <li key={note.vendor} className="flex flex-wrap items-center gap-2">
              <span>{t.hidden(note.vendor, note.chips, note.precisionLabel)}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                data-testid={`frontier-include-${note.vendor}`}
                onClick={() => onAddPrecisions(note.precisions)}
              >
                {t.include(note.precisionLabel)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Card className="relative" data-testid="frontier-view">
      <FrontierChart
        {...chartProps}
        caption={
          <>
            {chartProps.caption}
            {controls}
          </>
        }
        history={history}
        styles={visibleStyles}
        variant={perSeries ? 'each' : 'pooled'}
        regressions={regressionNotes}
        dateIndex={dateIndex}
        plotOverlay={
          memesEnabled && memeContext ? (
            <FrontierMemeOverlay context={memeContext} onDismiss={() => setMemeOvertake(null)} />
          ) : undefined
        }
      />

      <div className="flex items-center gap-3 px-1 pt-3">
        <Button
          type="button"
          size="sm"
          onClick={togglePlay}
          data-testid="frontier-play"
          className="min-w-24"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? t.pause : dateIndex >= last ? t.replay : t.play}
        </Button>
        <div className="min-w-0 flex-1">
          <FrontierTimeline {...chapterProps} label={t.date} onSeek={seek} />
        </div>
        <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums">
          {formatDate(history.dates[dateIndex])}
        </span>
      </div>
      <FrontierChapterNow {...chapterProps} />

      {regressionNotes.size > 0 && (
        <div className="flex gap-2 px-1 pt-3 text-xs" data-testid="frontier-regressions">
          <TrendingDown aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <span className="font-medium">{t.regressionsTitle}</span>
            <ul className="flex flex-col gap-1 text-muted-foreground">
              {[...regressionNotes].map(([key, note]) => (
                <li key={key}>{note.text}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {perSeries && (
        <p className="px-1 pt-2 text-xs text-muted-foreground" data-testid="frontier-start-key">
          {t.startKey}
        </p>
      )}

      {section === 'compare' && (
        <div className="grid gap-x-6 gap-y-2 px-1 pt-6 lg:grid-cols-2">
          <FrontierLeadBars
            history={history}
            dateIndex={dateIndex}
            keys={selected}
            styles={styles}
            xLabel={chartProps.xLabel}
          />
          <FrontierAreaTimeline
            history={history}
            dateIndex={dateIndex}
            keys={selected}
            styles={styles}
            onSeek={seekFromPanel}
          />
        </div>
      )}
      {section === 'software' && (
        <div className="grid gap-x-6 gap-y-2 px-1 pt-6 lg:grid-cols-2">
          <FrontierSoftwareGain
            history={history}
            dateIndex={dateIndex}
            keys={selected}
            styles={styles}
            formatDate={formatDate}
            onSeek={seekFromPanel}
          />
          <FrontierSoftwareGainBars
            history={history}
            dateIndex={dateIndex}
            keys={selected}
            styles={styles}
            xLabel={chartProps.xLabel}
          />
        </div>
      )}

      <FrontierDataTable
        history={history}
        dateIndex={dateIndex}
        keys={visibleKeys}
        pooled={!perSeries}
        styles={styles}
        configLabel={chartProps.configLabel}
        yLabel={chartProps.yLabel}
      />
    </Card>
  );
}
