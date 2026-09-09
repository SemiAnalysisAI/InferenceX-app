import type { Metadata } from 'next';
import VideoCIRuns from '@/components/video-benchmark/VideoCIRuns';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = {
  ...tabMetadataZh('video'),
  robots: { index: false, follow: false },
};
export default function VideoPage() {
  return <VideoCIRuns />;
}
