import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageContent } from '@/components/page-content';
import { TAB_META, VALID_TABS } from '@/lib/tab-meta';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ tab: [] }, ...VALID_TABS.map((t) => ({ tab: [t] }))];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tab?: string[] }>;
}): Promise<Metadata> {
  const { tab } = await params;
  const activeTab = tab?.[0] ?? 'inference';
  const meta = TAB_META[activeTab as keyof typeof TAB_META];
  if (!meta) return {};

  const url = activeTab === 'inference' ? SITE_URL : `${SITE_URL}/${activeTab}`;

  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${meta.title} | InferenceX`,
      description: meta.description,
      url,
    },
    twitter: {
      title: `${meta.title} | InferenceX`,
      description: meta.description,
    },
  };
}

export default async function Page({ params }: { params: Promise<{ tab?: string[] }> }) {
  const { tab } = await params;
  const activeTab = tab?.[0] ?? 'inference';

  if (!VALID_TABS.includes(activeTab as (typeof VALID_TABS)[number]) || (tab && tab.length > 1)) {
    notFound();
  }

  return <PageContent initialTab={activeTab} />;
}
