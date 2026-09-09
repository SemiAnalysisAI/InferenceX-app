import type { Metadata } from 'next';
import VideoCIRuns from '@/components/video-benchmark/VideoCIRuns';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = {
  ...tabMetadata('video'),
  robots: { index: false, follow: false },
};
export default function VideoPage() {
  return <VideoCIRuns />;
}
