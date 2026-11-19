'use client';

import { useSession } from '@/lib/agentic-workload-explorer/session-context';
import { AgentTimeline } from '@/components/agentic-workload-explorer/agent-timeline';

export default function TimelinePage() {
  const { requests } = useSession();
  return <AgentTimeline requests={requests} />;
}
