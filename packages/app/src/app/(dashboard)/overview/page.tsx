import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { OverviewPageContent } from '@/components/overview/overview-page';
import { enAlternates } from '@/lib/i18n';
import { resolveOverviewEngineScope, resolveOverviewTier } from '@/lib/overview-data';
import { getOverviewPageData } from '@/lib/overview-data.server';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Cost per million output tokens from the best observed platform serving envelopes across MI355X, B200, B300, GB200 and GB300 at a fixed single-turn 8K input / 1K output workload, prioritizing speculative decode and FP4.';

export const metadata: Metadata = {
  title: 'AI Inference Overview',
  description: DESCRIPTION,
  alternates: enAlternates('/overview'),
  openGraph: {
    title: `AI Inference Overview | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/overview`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `AI Inference Overview | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OverviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await getOverviewPageData(
    resolveOverviewTier(sp.tier),
    resolveOverviewEngineScope(sp.engine),
  );
  return <OverviewPageContent data={data} locale="en" />;
}
