import { replaceClientSearch } from '@/lib/routing/client-navigation';
import type { VideoPoint } from './metrics';
import { RESULTS_HARDWARE } from './results';
import { resultsClipGroups, type ResultsClipGroup, type ResultsClipSide } from './results-clips';

/** Ways the comparison stage shows its two clips; Wipe is the default and is omitted from the URL. */
export const STAGE_VIEWS = ['wipe', 'side', 'toggle', 'diff'] as const;
export type StageView = (typeof STAGE_VIEWS)[number];

export interface StageState {
  /** `promptKey` of the shown prompt; null or unknown shows the first prompt. */
  prompt: string | null;
  view: StageView;
}

/** The stage's own URL keys. VideoDashboard's `commit` rewrites every other `r_` key and keeps these. */
const STAGE_PARAMS: readonly string[] = ['r_prompt', 'r_view'];
export const isStageParam = (key: string) => STAGE_PARAMS.includes(key);

export function parseStage(search: string): StageState {
  const params = new URLSearchParams(search);
  const view = params.get('r_view');
  return {
    prompt: params.get('r_prompt') || null,
    view: STAGE_VIEWS.find((item) => item === view) ?? 'wipe',
  };
}

/** `search` with the stage keys replaced and every other key kept. */
export function stageSearch(state: StageState, search: string): URLSearchParams {
  const params = new URLSearchParams(search);
  if (state.prompt) params.set('r_prompt', state.prompt);
  else params.delete('r_prompt');
  if (state.view === 'wipe') params.delete('r_view');
  else params.set('r_view', state.view);
  return params;
}

export function writeStage(state: StageState) {
  replaceClientSearch(stageSearch(state, window.location.search));
}

/** A prompt's URL id: its case id, `~take` after the first take, `diag:` for the matched-noise rerun. */
export function promptKey(group: ResultsClipGroup): string {
  const caseId = [...group.clips.values()][0]?.record.caseId ?? '';
  if (group.scope === 'matched-noise-diagnostic') return `diag:${caseId}`;
  return group.take > 1 ? `${caseId}~${group.take}` : caseId;
}

export const stagePrompt = (groups: readonly ResultsClipGroup[], key: string | null) =>
  groups.find((group) => promptKey(group) === key) ?? groups[0] ?? null;

export interface StageCandidate {
  point: VideoPoint;
  /** Undefined while its published read is in flight; null when there is none. */
  side: ResultsClipSide | null | undefined;
}

export interface StageSubject {
  point: VideoPoint;
  side: ResultsClipSide | null;
  groups: ResultsClipGroup[];
  pending: boolean;
}

const SUBJECT_ORDER = ['b200', ...RESULTS_HARDWARE.filter((key) => key !== 'b200')];

/**
 * The clip the stage compares with its reference. A visible point of `namedRun` (the
 * `?unofficialrun=` overlay) comes first, with or without media, so the run the user loaded stays
 * on the stage. Otherwise the B200 lead, else the first visible roster hardware with a playable
 * clip. A preferred side still loading holds its place, so the stage does not jump once it
 * arrives. Without any playable clip, scored clips are next, then the first visible hardware, so
 * its empty state stays in view.
 */
export function stageSubject(
  candidates: readonly StageCandidate[],
  namedRun?: string,
): StageSubject | null {
  const ordered = SUBJECT_ORDER.flatMap((key) =>
    candidates
      .filter((candidate) => candidate.point.hardwareKey === key)
      .map(({ point, side }) => ({
        point,
        side: side ?? null,
        groups: side ? resultsClipGroups([side]) : [],
        pending: side === undefined,
      })),
  );
  const named = ordered.filter((subject) => subject.point.runId === namedRun);
  const pool = named.length > 0 ? named : ordered;
  for (const subject of pool) {
    if (subject.pending) return subject;
    if (subject.groups.some((group) => [...group.clips.values()].some((clip) => clip.url)))
      return subject;
  }
  return pool.find((subject) => subject.groups.length > 0) ?? pool[0] ?? null;
}
