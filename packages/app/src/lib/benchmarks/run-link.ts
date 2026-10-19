import { agenticDetailHref } from '@/lib/agentx/agentic-detail-link';
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import type { Locale } from '@/lib/i18n/i18n';

/** Resolve presentation links without replacing run URLs used as source identities. */
export function pointRunLink(
  runUrl: string | null | undefined,
  point: { id?: number; hwKey?: string; hardware?: string; benchmark_type?: string },
  locale: Locale = 'en',
): { href: string; isLog: boolean } | null {
  if (!runUrl) return null;
  if (!(point.hardware ?? point.hwKey)?.startsWith('tpu')) return { href: runUrl, isLog: false };
  // Unofficial overlays have no persisted point or stored logs.
  if (!isPersistedBenchmarkId(point.id)) return null;
  const href =
    point.benchmark_type === 'agentic_traces'
      ? agenticDetailHref(point.id, locale)
      : `${locale === 'zh' ? '/zh' : ''}/inference/logs/${point.id}`;
  return {
    href:
      point.benchmark_type === 'agentic_traces'
        ? `${href}${href.includes('?') ? '&' : '?'}view=logs`
        : href,
    isLog: true,
  };
}
