import { isPublicModel } from '@semianalysisai/inferencex-db/proxytrace/shared/pricing';
import { CURRENT_TRACE_VERSION } from '@semianalysisai/inferencex-db/proxytrace/shared/trace';

const DEFAULT_PAGINATION = { limit: 50, maxLimit: 500 };

export function parsePagination(
  searchParams: URLSearchParams,
  defaults: { limit: number; maxLimit?: number } = DEFAULT_PAGINATION,
): { limit: number; offset: number } {
  const maxLimit = defaults.maxLimit ?? 500;
  const rawLimit = parseInt(searchParams.get('limit') || String(defaults.limit), 10);
  const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
  return {
    limit: Math.max(1, Math.min(Number.isNaN(rawLimit) ? defaults.limit : rawLimit, maxLimit)),
    offset: Math.max(0, Number.isNaN(rawOffset) ? 0 : rawOffset),
  };
}

export function parseTraceVersion(searchParams: URLSearchParams): number | null {
  const raw = searchParams.get('version');
  if (raw === null || raw === 'all') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > CURRENT_TRACE_VERSION) return null;
  return n;
}

export function parseModelFilter(
  searchParams: URLSearchParams,
): { model: string | null } | Response {
  const raw = searchParams.get('model');
  if (!raw) return { model: null };
  if (isPublicModel(raw)) return { model: raw };
  return Response.json(
    { error: 'Unknown model' },
    { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
