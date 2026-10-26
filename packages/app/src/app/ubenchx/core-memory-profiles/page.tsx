import type { Metadata } from 'next';

import { CoreMemoryProfilesContent } from '@/components/ubenchx/CoreMemoryProfilesContent';
import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { enAlternates } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX: Core memory-access profiles';
const DESCRIPTION =
  'Measured 128 MiB memory-access profile differences for Ascend 950PR Cube and Vector scalar controllers, with isolated and concurrent launches.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: enAlternates('/ubenchx/core-memory-profiles'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/ubenchx/core-memory-profiles`,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxCoreMemoryProfilesPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <div className="space-y-8">
          <UbenchxHub current="core-memory-profiles" />
          <CoreMemoryProfilesContent />
        </div>
      </div>
    </main>
  );
}
