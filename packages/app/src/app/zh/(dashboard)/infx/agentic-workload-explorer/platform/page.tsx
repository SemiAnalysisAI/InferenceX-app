import type { Metadata } from 'next';

import PlatformView from '@/components/agentic-workload-explorer/views/platform-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/platform', 'zh');

export default function ZhExplorerPlatformPage() {
  return <PlatformView />;
}
