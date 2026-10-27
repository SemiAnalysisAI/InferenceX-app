'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  partTarget,
  powerBandOpacity,
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
    categories: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      cpu: 'CPU',
      memory: 'Memory',
      nic: 'NICs',
      nvswitch: 'NVSwitch',
      storage: 'Storage',
      other: 'PCIe & misc',
      fans: 'Fans',
      psuLoss: 'PSU loss',
      network: 'Network share',
      facility: 'Facility (PUE)',
    } satisfies Record<SystemPowerCategory, string>,
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
    categories: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      cpu: 'CPU',
      memory: '内存',
      nic: '网卡',
      nvswitch: 'NVSwitch',
      storage: '存储',
      other: 'PCIe 及其他',
      fans: '风扇',
      psuLoss: '电源损耗',
      network: '网络分摊',
      facility: '机房开销（PUE）',
    } satisfies Record<SystemPowerCategory, string>,
  },
};

const watts = d3.format(',.0f');
const percent = d3.format('.0%');
const rate = d3.format(',.0f');
export const SPARKLINE_WIDTH = 72;
export const SPARKLINE_HEIGHT = 18;

const behaviourLabel = (behaviour: PowerPartBehaviour, t: (typeof STRINGS)['en']) =>
  behaviour === 'measured' ? t.measured : behaviour === 'load' ? t.modeledLoad : t.modeledFixed;

/** The row's bar: the chip colour at the band's ramp step; modeled bars get a dashed left edge. */
export function partBarStyle(row: PowerPartRow, color: string): React.CSSProperties {
  return {
    backgroundColor: powerLayerFill(color, powerBandOpacity(row.band)),
    borderLeft: row.band === 'measured' ? undefined : `2px dashed ${color}`,
  };
}

/**
 * The detail beside the overview: every non-empty part of the selected chip at
 * the compared point, heaviest first, each with its watts, its share and a
 * sparkline of that part across the chip's points. Hovering a row raises its
 * band in the chart; a click pins it, Escape unpins.
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
  const enter = (row: PowerPartRow) => {
    onHover(partTarget(row.category));
    track('powerx_breakdown_part_hovered', { category: row.category });
  };
  return (
    <div className="min-w-0 text-xs" data-testid="power-parts-list">
      <p className="mb-1 truncate font-medium" data-testid="power-parts-heading" title={heading}>
        {heading}
      </p>
      <ul aria-label={t.list} className="space-y-px">
        {rows.map((row) => {
          const emphasis = powerPartEmphasis(row.category, highlight);
          const pinned = highlight?.pinned === true && highlight.category === row.category;
          const spark = sparklineGeometry(
            row.history,
            row.selectedIndex,
            SPARKLINE_WIDTH,
            SPARKLINE_HEIGHT,
          );
          const facility = row.category === 'facility';
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
                className={`grid w-full min-w-0 grid-cols-[minmax(5.5rem,1.4fr)_minmax(1.5rem,1fr)_3.5rem_2.25rem_4.5rem] items-center gap-x-1.5 rounded-md px-1.5 py-1 text-left tabular-nums sm:grid-cols-[minmax(6.5rem,1.3fr)_minmax(2rem,1fr)_3.5rem_2.5rem_4.5rem] ${
                  emphasis === 'highlighted' ? 'bg-muted' : 'hover:bg-muted/60'
                } ${pinned ? 'ring-1 ring-border' : ''}`}
              >
                <span className={`truncate ${emphasis === 'plain' ? '' : 'font-semibold'}`}>
                  {t.categories[row.category]}
                </span>
                {/* A faint track, so a 3 % part still reads as a short bar on a full-width scale. */}
                <span className="h-2 min-w-0 overflow-hidden rounded-xs bg-muted/50" aria-hidden>
                  <span
                    className="block h-full"
                    data-testid="power-part-bar"
                    style={{
                      width: `${(row.watts / maxWatts) * 100}%`,
                      ...partBarStyle(row, color),
                    }}
                  />
                </span>
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
                  <path
                    d={spark.area}
                    fill={color}
                    fillOpacity={emphasis === 'highlighted' ? 0.45 : 0.2}
                  />
                  <path
                    d={spark.line}
                    fill="none"
                    stroke={color}
                    strokeWidth={emphasis === 'highlighted' ? 1.5 : 1}
                  />
                  <circle cx={spark.dot.x} cy={spark.dot.y} r={2} fill={color} />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
