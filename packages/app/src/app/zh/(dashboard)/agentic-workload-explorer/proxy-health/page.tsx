import type { Metadata } from 'next';

import ProxyHealthView from '@/components/agentic-workload-explorer/views/proxy-health-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/proxy-health', 'zh');

export default function ZhExplorerProxyHealthPage() {
  return <ProxyHealthView />;
}
