import type { Metadata } from 'next';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = {
  ...tabMetadata('video'),
  robots: { index: false, follow: false },
};
export default function VideoPage() {
  return <VideoDashboard />;
}
