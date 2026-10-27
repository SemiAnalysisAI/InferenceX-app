'use client';

import * as d3 from 'd3';
import { ChevronDown } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { SYSTEM_POWER_CATEGORY_LABELS } from '@/lib/power/system-power-model';
import { cn } from '@/lib/shared/utils';
import {
  isHatchedBand,
  partTarget,
  powerBandFillOpacity,
  powerLayerFill,
  powerPartEmphasis,
  powerPartRows,
  sparklineGeometry,
  type PowerBreakdownPoint,
  type PowerBreakdownSeries,
  type PowerLayerHighlight,
  type PowerLayerTarget,
  type PowerPartBehaviour,
  type PowerPartRow,
  type SystemPowerCategory,
} from '../utils/power-breakdown';
import { usePowerXSurface } from './powerx-surface';

const STRINGS = {
  en: {
    list: 'Power parts at the compared point',
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    measured: 'Measured',
    modeledLoad: 'Modeled · moves with load',
    modeledFixed: 'Modeled · fixed',
    pinned: 'Pinned',
    shareOfIt: 'Share of IT W/GPU',
    shareOfFacility: 'Share of facility W/GPU',
    acrossLoad: 'W/GPU across this chip’s points, lowest interactivity first',
    allParts: (count: number) => `All ${count} parts · across load`,
    categories: SYSTEM_POWER_CATEGORY_LABELS.en,
  },
  zh: {
    list: '对比点处的功耗部件',
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    measured: '实测',
    modeledLoad: '建模 · 随负载变化',
    modeledFixed: '建模 · 固定',
    pinned: '已固定',
    shareOfIt: '占 IT W/GPU 的比例',
    shareOfFacility: '占机房 W/GPU 的比例',
    acrossLoad: '该芯片各数据点的 W/GPU，按交互性从低到高',
    allParts: (count: number) => `全部 ${count} 项 · 随负载变化`,
    categories: SYSTEM_POWER_CATEGORY_LABELS.zh,
  },
};

const watts = d3.format(',.0f');
const percent = d3.format('.0%');
const rate = d3.format(',.0f');
export const SPARKLINE_WIDTH = 72;
export const SPARKLINE_HEIGHT = 18;
/** PowerX on a phone: the heaviest parts stay in view, the rest sit behind one row. */
export const PHONE_VISIBLE_PARTS = 3;

const behaviourLabel = (behaviour: PowerPartBehaviour, t: (typeof STRINGS)['en']) =>
  behaviour === 'measured' ? t.measured : behaviour === 'load' ? t.modeledLoad : t.modeledFixed;

/** The row's bar: the chip colour at its layer's step; modeled bars get a dashed left edge. */
export function partBarStyle(row: PowerPartRow, color: string): React.CSSProperties {
  return {
    backgroundColor: powerLayerFill(color, powerBandFillOpacity(row.band)),
    borderLeft: isHatchedBand(row.band) ? `2px dashed ${color}` : undefined,
  };
}

/**
 * PowerX on a phone: the `PHONE_VISIBLE_PARTS` largest IT parts by watts stay in
 * view (the facility overhead is an addition to IT, listed last under its rule,
 * so it always folds), plus a pinned part that would otherwise sit in the folded
 * remainder, so a pin made while the list was open survives its collapse. Order
 * is the list's.
 */
export function foldPowerPartRows(
  rows: readonly PowerPartRow[],
  pinnedCategory: SystemPowerCategory | null,
): { shown: PowerPartRow[]; rest: PowerPartRow[] } {
  const kept = new Set(
    rows
      .filter((row) => row.category !== 'facility')
      .toSorted((a, b) => b.watts - a.watts)
      .slice(0, PHONE_VISIBLE_PARTS)
      .map((row) => row.category),
  );
  if (pinnedCategory !== null) kept.add(pinnedCategory);
  return {
    shown: rows.filter((row) => kept.has(row.category)),
    rest: rows.filter((row) => !kept.has(row.category)),
  };
}

/**
 * The detail beside the overview: every non-empty part of the selected chip at
 * the compared point, heaviest first, each with its watts, its share and a
 * sparkline of that part across the chip's points. Hovering a row raises its
 * layer in the chart; a click pins it, Escape unpins. PowerX on a phone folds
 * the list to its three largest parts and an "All N parts" row that opens the
 * rest in place, in 56 px rows (name and numbers above the bar and sparkline).
 */
