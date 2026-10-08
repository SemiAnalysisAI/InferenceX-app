import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { explorerHref } from '@/lib/agentic-workload-explorer/paths';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'conversation', 'en');
}

/** A bare session URL opens its conversation tab. */
export default async function ExplorerSessionPage({ params }: Props) {
  const { id } = await params;
  redirect(explorerHref(`/sessions/${id}/conversation`, 'en'));
}
