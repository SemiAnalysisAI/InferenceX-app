import type { Metadata } from 'next';

import SessionsView from '@/components/agentic-workload-explorer/views/sessions-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/sessions', 'zh');

export default function ZhExplorerSessionsPage() {
  return <SessionsView />;
}
