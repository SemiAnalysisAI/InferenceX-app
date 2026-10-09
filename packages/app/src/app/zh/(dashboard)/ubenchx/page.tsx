import type { Metadata } from 'next';

import { UbenchxContent } from '@/components/ubenchx/UbenchxContent';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

const meta = tabMetadataZh('ubenchx');
export const metadata: Metadata = { ...meta, robots: { index: false, follow: false } };

export default function ZhUbenchxPage() {
  return (
    <>
      <ZhTabIntro tab="ubenchx" />
      <UbenchxContent />
    </>
  );
}
