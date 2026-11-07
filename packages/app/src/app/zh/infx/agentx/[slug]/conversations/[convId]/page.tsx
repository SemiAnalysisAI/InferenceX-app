import { Suspense } from 'react';
import type { Metadata } from 'next';

import { ConversationView } from '@/components/datasets/conversation-view';
import { zhAlternates } from '@/lib/i18n/i18n';
import { AGENTX_ROUTE } from '@/lib/routing/dashboard-routes';

interface Props {
  params: Promise<{ slug: string; convId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, convId } = await params;
  const short = convId.slice(0, 12);
  const title = `对话 ${short} | ${slug}`;
  const description = `${slug} agentic trace 数据集中对话 ${short} 的逐轮 token 火焰图（缓存前缀、未缓存输入与输出）。`;
  const path = `${AGENTX_ROUTE.path}/${slug}/conversations/${encodeURIComponent(convId)}`;
  return {
    title,
    description,
    alternates: zhAlternates(path),
    robots: { index: false },
  };
}

export default async function ConversationPageZh({ params }: Props) {
  const { slug, convId } = await params;
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8">
        <Suspense>
          <ConversationView slug={slug} convId={convId} />
        </Suspense>
      </div>
    </main>
  );
}
