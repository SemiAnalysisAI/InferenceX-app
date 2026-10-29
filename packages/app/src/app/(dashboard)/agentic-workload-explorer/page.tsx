import type { Metadata } from 'next';

import OverviewView from '@/components/agentic-workload-explorer/views/overview-view';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('agentic-workload-explorer');

export default function AgenticWorkloadExplorerPage() {
  return (
    <>
      <TabIntro tab="agentic-workload-explorer" />
      <OverviewView />
    </>
  );
}
