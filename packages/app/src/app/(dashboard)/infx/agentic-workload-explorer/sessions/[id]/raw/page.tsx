import type { Metadata } from 'next';

import SessionRawView from '@/components/agentic-workload-explorer/views/session-raw-view';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'raw', 'en');
}

export default function ExplorerSessionRawPage() {
  return <SessionRawView />;
}
