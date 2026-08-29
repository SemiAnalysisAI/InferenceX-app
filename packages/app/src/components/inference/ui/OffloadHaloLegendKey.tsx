import { POINT_SIZE } from '@/lib/chart-rendering';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';

export const OFFLOAD_HALO_RADIUS = POINT_SIZE + 4;
export const OFFLOAD_HALO_STROKE_WIDTH = 1.5;
export const OFFLOAD_HALO_DASHARRAY = '3 2';

export function offloadHaloLabel(locale: Locale): string {
  return locale === 'zh' ? 'KV offload 已开启' : 'KV offload ON';
}

/**
 * Key for the dashed ring drawn around agentic points that use KV-cache
 * offload. Rendered in the axis-metric info footer below the chart (the
 * footer is `no-export`, so downloaded PNGs carry only the halo itself).
 */
export function OffloadHaloLegendKey() {
  const locale = useLocale();
  return (
    <div
      data-testid="offload-halo-key"
      className="flex w-full items-center gap-2 px-1 pr-2 text-xs text-muted-foreground"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 20 20"
        className="shrink-0"
        style={{ maxWidth: 16 }}
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r={POINT_SIZE} fill="currentColor" opacity="0.45" />
        <circle
          cx="10"
          cy="10"
          r={OFFLOAD_HALO_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={OFFLOAD_HALO_STROKE_WIDTH}
          strokeDasharray={OFFLOAD_HALO_DASHARRAY}
        />
      </svg>
      <span className="min-w-0 leading-tight">{offloadHaloLabel(locale)}</span>
    </div>
  );
}
