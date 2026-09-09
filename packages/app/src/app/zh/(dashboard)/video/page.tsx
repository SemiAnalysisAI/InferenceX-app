import type { Metadata } from 'next';
import VideoBenchmark from '@/components/video-benchmark/VideoBenchmark';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = {
  ...tabMetadataZh('video'),
  robots: { index: false, follow: false },
};
export default function VideoPage() {
  return <VideoBenchmark />;
}
