import { ExplorerShell } from '@/components/agentic-workload-explorer/explorer-shell';

export default function AgenticWorkloadExplorerLayoutZh({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ExplorerShell>{children}</ExplorerShell>;
}
