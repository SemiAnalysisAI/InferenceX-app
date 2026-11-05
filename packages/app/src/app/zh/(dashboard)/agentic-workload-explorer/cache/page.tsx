import type { Metadata } from 'next';

import CacheView from '@/components/agentic-workload-explorer/views/cache-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/cache', 'zh');

export default function ZhExplorerCachePage() {
  return <CacheView />;
}