export default function PowerPartsList({
  series,
  entry,
  color,
  highlight,
  onHover,
  onTogglePin,
}: {
  series: PowerBreakdownSeries;
  /** The compared point of `series`. */
  entry: PowerBreakdownPoint;
  color: string;
  highlight: PowerLayerHighlight | null;
  onHover: (target: PowerLayerTarget | null) => void;
  onTogglePin: (target: PowerLayerTarget) => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const rows = useMemo(() => powerPartRows(series, entry), [series, entry]);
  const maxWatts = Math.max(1, ...rows.map((row) => row.watts));
  const heading = `${series.label} · ${t.at(entry.concurrency, rate(entry.interactivity))}`;
  // PowerX under `md`: the accordion; desktop and other surfaces keep the full list.
  const powerX = usePowerXSurface();
  const mobile = useIsMobileViewport();
  const phone = powerX && mobile;
  const folded = phone && rows.length > PHONE_VISIBLE_PARTS;
  const [expanded, setExpanded] = useState(false);
  const restId = useId();
  // A pinned part joins the visible rows only once the list folds: while it is open a
  // tap pins a row where it is, without moving it.
  const pinnedCategory = highlight?.pinned === true && !expanded ? highlight.category : null;
  const { shown, rest } = useMemo(
    () => (folded ? foldPowerPartRows(rows, pinnedCategory) : { shown: rows, rest: [] }),
    [rows, folded, pinnedCategory],
  );
  const enter = (row: PowerPartRow) => {
    onHover(partTarget(row.category));
    track('powerx_breakdown_part_hovered', { category: row.category });
  };
  const renderRow = (row: PowerPartRow) => {
    const emphasis = powerPartEmphasis(row.category, highlight);
    const pinned = highlight?.pinned === true && highlight.category === row.category;
    const spark = sparklineGeometry(
      row.history,
      row.selectedIndex,
      SPARKLINE_WIDTH,
      SPARKLINE_HEIGHT,
    );
    const facility = row.category === 'facility';
    const name = (
      <span className={`truncate ${emphasis === 'plain' ? '' : 'font-semibold'}`}>
        {t.categories[row.category]}
      </span>
    );
    // A faint track, so a 3 % part still reads as a short bar on a full-width scale.
    const bar = (
      <span
        className={cn('h-2 min-w-0 overflow-hidden rounded-xs bg-muted/50', phone && 'col-span-2')}
        aria-hidden
      >
        <span
          className="block h-full"
          data-testid="power-part-bar"
          style={{
            width: `${(row.watts / maxWatts) * 100}%`,
            ...partBarStyle(row, color),
          }}
        />
      </span>
    );
    const numbers = (
      <>
        <span className="text-right" data-testid="power-part-watts">
          {watts(row.watts)} W
        </span>
        <span
          className="text-right text-muted-foreground"
          data-testid="power-part-share"
          title={facility ? t.shareOfFacility : t.shareOfIt}
        >
          {percent(row.share)}
        </span>
      </>
    );
    const sparkline = (
      <svg
        width={SPARKLINE_WIDTH}
        height={SPARKLINE_HEIGHT}
        viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
        className="justify-self-end"
        data-testid="power-part-sparkline"
        data-max={row.max}
        role="img"
        aria-label={t.acrossLoad}
      >
        <title>{t.acrossLoad}</title>
        <path d={spark.area} fill={color} fillOpacity={emphasis === 'highlighted' ? 0.45 : 0.2} />
        <path
          d={spark.line}
          fill="none"
          stroke={color}
          strokeWidth={emphasis === 'highlighted' ? 1.5 : 1}
        />
        <circle cx={spark.dot.x} cy={spark.dot.y} r={2} fill={color} />
      </svg>
    );
    return (
      <li
        key={row.category}
        className={facility ? 'mt-1 border-t border-border/60 pt-1' : undefined}
      >
        <button
          type="button"
          data-testid="power-part-row"
          data-category={row.category}
          data-band={row.band}
          data-emphasis={emphasis}
          data-share={row.share}
          aria-pressed={pinned}
          title={`${behaviourLabel(row.behaviour, t)}${pinned ? ` · ${t.pinned}` : ''}`}
          onMouseEnter={() => enter(row)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => enter(row)}
          onBlur={() => onHover(null)}
          onClick={() => {
            onTogglePin(partTarget(row.category));
            track('powerx_breakdown_part_pinned', { category: row.category });
          }}
          className={cn(
            'grid w-full min-w-0 items-center rounded-md text-left tabular-nums',
            phone
              ? // Two lines in 56 px: name, watts and share; then the bar beside the sparkline.
                'min-h-14 grid-cols-[minmax(0,1fr)_auto_auto] gap-x-2 gap-y-1 px-2 py-1.5 text-sm'
              : 'grid-cols-[minmax(5.5rem,1.4fr)_minmax(1.5rem,1fr)_3.5rem_2.25rem_4.5rem] gap-x-1.5 px-1.5 py-1 sm:grid-cols-[minmax(6.5rem,1.3fr)_minmax(2rem,1fr)_3.5rem_2.5rem_4.5rem]',
            emphasis === 'highlighted' ? 'bg-muted' : 'hover:bg-muted/60',
            pinned && 'ring-1 ring-border',
          )}
        >
          {phone ? (
            <>
              {name}
              {numbers}
              {bar}
              {sparkline}
            </>
          ) : (
            <>
              {name}
              {bar}
              {numbers}
              {sparkline}
            </>
          )}
        </button>
      </li>
    );
  };
  return (
    <div
      className="min-w-0 text-xs"
      data-testid="power-parts-list"
      data-folded={folded ? 'true' : undefined}
    >
      <p className="mb-1 truncate font-medium" data-testid="power-parts-heading" title={heading}>
        {heading}
      </p>
      <ul aria-label={t.list} className="space-y-px">
        {shown.map(renderRow)}
      </ul>
      {folded && rest.length > 0 && (
        <>
          <button
            type="button"
            data-testid="power-parts-toggle"
            aria-expanded={expanded}
            aria-controls={restId}
            onClick={() => {
              setExpanded(!expanded);
              track('powerx_parts_expanded', { expanded: !expanded, hw: series.hwKey });
            }}
            className="mt-1 flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/10 px-3 text-left text-sm font-medium text-foreground"
          >
            <span>{t.allParts(rows.length)}</span>
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-180')}
            />
          </button>
          <ul id={restId} className="mt-1 space-y-px" data-testid="power-parts-rest">
            {expanded && rest.map(renderRow)}
          </ul>
        </>
      )}
    </div>
  );
}
