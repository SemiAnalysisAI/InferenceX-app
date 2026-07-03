import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AgenticGate } from '@/components/agentic-gate';
import { AgenticPointDetail } from '@/components/inference/agentic-point/agentic-point-detail';
import { isPersistedBenchmarkId } from '@/lib/benchmark-id';

export const metadata: Metadata = {
  title: 'Agentic trace detail | InferenceX',
  robots: { index: false },
};

export default async function AgenticPointDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  // benchmark_results.id is a positive bigserial — anything else (`/agentic/abc`,
  // `/agentic/0`, `/agentic/-1`) can never resolve, so 404 instead of rendering a
  // blank detail shell that fires doomed id-keyed fetches.
  if (!isPersistedBenchmarkId(numericId)) notFound();
  return (
    <AgenticGate>
      <AgenticPointDetail id={numericId} />
    </AgenticGate>
  );
}
