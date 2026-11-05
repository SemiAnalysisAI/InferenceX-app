import type { Metadata } from 'next';

import FleetLifecycleDisplay from '@/components/calculator/FleetLifecycleDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('fleet');

export default function ZhFleetPage() {
  return (
    <>
      <FleetLifecycleDisplay />
      <ZhTabIntro tab="fleet" />
    </>
  );
}
