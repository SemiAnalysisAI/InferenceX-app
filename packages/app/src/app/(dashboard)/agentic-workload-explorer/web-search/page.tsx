import type { Metadata } from 'next';

import WebSearchView from '@/components/agentic-workload-explorer/views/web-search-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/web-search', 'en');

export default function ExplorerWebSearchPage() {
  return <WebSearchView />;
}
