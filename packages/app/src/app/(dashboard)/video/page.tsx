import type { Metadata } from 'next';
import VideoBenchmark from '@/components/video-benchmark/VideoBenchmark';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = {
  ...tabMetadata('video'),
  robots: { index: false, follow: false },
};
export default function VideoPage() {
  return <VideoBenchmark />;
}
