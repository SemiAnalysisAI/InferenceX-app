import { Suspense } from 'react';
import type { Metadata } from 'next';

import { ConversationView } from '@/components/datasets/conversation-view';
import { enAlternates } from '@/lib/i18n/i18n';

interface Props {
  params: Promise<{ slug: string; convId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, convId } = await params;
  const short = convId.slice(0, 12);
  const title = `Conversation ${short} | ${slug}`;
  const description = `Per-turn token flamegraph (cached prefix vs uncached input vs output) for conversation ${short} in the ${slug} agentic trace dataset.`;
  const path = `/agentx/${slug}/conversations/${encodeURIComponent(convId)}`;
  return {
    title,
    description,
    alternates: enAlternates(path),
    robots: { index: false },
  };
}

export default async function ConversationPage({ params }: Props) {
  const { slug, convId } = await params;
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <Suspense>
          <ConversationView slug={slug} convId={convId} />
        </Suspense>
      </div>
    </main>
  );
}
