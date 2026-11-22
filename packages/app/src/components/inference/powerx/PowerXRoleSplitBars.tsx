'use client';

import * as d3 from 'd3';
import { useId, useMemo } from 'react';

import type { InferenceData } from '@/components/inference/types';
import ChartLegend from '@/components/ui/chart-legend';
import { EmptyState } from '@/components/ui/empty-state';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getInferenceHardwareConfig } from '@/lib/benchmarks/inference-labels';
import { getChartWatermark } from '@/lib/catalog/data-mappings';
import { overlayRunColor, overlayRunIndex } from '@/lib/charts/overlay-run-style';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import type {
  CustomLayerConfig,
  HorizontalBarLayerConfig,
  RenderContext,
  TooltipConfig,
} from '@/lib/d3-chart/D3Chart/types';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { getDisplayLabel } from '@/lib/shared/utils';
import { useUnofficialRun } from '@/providers/unofficial-run-provider';

import { roleSplitRows, type RoleSplitRow, type RoleSplitUnsplitChip } from './powerx-role-split';

const STRINGS = {
  en: {
    title: 'GPU energy per output token, prefill vs decode',
    pinned:
      'Per output token is the one denominator both pools share, so prefill + decode adds up to the measured total.',
    prefill: 'Prefill',
    decode: 'Decode',
    rowLabel: (x: string, unit: string, conc: number, p: number, d: number) =>
      `${x} ${unit} / c${conc} · ${p} prefill + ${d} decode GPUs`,
    share: (pct: number, role: 'prefill' | 'decode') => `${pct}% ${role}`,
    overlay: 'unofficial run',
    aggregated: (chip: string) =>
      `${chip} is listed but not split: it runs aggregated, so every GPU does both prefill and decode.`,
    noTelemetry: (chip: string) =>
      `${chip} is listed but not split: this run reports no per-pool energy.`,
    empty: 'No disaggregated run with prefill and decode telemetry matches these filters.',
    jPerToken: 'J / output token',
    split: 'Share of GPU energy per output token',
  },
  zh: {
    title: '每输出 token 的 GPU 能耗：预填充与解码',
    pinned: '每输出 token 是两个 GPU 池共用的唯一分母，因此预填充 + 解码等于实测总能耗。',
    prefill: '预填充',
    decode: '解码',
    rowLabel: (x: string, unit: string, conc: number, p: number, d: number) =>
      `${x} ${unit} / 并发 ${conc} · ${p} 个预填充 + ${d} 个解码 GPU`,
    share: (pct: number, role: 'prefill' | 'decode') =>
      `${role === 'prefill' ? '预填充' : '解码'} ${pct}%`,
    overlay: '非官方运行',
    aggregated: (name: string) =>
      `${name} 已列出但未拆分：它以聚合方式运行，每个 GPU 同时承担预填充和解码。`,
    noTelemetry: (name: string) => `${name} 已列出但未拆分：该运行没有报告各 GPU 池的能耗。`,
    empty: '当前筛选条件下没有带预填充和解码遥测数据的分离式运行。',
    jPerToken: 'J / 输出 token',
    split: '每输出 token GPU 能耗占比',
  },
} satisfies Record<Locale, unknown>;

/** Same dash language as the role lines: prefill dashed, decode dotted. */
const ROLE_DASH = { prefill: '4 2', decode: '1.5 1.5' } as const;
type Role = keyof typeof ROLE_DASH;

/** Row geometry: label line, 16 px bar, share line. */
const ROW_STEP = 56;
const BAR_HEIGHT = 16;
const MARGIN = { top: 4, right: 8, bottom: 36, left: 8 };
/** Rough 11 px text width, to keep the label clear of the right-side totals. */
const LABEL_CHAR_PX = 6;

/** One stacked segment: a row's prefill or decode share of its own 100%. */
interface RoleSegment {
  rowKey: string;
  role: Role;
  x0: number;
  share: number;
  joules: number;
  row: RoleSplitRow;
}

