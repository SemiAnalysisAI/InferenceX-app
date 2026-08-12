import { POINT_SIZE } from '@/lib/chart-rendering';

export const OFFLOAD_HALO_RADIUS = POINT_SIZE + 4;
export const OFFLOAD_HALO_STROKE_WIDTH = 1.5;
export const OFFLOAD_HALO_DASHARRAY = '3 2';

/**
 * Legend key for the dashed ring drawn around agentic points that use KV-cache
 * offload. This stays outside `no-export` content so the chart export clone
 * carries the same explanation into downloaded PNGs.
 */
export function OffloadHaloLegendKey() {
  return (
    <div
      data-testid="offload-halo-key"
      className="mt-2 flex w-full items-center gap-2 px-1 pr-2 text-xs text-muted-foreground"
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
      <span className="min-w-0 leading-tight">KV offload ON</span>
    </div>
  );
}
