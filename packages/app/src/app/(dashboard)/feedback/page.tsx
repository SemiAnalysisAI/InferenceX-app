import type { Metadata } from 'next';

import { LazyFeedbackViewer } from '@/components/feedback-viewer/lazy-feedback-viewer';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

const meta = tabMetadata('feedback');
export const metadata: Metadata = { ...meta, robots: { index: false, follow: false } };

export default function FeedbackPage() {
  return (
    <>
      <LazyFeedbackViewer />
      <TabIntro tab="feedback" />
    </>
  );
}
