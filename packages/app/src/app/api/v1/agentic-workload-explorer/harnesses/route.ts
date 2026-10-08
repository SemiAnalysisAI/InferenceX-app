import { getDb } from '@semianalysisai/inferencex-db/proxytrace/connection';
import { getHarnessProfile } from '@semianalysisai/inferencex-db/proxytrace/harnesses';
import { withExplorerRoute } from '@/lib/agentic-workload-explorer/api';
import { parseTraceVersion } from '@/lib/agentic-workload-explorer/request';

export const GET = withExplorerRoute(({ vis, req }) =>
  getHarnessProfile(getDb(), vis, parseTraceVersion(req.nextUrl.searchParams)),
);
