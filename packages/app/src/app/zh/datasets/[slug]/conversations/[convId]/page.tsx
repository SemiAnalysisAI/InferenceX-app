import { Suspense } from 'react';
import type { Metadata } from 'next';

import { ConversationView } from '@/components/datasets/conversation-view';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

interface Props {
  params: Promise<{ slug: string; convId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, convId } = await params;
  const short = convId.slice(0, 12);
  const title = `对话 ${short} | ${slug}`;
  const description = `${slug} agentic trace 数据集中对话 ${short} 的逐轮 token 火焰图（缓存前缀 vs 未缓存 input vs output）。`;
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/zh/datasets/${slug}/conversations/${encodeURIComponent(convId)}`,
    },
    robots: { index: false },
  };
}

export default async function ConversationPageZh({ params }: Props) {
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
