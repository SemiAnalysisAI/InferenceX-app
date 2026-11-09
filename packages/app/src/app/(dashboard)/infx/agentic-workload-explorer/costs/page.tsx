import type { Metadata } from 'next';

import CostsView from '@/components/agentic-workload-explorer/views/costs-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/costs', 'en');

export default function ExplorerCostsPage() {
  return <CostsView />;
}
