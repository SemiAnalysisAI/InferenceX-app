import type { Metadata } from 'next';

import SessionRadixTreeView from '@/components/agentic-workload-explorer/views/session-radix-tree-view';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'radix-tree', 'zh');
}

export default function ZhExplorerSessionRadixTreePage() {
  return <SessionRadixTreeView />;
}
