import { POINT_SIZE } from '@/lib/chart-rendering';
import { useLocale } from '@/lib/use-locale';

export const SPEC_DECODE_MARKER_SIZE = POINT_SIZE + 1.5;
export const SPEC_DECODE_MARKER_STROKE_WIDTH = 1.5;
export const SPEC_DECODE_MARKER_DASHARRAY = '2 1.5';
export const SPEC_DECODE_MARKER_PATH = `M ${-SPEC_DECODE_MARKER_SIZE} 0 H ${SPEC_DECODE_MARKER_SIZE} M 0 ${-SPEC_DECODE_MARKER_SIZE} V ${SPEC_DECODE_MARKER_SIZE}`;

interface SpecDecodePoint {
  benchmark_type?: string | null;
  spec_decoding?: string | null;
}

/** True only for agentic points that actually use a speculative decode method. */
export function hasAgenticSpecDecoding(point: SpecDecodePoint): boolean {
  if (point.benchmark_type !== 'agentic_traces') return false;
  const method = point.spec_decoding?.trim().toLowerCase();
  return Boolean(method && method !== 'none');
}

const STRINGS = {
  en: {
    marker: 'Dashed +:',
    meaning: 'Speculative decoding',
  },
  zh: {
    marker: '虚线 +：',
    meaning: '推测解码',
  },
} as const;

/** Legend key for the dashed plus drawn over agentic speculative-decoding points. */
export function SpecDecodeLegendKey() {
  const locale = useLocale();
  const t = STRINGS[locale];

  return (
    <div
      data-testid="spec-decode-marker-key"
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
        <path
          d={`M ${10 - SPEC_DECODE_MARKER_SIZE} 10 H ${10 + SPEC_DECODE_MARKER_SIZE} M 10 ${10 - SPEC_DECODE_MARKER_SIZE} V ${10 + SPEC_DECODE_MARKER_SIZE}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={SPEC_DECODE_MARKER_STROKE_WIDTH}
          strokeDasharray={SPEC_DECODE_MARKER_DASHARRAY}
          strokeLinecap="round"
        />
      </svg>
      <span className="min-w-0 leading-tight">
        <span className="block">{t.marker}</span>
        <span className="block">{t.meaning}</span>
      </span>
    </div>
  );
}
