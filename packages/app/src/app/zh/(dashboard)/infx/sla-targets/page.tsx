import type { Metadata } from 'next';

import SlaTargetsDisplay from '@/components/sla-targets/SlaTargetsDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = {
  ...tabMetadataZh('sla-targets'),
  robots: { index: false, follow: false },
};

export default function ZhSlaTargetsPage() {
  return (
    <>
      <SlaTargetsDisplay />
      <ZhTabIntro tab="sla-targets" />
    </>
  );
}
