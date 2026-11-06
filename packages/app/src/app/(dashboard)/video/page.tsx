import type { Metadata } from 'next';
import VideoResultsPage from '@/components/video-benchmark/VideoResultsPage';
import { tabMetadata } from '@/lib/routing/tab-meta';
import type { VideoPageSearchParams } from '@/lib/video/video-page-data';

export const metadata: Metadata = {
  ...tabMetadata('video'),
  robots: { index: false, follow: false },
};
export default async function VideoPage({
  searchParams,
}: {
  searchParams: Promise<VideoPageSearchParams>;
}) {
  return <VideoResultsPage params={await searchParams} />;
}
