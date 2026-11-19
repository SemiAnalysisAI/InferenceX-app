import { getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import { dailyHarnessVersionMix } from '@semianalysisai/inferencex-db/proxytrace/trends';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

export const GET = withExplorerRoute(({ vis, req }) =>
  dailyHarnessVersionMix(getDb(), vis, parseTraceVersion(req.nextUrl.searchParams)),
);
