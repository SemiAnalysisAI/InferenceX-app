import type { Metadata } from 'next';

import OverviewView from '@/components/agentic-workload-explorer/views/overview-view';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('agentic-workload-explorer');

export default function ZhAgenticWorkloadExplorerPage() {
  return <OverviewView />;
}