interface RoleRowDatum {
  key: string;
  row: RoleSplitRow;
  label: string;
  totals: string;
  prefillLabel: string;
  decodeLabel: string;
}

export function formatRoleJoules(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  return abs >= 0.1 || abs === 0 ? value.toFixed(2) : value.toPrecision(2);
}

function formatX(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Math.abs(value) >= 10 ? String(Math.round(value)) : value.toFixed(1);
}

function defaultHardwareLabel(point: InferenceData): string {
  return getDisplayLabel(getInferenceHardwareConfig(point.hwKey, point.model, [point]));
}

export interface PowerXRoleSplitBarsProps {
  /** Official rows (base rows; role clones are ignored). */
  points: readonly InferenceData[];
  /** `?unofficialrun=` overlay rows, drawn in the run's overlay color. */
  overlayPoints?: readonly InferenceData[];
  /** Unit after each point's `x` in the row label. Default `tok/s/user`. */
  xUnit?: string;
  /** Chip name for a group. Defaults to the hardware display label (e.g. "MI355X (SGLang)"). */
  hardwareLabel?: (point: InferenceData) => string;
}

export default function PowerXRoleSplitBars({
  points,
  overlayPoints = [],
  xUnit = 'tok/s/user',
  hardwareLabel = defaultHardwareLabel,
}: PowerXRoleSplitBarsProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const legendScope = `powerx-role-split-${useId().replaceAll(/[^a-zA-Z0-9_-]/g, '_')}`;
  const { runIndexByUrl, isUnofficialRun } = useUnofficialRun();
  const { groups, unsplit } = useMemo(
    () => roleSplitRows(points, overlayPoints),
    [points, overlayPoints],
  );
  const hwKeys = useMemo(() => [...new Set(groups.map((group) => group.hwKey))], [groups]);
  const { resolveColor } = useThemeColors({
    highContrast: false,
    identifiers: hwKeys,
    activeKeys: hwKeys,
  });
  const colorOf = (overlay: boolean, hwKey: string, runUrl?: string) =>
    overlay ? overlayRunColor(overlayRunIndex(runUrl, runIndexByUrl)) : resolveColor(hwKey);
  const chipName = (point: InferenceData, overlay: boolean) =>
    overlay ? `${hardwareLabel(point)} · ${t.overlay}` : hardwareLabel(point);
  const unsplitText = (chip: RoleSplitUnsplitChip) =>
    chip.reason === 'aggregated'
      ? t.aggregated(chipName(chip.point, chip.overlay))
      : t.noTelemetry(chipName(chip.point, chip.overlay));

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="powerx-role-split-bars">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{t.title}</p>
        <p className="text-xs text-muted-foreground">{t.pinned}</p>
        <div className="w-fit" data-testid="powerx-role-split-key">
          <ChartLegend
            variant="sidebar"
            readOnly
            collapsible={false}
            disableActiveSort
            hideAtomFootnote
            isLegendExpanded
            onExpandedChange={() => {}}
            legendItems={(['prefill', 'decode'] as const).map((role) => ({
              name: role,
              label: role === 'prefill' ? t.prefill : t.decode,
              color: 'var(--muted-foreground)',
              lineDasharray: ROLE_DASH[role],
              forceLineSwatch: true,
              isActive: true,
              onClick: () => {},
              idScope: legendScope,
            }))}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState bare className="py-6" data-testid="powerx-role-split-empty">
          {t.empty}
        </EmptyState>
      ) : null}

      {groups.map((group, groupIndex) => {
        const color = colorOf(group.overlay, group.hwKey, group.runUrl);
        const name = chipName(group.rows[0].point, group.overlay);
        return (
          <section
            key={group.key}
            className="flex min-w-0 flex-col gap-2"
            data-testid="powerx-role-split-group"
          >
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <span
                aria-hidden
                className="inline-block size-2.5 shrink-0 rounded-full"
                style={{ background: color }}
              />
              <span className="min-w-0 break-words">{name}</span>
            </h4>
            <RoleSplitChart
              chartId={`${legendScope}-${groupIndex}`}
              name={name}
              color={color}
              watermark={getChartWatermark(isUnofficialRun)}
              rows={group.rows.map((row, index) => ({
                key: `${row.point.x}-${row.point.conc}-${index}`,
                row,
                label: t.rowLabel(
                  formatX(row.point.x),
                  xUnit,
                  row.point.conc,
                  row.prefillGpus,
                  row.decodeGpus,
                ),
                totals: `${formatRoleJoules(row.measuredJ)} J / ${formatRoleJoules(row.prefillJ)} + ${formatRoleJoules(row.decodeJ)} J`,
                prefillLabel: t.share(Math.round(row.prefillShare * 100), 'prefill'),
                decodeLabel: t.share(100 - Math.round(row.prefillShare * 100), 'decode'),
              }))}
              strings={t}
            />
          </section>
        );
      })}

      {unsplit.length > 0 ? (
        <ul className="flex flex-col gap-1 opacity-60" data-testid="powerx-role-split-unsplit">
          {unsplit.map((chip) => (
            <li
              key={chip.key}
              className="flex items-start gap-2 text-xs text-muted-foreground"
              data-reason={chip.reason}
            >
              <span
                aria-hidden
                className="mt-1 inline-block size-2 shrink-0 rounded-full"
                style={{ background: colorOf(chip.overlay, chip.hwKey, chip.runUrl) }}
              />
              <span className="min-w-0 break-words">{unsplitText(chip)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * One chip's rows as a stacked bar chart. Each bar is its own 100%: the split is the reading,
 * the absolute J is the label above. One shared scale let a single outlier shrink every other
 * bar to a few pixels.
 */
function RoleSplitChart({
  chartId,
  name,
  color,
  watermark,
  rows,
  strings: t,
}: {
  chartId: string;
  name: string;
  color: string;
  watermark: 'logo' | 'unofficial';
  rows: RoleRowDatum[];
  strings: (typeof STRINGS)[Locale];
}) {
  const segments: RoleSegment[] = rows.flatMap(({ key, row }) => {
    const prefill = Math.min(1, Math.max(0, row.prefillShare));
    return [
      { rowKey: key, role: 'prefill', x0: 0, share: prefill, joules: row.prefillJ, row },
      { rowKey: key, role: 'decode', x0: prefill, share: 1 - prefill, joules: row.decodeJ, row },
    ];
  });
  const hatchId = `${chartId}-prefill-hatch`;
  const padding = 1 - BAR_HEIGHT / ROW_STEP;

  const defsLayer: CustomLayerConfig = {
    type: 'custom',
    key: 'role-split-defs',
    render: (group) => {
      const pattern = group
        .selectAll<SVGPatternElement, string>('pattern.role-split-hatch')
        .data([hatchId])
        .join((enter) => {
          const created = enter
            .append('pattern')
            .attr('class', 'role-split-hatch')
            .attr('patternUnits', 'userSpaceOnUse')
            .attr('width', 6)
            .attr('height', 6)
            .attr('patternTransform', 'rotate(45)');
          created.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6);
          return created;
        })
        .attr('id', (d) => d);
      pattern
        .select('line')
        .attr('stroke', color)
        .attr('stroke-opacity', 0.45)
        .attr('stroke-width', 3);
    },
  };

  // The run label and its J totals above each bar, the two shares under it.
  const labelsLayer: CustomLayerConfig = {
    type: 'custom',
    key: 'role-split-rows',
    render: (group, ctx: RenderContext) => {
      const yScale = ctx.yScale as d3.ScaleBand<string>;
      group
        .selectAll<SVGGElement, RoleRowDatum>('g.role-split-row')
        .data(rows, (d) => d.key)
        .join('g')
        .attr('class', 'role-split-row')
        .attr('data-testid', 'powerx-role-split-row')
        .attr('role', 'img')
        .attr('aria-label', (d) => `${d.label}: ${d.totals}, ${d.prefillLabel}, ${d.decodeLabel}`)
        .each(function (d) {
          const g = d3.select(this);
          g.selectAll('*').remove();
          const barTop = yScale(d.key) ?? 0;
          const totalsWidth = d.totals.length * LABEL_CHAR_PX + 12;
          const maxChars = Math.max(8, Math.floor((ctx.width - totalsWidth) / LABEL_CHAR_PX));
          const label = d.label.length > maxChars ? `${d.label.slice(0, maxChars - 1)}…` : d.label;
          const labelText = g
            .append('text')
            .attr('y', barTop - 6)
            .attr('font-size', 11)
            .attr('fill', 'var(--muted-foreground)')
            .text(label);
          if (label !== d.label) labelText.append('title').text(d.label);
          g.append('text')
            .attr('x', ctx.width)
            .attr('y', barTop - 6)
            .attr('text-anchor', 'end')
            .attr('font-size', 11)
            .attr('font-weight', 500)
            .attr('fill', 'var(--foreground)')
            .text(d.totals);
          const below = barTop + BAR_HEIGHT + 13;
          g.append('text')
            .attr('y', below)
            .attr('font-size', 10)
            .attr('fill', 'var(--muted-foreground)')
            .text(d.prefillLabel);
          g.append('text')
            .attr('x', d.prefillLabel.length * 5.5 + 12)
            .attr('y', below)
            .attr('font-size', 10)
            .attr('fill', 'var(--muted-foreground)')
            .text(d.decodeLabel);
        });
    },
  };

  const barLayer: HorizontalBarLayerConfig<RoleSegment> = {
    type: 'horizontalBar',
    key: 'role-split-bars',
    data: segments,
    config: {
      getY: (d) => d.rowKey,
      getX: (d) => d.share,
      getX0: (d) => d.x0,
      getColor: (d) =>
        d.role === 'prefill' ? `url(#${hatchId})` : `color-mix(in srgb, ${color} 40%, transparent)`,
      stroke: color,
      strokeWidth: 2,
      getStrokeDasharray: (d) => ROLE_DASH[d.role],
      opacity: 1,
      rx: 2,
      getAttrs: (d) => ({
        'data-testid': 'powerx-role-split-segment',
        'data-role': d.role,
        'data-share': (d.share * 100).toFixed(1),
      }),
      keyFn: (d) => `${d.rowKey}|${d.role}`,
    },
  };

  const tooltip: TooltipConfig<RoleSegment> = {
    rulerType: 'none',
    attachToLayer: 2,
    content: (d) =>
      chartHoverCard({
        title: name,
        subtitle: d.role === 'prefill' ? t.prefill : t.decode,
        color,
        metrics: [
          { value: formatRoleJoules(d.joules), label: t.jPerToken },
          { value: `${Math.round(d.share * 100)}%`, label: t.split },
        ],
        summary: rows.find((row) => row.key === d.rowKey)?.label,
      }),
  };

  return (
    <D3Chart<RoleSegment>
      chartId={chartId}
      testId="powerx-role-split-chart"
      data={segments}
      height={Math.round(ROW_STEP * (rows.length + padding) + MARGIN.top + MARGIN.bottom)}
      margin={MARGIN}
      watermark={watermark}
      clipContent={false}
      grabCursor={false}
      xScale={{ type: 'linear', domain: [0, 1] }}
      yScale={{ type: 'band', domain: rows.map((row) => row.key), padding }}
      xAxis={{ label: t.split, tickCount: 5, tickFormat: (d) => `${Math.round(Number(d) * 100)}%` }}
      yAxis={{
        grid: false,
        tickFormat: () => '',
        customize: (axis) => {
          axis.selectAll('.tick').remove();
        },
      }}
      layers={[defsLayer, labelsLayer, barLayer]}
      tooltip={tooltip}
    />
  );
}
