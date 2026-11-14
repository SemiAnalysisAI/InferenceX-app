import type { VideoPoint } from './metrics';

const REPO = 'https://github.com/SemiAnalysisAI/InferenceX';

/** Where a reader goes to rerun or change an H3 deployment from its recipe. */
export const VIDEO_REPRODUCE_URL = `${REPO}/blob/main/video-generation/SUBMITTING.md#1-choose-the-deployment`;

export type DetailLinkAction = 'run' | 'artifact' | 'reproduce';

export interface DetailLink {
  action: DetailLinkAction;
  href: string;
}

const isRunId = (value: string) => /^[1-9]\d*$/.test(value);

/**
 * Provenance actions for a deployment detail page. Each link appears only when the
 * point carries the identity it needs, so a malformed or missing ID never yields a
 * dead GitHub URL.
 */
export function detailLinks(point: Pick<VideoPoint, 'runId' | 'artifactId'>): DetailLink[] {
  const links: DetailLink[] = [];
  const runId = String(point.runId ?? '');
  if (isRunId(runId)) {
    const runUrl = `${REPO}/actions/runs/${runId}`;
    links.push({ action: 'run', href: runUrl });
    if (Number.isSafeInteger(point.artifactId) && point.artifactId > 0) {
      links.push({ action: 'artifact', href: `${runUrl}/artifacts/${point.artifactId}` });
    }
  }
  links.push({ action: 'reproduce', href: VIDEO_REPRODUCE_URL });
  return links;
}
