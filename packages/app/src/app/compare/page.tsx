import type { Metadata } from 'next';

import CompareIndexView, { compareIndexMetadata } from '@/lib/compare/index-view';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = compareIndexMetadata('full', 'en');

export default function CompareIndexPage() {
  return <CompareIndexView variant="full" lang="en" />;
}
