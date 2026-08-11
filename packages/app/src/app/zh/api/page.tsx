import type { Metadata } from 'next';

import { ApiReferencePage } from '@/components/api-documentation/api-reference-page';
import { getApiDocumentation } from '@/lib/api-documentation';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

const documentation = getApiDocumentation('zh');

export const metadata: Metadata = {
  title: documentation.title,
  description: documentation.description,
  alternates: zhAlternates('/api'),
  openGraph: {
    title: `${documentation.title} | ${SITE_NAME}`,
    description: documentation.description,
    url: `${SITE_URL}/zh/api`,
    locale: ZH_OG_LOCALE,
    type: 'article',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${documentation.title} | ${SITE_NAME}`,
    description: documentation.description,
  },
};

export default function ApiPageZh() {
  return <ApiReferencePage locale="zh" />;
}
