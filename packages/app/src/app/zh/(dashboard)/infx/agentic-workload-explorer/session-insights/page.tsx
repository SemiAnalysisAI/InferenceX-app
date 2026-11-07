import type { Metadata } from 'next';

import SessionInsightsView from '@/components/agentic-workload-explorer/views/session-insights-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/session-insights', 'zh');

export default function ZhExplorerSessionInsightsPage() {
  return <SessionInsightsView />;
}
