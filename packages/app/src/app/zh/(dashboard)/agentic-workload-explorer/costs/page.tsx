import type { Metadata } from 'next';

import CostsView from '@/components/agentic-workload-explorer/views/costs-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/costs', 'zh');

export default function ZhExplorerCostsPage() {
  return <CostsView />;
}
