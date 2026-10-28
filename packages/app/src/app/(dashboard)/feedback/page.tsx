import type { Metadata } from 'next';

import FeedbackViewer from '@/components/feedback-viewer/FeedbackViewer';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

const meta = tabMetadata('feedback');
export const metadata: Metadata = { ...meta, robots: { index: false, follow: false } };

export default function FeedbackPage() {
  return (
    <>
      <TabIntro tab="feedback" />
      <FeedbackViewer />
    </>
  );
}
