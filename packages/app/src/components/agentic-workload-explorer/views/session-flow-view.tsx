'use client';

import { useMemo } from 'react';
import { useSession } from '@/lib/agentic-workload-explorer/session-context';
import { buildConversationTree } from '@/components/agentic-workload-explorer/conversation-view';
import { SessionDAG } from '@/components/agentic-workload-explorer/session-dag';

export default function FlowPage() {
  const { requests } = useSession();
  const tree = useMemo(() => buildConversationTree(requests), [requests]);

  return <SessionDAG nodes={tree} />;
}
