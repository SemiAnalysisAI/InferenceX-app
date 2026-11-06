import type { Metadata } from 'next';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import VideoResultsPage from '@/components/video-benchmark/VideoResultsPage';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';
import type { VideoPageSearchParams } from '@/lib/video/video-page-data';

export const metadata: Metadata = tabMetadataZh('video');

export default async function VideoPage({
  searchParams,
}: {
  searchParams: Promise<VideoPageSearchParams>;
}) {
  return (
    <>
      <VideoResultsPage params={await searchParams} />
      <ZhTabIntro tab="video" />
    </>
  );
}
