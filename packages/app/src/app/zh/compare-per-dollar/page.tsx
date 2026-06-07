import type { Metadata } from 'next';

import CompareIndexView, { compareIndexMetadata } from '@/lib/compare/index-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = compareIndexMetadata('per-dollar', 'zh');

export default function ComparePerDollarIndexPageZh() {
  return <CompareIndexView variant="per-dollar" lang="zh" />;
}
