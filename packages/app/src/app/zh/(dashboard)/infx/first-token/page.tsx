import type { Metadata } from 'next';

import FirstTokenLimitsDisplay from '@/components/calculator/FirstTokenLimitsDisplay';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('first-token');

export default function ZhFirstTokenPage() {
  return <FirstTokenLimitsDisplay />;
}
