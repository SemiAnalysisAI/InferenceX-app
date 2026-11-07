import type { Metadata } from 'next';

import GraphsView from '@/components/agentic-workload-explorer/views/graphs-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/graphs', 'zh');

export default function ZhExplorerGraphsPage() {
  return <GraphsView />;
}
