import type { Metadata } from 'next';

import { CurrentImageContent } from '@/components/latest-image/latest-image-content';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('current-inferencex-image');

export default function ZhCurrentInferenceXImagePage() {
  return <CurrentImageContent />;
}
