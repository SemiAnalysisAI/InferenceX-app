import type { Metadata } from 'next';

import ModelsView from '@/components/agentic-workload-explorer/views/models-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/models', 'en');

export default function ExplorerModelsPage() {
  return <ModelsView />;
}
