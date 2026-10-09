import type { Metadata } from 'next';

import HarnessesView from '@/components/agentic-workload-explorer/views/harnesses-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/harnesses', 'en');

export default function ExplorerHarnessesPage() {
  return <HarnessesView />;
}
