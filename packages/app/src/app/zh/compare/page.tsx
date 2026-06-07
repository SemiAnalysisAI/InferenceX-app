import type { Metadata } from 'next';

import CompareIndexView, { compareIndexMetadata } from '@/lib/compare/index-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = compareIndexMetadata('full', 'zh');

export default function CompareIndexPageZh() {
  return <CompareIndexView variant="full" lang="zh" />;
}
