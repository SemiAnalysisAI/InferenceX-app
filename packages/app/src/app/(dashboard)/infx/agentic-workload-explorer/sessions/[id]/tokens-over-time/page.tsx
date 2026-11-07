import type { Metadata } from 'next';

import SessionTokensOverTimeView from '@/components/agentic-workload-explorer/views/session-tokens-over-time-view';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'tokens-over-time', 'en');
}

export default function ExplorerSessionTokensOverTimePage() {
  return <SessionTokensOverTimeView />;
}
