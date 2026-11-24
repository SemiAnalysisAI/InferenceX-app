import type { Metadata } from 'next';

import CollectiveXDisplay from '@/components/collectivex/CollectiveXDisplay';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('collectivex');

export default function ZhCollectiveXPage() {
  return <CollectiveXDisplay />;
}
