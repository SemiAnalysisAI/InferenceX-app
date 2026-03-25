import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LandingPage } from '@/components/landing/landing-page';
import { PageContent } from '@/components/page-content';
import { LANDING_META, TAB_META, VALID_TABS } from '@/lib/tab-meta';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const dynamicParams = true;

export function generateStaticParams() {
  return [{ tab: [] }, ...VALID_TABS.map((t) => ({ tab: [t] }))];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tab?: string[] }>;
}): Promise<Metadata> {
  const { tab } = await params;
  const activeTab = tab?.[0];

  // Landing page (root /)
  if (!activeTab) {
    return {
      title: LANDING_META.title,
      description: LANDING_META.description,
      alternates: { canonical: SITE_URL },
      openGraph: {
        title: `${LANDING_META.title} | InferenceX`,
        description: LANDING_META.description,
        url: SITE_URL,
      },
      twitter: {
        title: `${LANDING_META.title} | InferenceX`,
        description: LANDING_META.description,
      },
    };
  }

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
  const activeTab = tab?.[0];

  // Landing page (root /)
  if (!activeTab) {
    return <LandingPage />;
  }

  if (!VALID_TABS.includes(activeTab as (typeof VALID_TABS)[number]) || tab.length > 1) {
    notFound();
  }

  return <PageContent initialTab={activeTab} />;
}
