import type { Metadata } from 'next';
import { TabIntro } from '@/components/dashboard/tab-intro';
import VideoResultsPage from '@/components/video-benchmark/VideoResultsPage';
import { tabMetadata } from '@/lib/routing/tab-meta';
import type { VideoPageSearchParams } from '@/lib/video/video-page-data';

export const metadata: Metadata = tabMetadata('video');

export default async function VideoPage({
  searchParams,
}: {
  searchParams: Promise<VideoPageSearchParams>;
}) {
  return (
    <>
      <VideoResultsPage params={await searchParams} />
      <TabIntro tab="video" />
    </>
  );
}
