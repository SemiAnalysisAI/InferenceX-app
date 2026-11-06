import type { Metadata } from 'next';
import VideoDashboard from '@/components/video-benchmark/VideoDashboard';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { loadVideoPageData, type VideoPageSearchParams } from '@/lib/video/video-page-data';

export const metadata: Metadata = {
  ...tabMetadata('video'),
  robots: { index: false, follow: false },
};
export default async function VideoPage({
  searchParams,
}: {
  searchParams: Promise<VideoPageSearchParams>;
}) {
  const initialData = await loadVideoPageData(await searchParams);
  return <VideoDashboard key={JSON.stringify(initialData.state)} initialData={initialData} />;
}
