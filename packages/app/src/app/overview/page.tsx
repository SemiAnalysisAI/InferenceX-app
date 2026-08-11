import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { OverviewPageContent } from '@/components/overview/overview-page';
import { enAlternates } from '@/lib/i18n';
import {
  resolveOverviewComparisonMode,
  resolveOverviewEngineScope,
  resolveOverviewModelScope,
  resolveOverviewReferenceHardware,
  resolveOverviewTier,
} from '@/lib/overview-data';
import { getOverviewPageData } from '@/lib/overview-data.server';

export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Compare hyperscaler cost per million total tokens across MI355X, B200, B300, GB200 and GB300 using the scenario shown for each active model.';

export const metadata: Metadata = {
  title: 'Inference Cost Overview',
  description: DESCRIPTION,
  alternates: enAlternates('/overview'),
  openGraph: {
    title: `Inference Cost Overview | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/overview`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Inference Cost Overview | ${SITE_NAME}`,
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
    resolveOverviewComparisonMode(sp.compare),
    resolveOverviewReferenceHardware(sp.ref),
    resolveOverviewModelScope(sp.models),
  );
  return <OverviewPageContent data={data} locale="en" />;
}
