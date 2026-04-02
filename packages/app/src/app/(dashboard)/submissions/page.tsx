import type { Metadata } from 'next';

import { SITE_URL } from '@semianalysisai/inferencex-constants';

import SubmissionsDisplay from '@/components/submissions/SubmissionsDisplay';

export const metadata: Metadata = {
  title: 'Benchmark Submissions',
  description:
    'All benchmark configurations submitted to InferenceX. View submission history, activity trends, and datapoint volumes across GPU vendors.',
  alternates: { canonical: `${SITE_URL}/submissions` },
  openGraph: {
    title: 'Benchmark Submissions | InferenceX',
    description:
      'All benchmark configurations submitted to InferenceX. View submission history, activity trends, and datapoint volumes across GPU vendors.',
    url: `${SITE_URL}/submissions`,
  },
  twitter: {
    title: 'Benchmark Submissions | InferenceX',
    description:
      'All benchmark configurations submitted to InferenceX. View submission history, activity trends, and datapoint volumes across GPU vendors.',
  },
};

export default function SubmissionsPage() {
  return <SubmissionsDisplay />;
}
