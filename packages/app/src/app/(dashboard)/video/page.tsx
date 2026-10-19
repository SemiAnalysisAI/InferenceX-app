import type { Metadata } from 'next';
import VideoCIRuns from '@/components/video-benchmark/VideoCIRuns';
import { videoView } from '@/components/video-benchmark/view';
import { tabMetadata } from '@/lib/routing/tab-meta';

export const metadata: Metadata = {
  ...tabMetadata('video'),
  robots: { index: false, follow: false },
};
export default async function VideoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <VideoCIRuns initialView={videoView(params.view, Object.hasOwn(params, 'run'))} />;
}
