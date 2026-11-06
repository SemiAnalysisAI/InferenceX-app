import { Suspense } from 'react';
import VideoDashboard from './VideoDashboard';
import {
  loadVideoPageData,
  videoPageState,
  type VideoPageSearchParams,
} from '@/lib/video/video-page-data';

async function VideoResults({ params }: { params: VideoPageSearchParams }) {
  const initialData = await loadVideoPageData(params);
  return <VideoDashboard key={JSON.stringify(initialData.state)} initialData={initialData} />;
}

/**
 * Streams the page in two parts: the controls for the URL-selected state go out
 * with the document as an inert shell, and the dashboard with its History cohort and clip sides
 * replaces them once the server reads finish. Both locale routes render this.
 */
export default function VideoResultsPage({ params }: { params: VideoPageSearchParams }) {
  return (
    <Suspense
      fallback={
        <VideoDashboard
          initialData={{ state: videoPageState(params), history: null, sides: {} }}
          pending
        />
      }
    >
      <VideoResults params={params} />
    </Suspense>
  );
}
