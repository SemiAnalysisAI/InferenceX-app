import { Suspense } from 'react';
import type { Metadata } from 'next';

import { AgenticGate } from '@/components/agentic-gate';
import { ConversationView } from '@/components/datasets/conversation-view';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ slug: string; convId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, convId } = await params;
  // App Router has already decoded the dynamic segment exactly once, so `convId`
  // is the raw conversation id here. Re-encode for the canonical URL.
  const short = convId.slice(0, 12);
  const title = `Conversation ${short} | ${slug}`;
  const description = `Per-turn token flamegraph (cached prefix vs uncached input vs output) for conversation ${short} in the ${slug} agentic trace dataset.`;
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/datasets/${slug}/conversations/${encodeURIComponent(convId)}`,
    },
    robots: { index: false }, // per-conversation pages are too numerous to index
  };
}

export default async function ConversationPage({ params }: Props) {
  const { slug, convId } = await params;
  // `convId` is already decoded once by App Router — pass it straight through.
  // A second decodeURIComponent here would over-decode (and throw for ids that
  // contain a literal '%'). ConversationView re-encodes when it builds the API URL.
  return (
    <AgenticGate>
      <main className="relative">
        <div className="container mx-auto px-4 pb-8 lg:px-8">
          <Suspense>
            <ConversationView slug={slug} convId={convId} />
          </Suspense>
        </div>
      </main>
    </AgenticGate>
  );
}
