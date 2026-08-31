import { POINT_SIZE } from '@/lib/chart-rendering';
import { useLocale } from '@/lib/use-locale';

// Nested outside the KV-offload halo (POINT_SIZE + 4, '3 2' dashes) with a
// dotted dasharray so both decorations stay legible on one point.
export const LEGACY_POWER_RING_RADIUS = POINT_SIZE + 7;
export const LEGACY_POWER_RING_STROKE_WIDTH = 1.5;
export const LEGACY_POWER_RING_DASHARRAY = '1 3';

const STRINGS = {
  en: 'Historical measurement (not validated under the current method)',
  zh: '历史测量（尚未按当前方法验证）',
} as const;

/**
 * Key for the dotted ring drawn around measured-axis points whose power
 * telemetry predates the producer validation contract (`power_tier ===
 * 'legacy'`). Rendered in the axis-metric info footer below the chart (the
 * footer is `no-export`, so downloaded PNGs carry only the ring itself).
 */
export function LegacyPowerLegendKey() {
  const locale = useLocale();

  return (
    <div
      data-testid="legacy-power-key"
      className="flex w-full items-center gap-2 px-1 pr-2 text-xs text-muted-foreground"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        className="shrink-0"
        style={{ maxWidth: 16 }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r={POINT_SIZE} fill="currentColor" opacity="0.45" />
        <circle
          cx="12"
          cy="12"
          r={LEGACY_POWER_RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={LEGACY_POWER_RING_STROKE_WIDTH}
          strokeDasharray={LEGACY_POWER_RING_DASHARRAY}
        />
      </svg>
      <span className="min-w-0 leading-tight">{STRINGS[locale]}</span>
    </div>
  );
}
