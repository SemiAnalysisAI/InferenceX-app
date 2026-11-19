import type { Metadata } from 'next';

import StreamingView from '@/components/agentic-workload-explorer/views/streaming-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/streaming', 'en');

export default function ExplorerStreamingPage() {
  return <StreamingView />;
}
