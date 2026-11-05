import type { Metadata } from 'next';

import { ApiReferencePage } from '@/components/api-documentation/api-reference-page';
import { getApiDocumentation } from '@/lib/api/api-documentation';
import { enAlternates } from '@/lib/i18n/i18n';
import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const documentation = getApiDocumentation('en');

export const metadata: Metadata = {
  title: documentation.title,
  description: documentation.description,
  alternates: enAlternates('/api'),
  ...socialMetadata({
    title: `${documentation.title} | ${SITE_NAME}`,
    description: documentation.description,
    url: `${SITE_URL}/api`,
    locale: 'en',
    type: 'article',
  }),
};

export default function ApiPage() {
  return <ApiReferencePage locale="en" />;
}
