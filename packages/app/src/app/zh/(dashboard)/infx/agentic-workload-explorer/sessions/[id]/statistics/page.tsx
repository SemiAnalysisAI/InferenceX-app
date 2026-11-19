import type { Metadata } from 'next';

import SessionStatisticsView from '@/components/agentic-workload-explorer/views/session-statistics-view';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'statistics', 'zh');
}

export default function ZhExplorerSessionStatisticsPage() {
  return <SessionStatisticsView />;
}
