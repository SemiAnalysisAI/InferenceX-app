import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { explorerHref, versionQuery } from '@/lib/agentic-workload-explorer/paths';
import { explorerSessionMetadata } from '@/lib/agentic-workload-explorer/page-meta';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return explorerSessionMetadata(decodeURIComponent(id), 'conversation', 'en');
}

/** A bare session URL opens its conversation tab, keeping the trace-version filter. */
export default async function ExplorerSessionPage({ params, searchParams }: Props) {
  const [{ id }, { version }] = await Promise.all([params, searchParams]);
  redirect(explorerHref(`/sessions/${id}/conversation`, 'en') + versionQuery(version));
}
