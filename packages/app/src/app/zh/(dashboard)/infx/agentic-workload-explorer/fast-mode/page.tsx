import type { Metadata } from 'next';

import FastModeView from '@/components/agentic-workload-explorer/views/fast-mode-view';
import { explorerSectionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

export const metadata: Metadata = explorerSectionMetadata('/fast-mode', 'zh');

export default function ZhExplorerFastModePage() {
  return <FastModeView />;
}
