import type { Metadata } from 'next';

import OverviewView from '@/components/agentic-workload-explorer/views/overview-view';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('agentic-workload-explorer');

export default function ZhAgenticWorkloadExplorerPage() {
  return (
    <>
      <ZhTabIntro tab="agentic-workload-explorer" />
      <OverviewView />
    </>
  );
}
