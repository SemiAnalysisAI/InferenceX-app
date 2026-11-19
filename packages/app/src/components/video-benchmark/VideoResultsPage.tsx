import { headers } from 'next/headers';
import { Suspense } from 'react';
import VideoDashboard from './VideoDashboard';
import { phoneUserAgent } from './initial-data';
import {
  loadVideoPageData,
  videoPageState,
  type VideoPageSearchParams,
} from '@/lib/video/video-page-data';

async function VideoResults({ params, phone }: { params: VideoPageSearchParams; phone: boolean }) {
  const initialData = await loadVideoPageData(params);
  return (
    <VideoDashboard
      key={JSON.stringify(initialData.state)}
      initialData={initialData}
      phoneGuess={phone}
    />
  );
}

/**
 * Streams the page in two parts: the controls for the URL-selected state go out
 * with the document as an inert shell, and the dashboard with its History cohort and clip sides
 * replaces them once the server reads finish. Both locale routes render this. A phone opens
 * the clip stage on a different pair, so the User-Agent tells the server which pair to render.
 */
export default async function VideoResultsPage({ params }: { params: VideoPageSearchParams }) {
  const request = await headers();
  const phone = phoneUserAgent(request.get('user-agent'));
  return (
    <Suspense
      fallback={
        <VideoDashboard
          initialData={{ state: videoPageState(params), history: null, sides: {} }}
          phoneGuess={phone}
          pending
        />
      }
    >
      <VideoResults params={params} phone={phone} />
    </Suspense>
  );
}
