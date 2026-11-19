'use client';

import { useParams } from 'next/navigation';
import { useSession } from '@/lib/agentic-workload-explorer/session-context';
import { buildStatRows } from '@/lib/agentic-workload-explorer/stat-rows';
import { TokenFlamegraph } from '@/components/agentic-workload-explorer/token-flamegraph';

export default function FlamegraphPage() {
  const { id } = useParams<{ id: string }>();
  const { requests } = useSession();
  const rows = buildStatRows(requests);

  return <TokenFlamegraph rows={rows} sessionId={id} />;
}
