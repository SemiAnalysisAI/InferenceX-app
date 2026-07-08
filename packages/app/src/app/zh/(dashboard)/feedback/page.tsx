import type { Metadata } from 'next';

import FeedbackViewer from '@/components/feedback-viewer/FeedbackViewer';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = {
  ...tabMetadataZh('feedback'),
  robots: { index: false, follow: false },
};

export default function ZhFeedbackPage() {
  return (
    <>
      <ZhTabIntro tab="feedback" />
      <FeedbackViewer />
    </>
  );
}
