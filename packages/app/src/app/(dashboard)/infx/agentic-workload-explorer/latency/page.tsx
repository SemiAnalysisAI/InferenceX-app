import type { Metadata } from 'next';

import LatencyView from '@/components/agentic-workload-explorer/views/latency-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/latency', 'en');

export default function ExplorerLatencyPage() {
  return <LatencyView />;
}
