import type { Metadata } from 'next';

import SessionFlamegraphView from '@/components/agentic-workload-explorer/views/session-flamegraph-view';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'flamegraph', 'en');
}

export default function ExplorerSessionFlamegraphPage() {
  return <SessionFlamegraphView />;
}
