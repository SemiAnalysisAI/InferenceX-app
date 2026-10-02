import type { Metadata } from 'next';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = {
  ...tabMetadataZh('video'),
  robots: { index: false, follow: false },
};
export default function VideoPage() {
  return <VideoDashboard />;
}
