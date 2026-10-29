import type { Metadata } from 'next';

import { ApiReferencePage } from '@/components/api-documentation/api-reference-page';
import { getApiDocumentation } from '@/lib/api/api-documentation';
import { zhAlternates } from '@/lib/i18n/i18n';
import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const documentation = getApiDocumentation('zh');

export const metadata: Metadata = {
  title: documentation.title,
  description: documentation.description,
  alternates: zhAlternates('/api'),
  ...socialMetadata({
    title: `${documentation.title} | ${SITE_NAME}`,
    description: documentation.description,
    url: `${SITE_URL}/zh/api`,
    locale: 'zh',
    type: 'article',
  }),
};

export default function ApiPageZh() {
  return <ApiReferencePage locale="zh" />;
}
