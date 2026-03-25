import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

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

  // Landing page metadata
  if (!tab || tab.length === 0) {
    return {
      title: LANDING_META.title,
      description: LANDING_META.description,
      alternates: { canonical: SITE_URL },
      openGraph: {
        title: LANDING_META.title,
        description: LANDING_META.description,
        url: SITE_URL,
      },
      twitter: {
        title: LANDING_META.title,
        description: LANDING_META.description,
      },
    };
  }

  const activeTab = tab[0];
  const meta = TAB_META[activeTab as keyof typeof TAB_META];
  if (!meta) return {};

  const url = `${SITE_URL}/${activeTab}`;

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

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ tab?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab } = await params;

  // Landing page at /
  if (!tab || tab.length === 0) {
    // Backward compat: if / has chart query params, redirect to /inference with them
    const search = await searchParams;
    const hasChartParams = Object.keys(search).some(
      (k) => k.startsWith('g_') || k.startsWith('i_') || k.startsWith('e_') || k.startsWith('r_'),
    );
    if (hasChartParams) {
      const qs = new URLSearchParams(
        Object.entries(search).flatMap(([k, v]) =>
          Array.isArray(v) ? v.map((val) => [k, val]) : v != null ? [[k, v]] : [],
        ),
      ).toString();
      redirect(`/inference?${qs}`);
    }
    return <LandingPage />;
  }

  const activeTab = tab[0];

  if (!VALID_TABS.includes(activeTab as (typeof VALID_TABS)[number]) || tab.length > 1) {
    notFound();
  }

  return <PageContent initialTab={activeTab} />;
}
