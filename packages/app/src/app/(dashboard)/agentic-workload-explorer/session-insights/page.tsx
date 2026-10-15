import type { Metadata } from 'next';

import SessionInsightsView from '@/components/agentic-workload-explorer/views/session-insights-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/session-insights', 'en');

export default function ExplorerSessionInsightsPage() {
  return <SessionInsightsView />;
}
