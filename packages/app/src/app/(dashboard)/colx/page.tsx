import type { Metadata } from 'next';

import CollectiveXDisplay from '@/components/collectivex/CollectiveXDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';

export const metadata: Metadata = tabMetadata('collectivex');

export default function CollectiveXPage() {
  return <CollectiveXDisplay />;
}
