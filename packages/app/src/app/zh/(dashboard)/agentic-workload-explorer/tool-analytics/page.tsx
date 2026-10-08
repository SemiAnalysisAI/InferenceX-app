import type { Metadata } from 'next';

import ToolAnalyticsView from '@/components/agentic-workload-explorer/views/tool-analytics-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/tool-analytics', 'zh');

export default function ZhExplorerToolAnalyticsPage() {
  return <ToolAnalyticsView />;
}
