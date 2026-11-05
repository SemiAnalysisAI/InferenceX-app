import type { Metadata } from 'next';

import SessionTimelineView from '@/components/agentic-workload-explorer/views/session-timeline-view';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'timeline', 'zh');
}

export default function ZhExplorerSessionTimelinePage() {
  return <SessionTimelineView />;
}
