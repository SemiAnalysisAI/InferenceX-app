import type { Metadata } from 'next';

import SessionPrefillVsDecodeView from '@/components/agentic-workload-explorer/views/session-prefill-vs-decode-view';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'prefill-vs-decode', 'en');
}

export default function ExplorerSessionPrefillVsDecodePage() {
  return <SessionPrefillVsDecodeView />;
}
