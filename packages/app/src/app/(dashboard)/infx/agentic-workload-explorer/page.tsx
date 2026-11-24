import type { Metadata } from 'next';

import OverviewView from '@/components/agentic-workload-explorer/views/overview-view';
import { tabMetadata } from '@/lib/routing/tab-meta';

export const metadata: Metadata = tabMetadata('agentic-workload-explorer');

export default function AgenticWorkloadExplorerPage() {
  return <OverviewView />;
}
