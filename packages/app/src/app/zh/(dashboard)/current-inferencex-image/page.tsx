import type { Metadata } from 'next';

import { CurrentImageContent } from '@/components/latest-image/latest-image-content';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('current-inferencex-image');

export default function ZhCurrentInferenceXImagePage() {
  return (
    <>
      <ZhTabIntro tab="current-inferencex-image" />
      <CurrentImageContent />
    </>
  );
}
