import type { Metadata } from 'next';

import CollectiveXDisplay from '@/components/collectivex/CollectiveXDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('collectivex');

export default function ZhCollectiveXPage() {
  return (
    <>
      <ZhTabIntro tab="collectivex" />
      <CollectiveXDisplay />
    </>
  );
}
