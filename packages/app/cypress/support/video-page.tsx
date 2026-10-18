import VideoCIRuns from '@/components/video-benchmark/VideoCIRuns';
import { videoView } from '@/components/video-benchmark/view';

export default function VideoPage() {
  const params = new URLSearchParams(location.search);
  return (
    <VideoCIRuns initialView={videoView(params.get('view') ?? undefined, params.has('run'))} />
  );
}
