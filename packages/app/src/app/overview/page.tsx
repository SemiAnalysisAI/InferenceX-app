import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { OverviewPageContent } from '@/components/overview/overview-page';
import { enAlternates } from '@/lib/i18n';
import { getOverviewPageData } from '@/lib/overview-data.server';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Comparable validated AI inference serving results for every active model and platform at a fixed single-turn 8K input / 1K output workload, ranked at 50 tok/s/user.';

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

export default async function OverviewPage() {
  const data = await getOverviewPageData();
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 pb-8">
        <OverviewPageContent data={data} locale="en" />
      </div>
    </main>
  );
}
