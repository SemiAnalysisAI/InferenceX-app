import type { Metadata } from 'next';

import FirstTokenLimitsDisplay from '@/components/calculator/FirstTokenLimitsDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('first-token');

export default function ZhFirstTokenPage() {
  return (
    <>
      <FirstTokenLimitsDisplay />
      <ZhTabIntro tab="first-token" />
    </>
  );
}
