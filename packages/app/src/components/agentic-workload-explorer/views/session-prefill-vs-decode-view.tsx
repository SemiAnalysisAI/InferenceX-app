'use client';

import { useSession } from '@/lib/agentic-workload-explorer/session-context';
import { buildStatRows } from '@/lib/agentic-workload-explorer/stat-rows';
import { LatencyWaterfall } from '@/components/agentic-workload-explorer/latency-waterfall';

export default function PrefillVsDecodePage() {
  const { requests } = useSession();
  const rows = buildStatRows(requests);

  return <LatencyWaterfall rows={rows} />;
}
