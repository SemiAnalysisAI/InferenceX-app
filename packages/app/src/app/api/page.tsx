import type { Metadata } from 'next';

import { ApiReferencePage } from '@/components/api-documentation/api-reference-page';
import { getApiDocumentation } from '@/lib/api-documentation';
import { enAlternates } from '@/lib/i18n';
import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

const documentation = getApiDocumentation('en');

export const metadata: Metadata = {
  title: documentation.title,
  description: documentation.description,
  alternates: enAlternates('/api'),
  openGraph: {
    title: `${documentation.title} | ${SITE_NAME}`,
    description: documentation.description,
    url: `${SITE_URL}/api`,
    locale: 'en_US',
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${documentation.title} | ${SITE_NAME}`,
    description: documentation.description,
  },
};

export default function ApiPage() {
  return <ApiReferencePage locale="en" />;
}
