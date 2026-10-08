import { getRpsTimeseries } from '@semianalysisai/inferencex-db/proxytrace/operations';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseModelFilter, parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

const RANGE_CONFIG = {
  '3h': { rangeHours: 3, bucketMinutes: 1 },
  '12h': { rangeHours: 12, bucketMinutes: 5 },
  '24h': { rangeHours: 24, bucketMinutes: 10 },
  '3d': { rangeHours: 72, bucketMinutes: 30 },
  '7d': { rangeHours: 168, bucketMinutes: 60 },
} as const;

type RangeKey = keyof typeof RANGE_CONFIG;

function parseRange(raw: string | null): RangeKey {
  if (raw && raw in RANGE_CONFIG) return raw as RangeKey;
  return '24h';
}

export const GET = withExplorerRoute(async ({ vis, req }) => {
  const range = parseRange(req.nextUrl.searchParams.get('range'));
  const filter = parseModelFilter(req.nextUrl.searchParams);
  if (filter instanceof Response) return filter;
  const { model } = filter;
  const traceVersion = parseTraceVersion(req.nextUrl.searchParams);
  const { rangeHours, bucketMinutes } = RANGE_CONFIG[range];

  const buckets = await getRpsTimeseries(rangeHours, bucketMinutes, vis, model, traceVersion);
  const bucketSeconds = bucketMinutes * 60;

  return {
    range,
    bucketMinutes,
    rangeHours,
    points: buckets.map((b) => ({
      bucket: b.bucket,
      requestCount: b.requestCount,
      rps: b.requestCount / bucketSeconds,
    })),
  };
});
