import type { Metadata } from 'next';

import TrendsView from '@/components/agentic-workload-explorer/views/trends-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/trends', 'zh');

export default function ZhExplorerTrendsPage() {
  return <TrendsView />;
}
