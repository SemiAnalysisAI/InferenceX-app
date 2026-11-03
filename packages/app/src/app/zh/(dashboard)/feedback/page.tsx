import type { Metadata } from 'next';

import { LazyFeedbackViewer } from '@/components/feedback-viewer/lazy-feedback-viewer';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = {
  ...tabMetadataZh('feedback'),
  robots: { index: false, follow: false },
};

export default function ZhFeedbackPage() {
  return (
    <>
      <LazyFeedbackViewer />
      <ZhTabIntro tab="feedback" />
    </>
  );
}
