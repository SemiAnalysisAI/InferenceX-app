import { GITHUB_REPO_FULL } from '@semianalysisai/inferencex-constants';
import type { CIArtifact } from '@/components/video-benchmark/archive';
import { at, rows, text, type Json } from '@/components/video-benchmark/bundle';
import { artifactFiles, type GithubRead } from './video-live-run';
import type { VideoPublicationSelection } from './video-storage';

const MERGE_WORKFLOW = '.github/workflows/merge-ingest.yml';
const SELECTION = 'video-publication-selection';

/** A `head_branch` is only a ref name; the run's commit must also be main or one of its ancestors. */
async function onMain(sha: unknown, github: GithubRead, signal: AbortSignal) {
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/u.test(sha)) return false;
  const response = await github(`/compare/${sha}...main`, signal);
  if (response.status === 404) return false;
  if (!response.ok) throw new Error('Workflow run commit unavailable');
  const { status } = await response.json();
  return status === 'identical' || status === 'ahead';
}

/**
 * The workflow run, when `workflow` started it by one of `events` on a main commit of the public
 * repository and that repository is also its head repository. Any other run is null. Trust comes
 * from the run GitHub reports, never from what a caller or an artifact says about it.
 */
export async function trustedMainRun(
  runId: number | string,
  workflow: string,
  events: string[],
  github: GithubRead,
  signal: AbortSignal,
): Promise<{ status: string; conclusion: string | null } | null> {
  const response = await github(`/actions/runs/${runId}`, signal);
  if (!response.ok) throw new Error('Workflow run unavailable');
  const run = await response.json();
  return run.path === workflow &&
    events.includes(run.event) &&
    run.head_branch === 'main' &&
    run.repository?.private === false &&
    run.repository.full_name === GITHUB_REPO_FULL &&
    run.head_repository?.full_name === GITHUB_REPO_FULL &&
    (await onMain(run.head_sha, github, signal))
    ? run
    : null;
}

/** A listing's unexpired artifacts named `name`, newest (highest ID) first. */
export const newestFirst = (artifacts: CIArtifact[], name: string) =>
  artifacts.filter((item) => item.name === name && !item.expired).toSorted((a, b) => b.id - a.id);

/** A bundle a merge selection names, with its one artifact in the source run. */
export interface SelectedArtifact extends VideoPublicationSelection {
  artifact: CIArtifact;
}

/**
 * The bundles a Merge Ingest push to main selected from source run `runId`, or null when that
 * merge run does not authorize publishing the run. Names and digests come from the run's newest
 * unexpired `video-publication-selection` artifact, because a rerun of Merge Ingest uploads
 * another one, and each name must be exactly one unexpired artifact of `catalog`. Merge Ingest
 * dispatches publication from its own last step, so a run still in progress qualifies; a failed
 * or cancelled one does not.
 */
export async function mergeSelection(
  mergeRunId: string,
  runId: string,
  catalog: CIArtifact[],
  github: GithubRead,
  signal: AbortSignal,
): Promise<SelectedArtifact[] | null> {
  const run = await trustedMainRun(mergeRunId, MERGE_WORKFLOW, ['push'], github, signal);
  if (!run || (run.status !== 'in_progress' && run.conclusion !== 'success')) return null;
  const listing = await github(
    `/actions/runs/${mergeRunId}/artifacts?name=${SELECTION}&per_page=100`,
    signal,
  );
  if (!listing.ok) throw new Error('Merge run artifact listing unavailable');
  const { artifacts }: { artifacts: CIArtifact[] } = await listing.json();
  const [newest] = newestFirst(artifacts, SELECTION);
  if (!newest) return null;
  const files = await artifactFiles(newest, github, signal, (path) => path === `${SELECTION}.json`);
  const selection: Json = JSON.parse(new TextDecoder().decode(files.get(`${SELECTION}.json`)));
  if (at(selection, 'version') !== 1 || at(selection, 'source_run_id') !== runId) return null;
  const selected: SelectedArtifact[] = [];
  for (const entry of rows(at(selection, 'artifacts'))) {
    const matches = catalog.filter((artifact) => artifact.name === at(entry, 'name'));
    if (matches.length !== 1 || matches[0].expired) return null;
    selected.push({
      artifact: matches[0],
      manifestSha256: text(at(entry, 'manifest_sha256')),
      sha256sumsSha256: text(at(entry, 'sha256sums_sha256')),
    });
  }
  return selected;
}
