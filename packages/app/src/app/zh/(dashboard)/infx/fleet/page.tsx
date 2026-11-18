import type { Metadata } from 'next';

import FleetLifecycleDisplay from '@/components/calculator/FleetLifecycleDisplay';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('fleet');

export default function ZhFleetPage() {
  return <FleetLifecycleDisplay />;
}
