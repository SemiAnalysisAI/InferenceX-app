import type { Metadata } from 'next';

import SessionConversationView from '@/components/agentic-workload-explorer/views/session-conversation-view';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'conversation', 'en');
}

export default function ExplorerSessionConversationPage() {
  return <SessionConversationView />;
}
