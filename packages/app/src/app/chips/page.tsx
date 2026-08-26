import type { Metadata } from 'next';

import { ChipsIndexContent } from '@/components/chips/chip-page-sections';
import { enAlternates } from '@/lib/i18n';
import { SITE_NAME, SITE_URL, SUPPORTERS_LINE } from '@semianalysisai/inferencex-constants';

const TITLE = 'AI Chips for LLM Inference: Specs, Pricing & Benchmarks';
const DESCRIPTION = `Specs, cloud pricing and continuously measured LLM inference benchmarks for NVIDIA Hopper and Blackwell (H100, H200, B200, B300, GB200 NVL72, GB300 NVL72) and AMD Instinct (MI300X, MI325X, MI355X) chips. ${SUPPORTERS_LINE}`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'AI chips',
    'AI GPU comparison',
    'GPU specs',
    'GPU price per hour',
    'LLM inference hardware',
    'NVIDIA vs AMD GPU',
    'data center GPU pricing',
    'AI accelerator comparison',
  ],
  alternates: enAlternates('/chips'),
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/chips`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

export default function ChipsIndexPage() {
  return <ChipsIndexContent locale="en" />;
}
