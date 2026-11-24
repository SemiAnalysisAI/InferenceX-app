import type { VideoHistoryPage } from './history';
import type { ResultsState } from './results';
import type { ResultsClipSide } from './results-clips';
import type { VideoPoint } from './metrics';

export const videoClipSourceKey = (point: Pick<VideoPoint, 'runId' | 'artifactId' | 'id'>) =>
  JSON.stringify([point.runId, point.artifactId, point.id]);

export interface VideoHistoryData {
  pages: VideoHistoryPage[];
  replay: boolean;
}

export interface VideoInitialData {
  state: ResultsState;
  history: VideoHistoryData | null;
  sides: Record<string, ResultsClipSide | null>;
}

/** Whether a request's User-Agent names a phone: the server's guess of the viewport. */
export const phoneUserAgent = (userAgent: string | null | undefined) =>
  /\bMobi/u.test(userAgent ?? '');
