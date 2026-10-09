import type { Metadata } from 'next';

import { UbenchxContent } from '@/components/ubenchx/UbenchxContent';
import { enAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX: Device-Memory Copy Bandwidth';
const DESCRIPTION =
  'Device-memory copy bandwidth microbenchmark on NVIDIA and AMD GPUs: latency, bandwidth, and memory bandwidth utilization (MBU) across message sizes from 8 B to 16 GiB.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: enAlternates('/ubenchx/mem-bw'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/ubenchx/mem-bw`,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxMemBwPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <UbenchxContent />
      </div>
    </main>
  );
}
