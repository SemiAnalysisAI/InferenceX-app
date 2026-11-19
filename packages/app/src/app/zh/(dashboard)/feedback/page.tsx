import type { Metadata } from 'next';

import FeedbackViewer from '@/components/feedback-viewer/FeedbackViewer';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = {
  ...tabMetadataZh('feedback'),
  robots: { index: false, follow: false },
};

export default function ZhFeedbackPage() {
  return <FeedbackViewer />;
}
