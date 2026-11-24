'use client';

import { useMemo } from 'react';

import type { InferenceData } from '@/components/inference/types';
import { useThemeColors } from '@/hooks/useThemeColors';
import { getInferenceHardwareConfig } from '@/lib/benchmarks/inference-labels';
import { overlayRunColor, overlayRunIndex } from '@/lib/charts/overlay-run-style';
import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';
import { getDisplayLabel } from '@/lib/shared/utils';
import { useUnofficialRun } from '@/providers/unofficial-run-provider';

import {
  roleSplitRows,
  roleSplitScaleMax,
  type RoleSplitRow,
  type RoleSplitUnsplitChip,
} from './powerx-role-split';

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
  },
} satisfies Record<Locale, unknown>;

/** Same dash language as the role lines: prefill dashed, decode dotted. */
const PREFILL_BORDER = 'dashed';
const DECODE_BORDER = 'dotted';

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
  const { runIndexByUrl } = useUnofficialRun();
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
  const scaleMax = roleSplitScaleMax(groups);
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
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-5 rounded-sm border-2 border-current"
              style={{ borderStyle: PREFILL_BORDER }}
            />
            {t.prefill}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-5 rounded-sm border-2 border-current"
              style={{ borderStyle: DECODE_BORDER }}
            />
            {t.decode}
          </span>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="powerx-role-split-empty">
          {t.empty}
        </p>
      ) : null}

      {groups.map((group) => {
        const color = colorOf(group.overlay, group.hwKey, group.runUrl);
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
              <span className="min-w-0 break-words">
                {chipName(group.rows[0].point, group.overlay)}
              </span>
            </h4>
            <ul className="flex min-w-0 flex-col gap-2.5">
              {group.rows.map((row, index) => (
                <RoleSplitBar
                  key={`${row.point.x}-${row.point.conc}-${index}`}
                  row={row}
                  color={color}
                  scaleMax={scaleMax}
                  label={t.rowLabel(
                    formatX(row.point.x),
                    xUnit,
                    row.point.conc,
                    row.prefillGpus,
                    row.decodeGpus,
                  )}
                  share={t.share}
                />
              ))}
            </ul>
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

function RoleSplitBar({
  row,
  color,
  scaleMax,
  label,
  share,
}: {
  row: RoleSplitRow;
  color: string;
  scaleMax: number;
  label: string;
  share: (pct: number, role: 'prefill' | 'decode') => string;
}) {
  const prefillPct = Math.round(row.prefillShare * 100);
  const decodePct = 100 - prefillPct;
  const width = (value: number) => (scaleMax > 0 ? `${(value / scaleMax) * 100}%` : '0%');
  const totals = `${formatRoleJoules(row.measuredJ)} J / ${formatRoleJoules(row.prefillJ)} + ${formatRoleJoules(row.decodeJ)} J`;
  const prefillLabel = share(prefillPct, 'prefill');
  const decodeLabel = share(decodePct, 'decode');
  return (
    <li className="flex min-w-0 flex-col gap-1" data-testid="powerx-role-split-row">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
        <span className="min-w-0 break-words text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{totals}</span>
      </div>
      <div
        role="img"
        aria-label={`${label}: ${totals}, ${prefillLabel}, ${decodeLabel}`}
        className="flex h-4 w-full min-w-0"
      >
        <div
          data-role="prefill"
          className="h-full shrink-0 rounded-l-sm border-2"
          style={{
            width: width(row.prefillJ),
            borderColor: color,
            borderStyle: PREFILL_BORDER,
            background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 45%, transparent) 0 3px, transparent 3px 6px)`,
          }}
        />
        <div
          data-role="decode"
          className="h-full shrink-0 rounded-r-sm border-2 border-l-0"
          style={{
            width: width(row.decodeJ),
            borderColor: color,
            borderStyle: DECODE_BORDER,
            background: `color-mix(in srgb, ${color} 40%, transparent)`,
          }}
        />
      </div>
      <div className="flex flex-wrap gap-x-3 text-2xs tabular-nums text-muted-foreground">
        <span>{prefillLabel}</span>
        <span>{decodeLabel}</span>
      </div>
    </li>
  );
}
