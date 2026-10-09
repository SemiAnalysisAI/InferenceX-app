import type { Metadata } from 'next';

import SessionFlowView from '@/components/agentic-workload-explorer/views/session-flow-view';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'flow', 'zh');
}

export default function ZhExplorerSessionFlowPage() {
  return <SessionFlowView />;
}
