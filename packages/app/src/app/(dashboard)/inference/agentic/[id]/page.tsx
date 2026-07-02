import type { Metadata } from 'next';

import { AgenticPointDetail } from '@/components/inference/agentic-point/agentic-point-detail';

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
  return <AgenticPointDetail id={Number(id)} />;
}
