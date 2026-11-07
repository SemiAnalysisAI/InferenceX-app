import type { Metadata } from 'next';

import ErrorsView from '@/components/agentic-workload-explorer/views/errors-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/errors', 'en');

export default function ExplorerErrorsPage() {
  return <ErrorsView />;
}
