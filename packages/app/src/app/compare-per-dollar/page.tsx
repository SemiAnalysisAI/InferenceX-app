import type { Metadata } from 'next';

import CompareIndexView, { compareIndexMetadata } from '@/lib/compare/index-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = compareIndexMetadata('per-dollar', 'en');

export default function ComparePerDollarIndexPage() {
  return <CompareIndexView variant="per-dollar" lang="en" />;
}
