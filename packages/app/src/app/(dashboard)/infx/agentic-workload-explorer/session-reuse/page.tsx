import type { Metadata } from 'next';

import SessionReuseView from '@/components/agentic-workload-explorer/views/session-reuse-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/session-reuse', 'en');

export default function ExplorerSessionReusePage() {
  return <SessionReuseView />;
}
