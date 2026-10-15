import type { Metadata } from 'next';

import FeedbackViewer from '@/components/feedback-viewer/FeedbackViewer';
import { tabMetadata } from '@/lib/routing/tab-meta';

// Internal viewer — don't surface in search engines.
const meta = tabMetadata('feedback');
export const metadata: Metadata = { ...meta, robots: { index: false, follow: false } };

export default function FeedbackPage() {
  return <FeedbackViewer />;
}
