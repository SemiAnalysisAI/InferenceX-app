import type { Metadata } from 'next';

import { ChipsIndexContent } from '@/components/chips/chip-page-sections';
import { enAlternates } from '@/lib/i18n/i18n';
import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const TITLE = 'AI Chips for LLM Inference: Specs, Pricing & Benchmarks';
const DESCRIPTION =
  'Specs, cloud pricing and measured LLM inference benchmarks for NVIDIA H100, H200, B200, B300, GB200 NVL72, GB300 NVL72 and AMD MI300X, MI325X, MI355X.';

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
  ...socialMetadata({
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/chips`,
    locale: 'en',
  }),
};

export default function ChipsIndexPage() {
  return <ChipsIndexContent locale="en" />;
}
