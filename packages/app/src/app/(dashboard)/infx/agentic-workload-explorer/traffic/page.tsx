import type { Metadata } from 'next';

import TrafficView from '@/components/agentic-workload-explorer/views/traffic-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/traffic', 'en');

export default function ExplorerTrafficPage() {
  return <TrafficView />;
}
