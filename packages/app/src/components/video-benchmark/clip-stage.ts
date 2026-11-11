import { replaceClientSearch } from '@/lib/routing/client-navigation';
import { deploymentKey, isQueueing, losslessTwin, runtimeKey } from './deployment';
import type { VideoPoint } from './metrics';
import { isLossy } from './optimizations';
import { RESULTS_HARDWARE } from './results';
import { resultsPointKey } from './results-chart';
import { resultsClipGroups, type ResultsClipGroup, type ResultsClipSide } from './results-clips';

/** Ways the comparison stage shows its two clips; Wipe is the default and is omitted from the URL. */
export const STAGE_VIEWS = ['wipe', 'side', 'toggle', 'diff'] as const;
export type StageView = (typeof STAGE_VIEWS)[number];

export interface StageState {
  /** `promptKey` of the shown prompt; null or unknown shows the first prompt. */
  prompt: string | null;
  view: StageView;
  /** `resultsPointKey` of the chart point the stage plays; null or an undrawn point plays the default. */
  clip: string | null;
}

/** The stage's own URL keys. VideoDashboard's `commit` rewrites every other `r_` key and keeps these. */
const STAGE_PARAMS: readonly string[] = ['r_prompt', 'r_view', 'r_clip'];
export const isStageParam = (key: string) => STAGE_PARAMS.includes(key);

export function parseStage(search: string): StageState {
  const params = new URLSearchParams(search);
  const view = params.get('r_view');
  return {
    prompt: params.get('r_prompt') || null,
    view: STAGE_VIEWS.find((item) => item === view) ?? 'wipe',
    clip: params.get('r_clip') || null,
  };
}

/** `search` with the stage keys replaced and every other key kept. */
export function stageSearch(state: StageState, search: string): URLSearchParams {
  const params = new URLSearchParams(search);
  if (state.prompt) params.set('r_prompt', state.prompt);
  else params.delete('r_prompt');
  if (state.view === 'wipe') params.delete('r_view');
  else params.set('r_view', state.view);
  if (state.clip) params.set('r_clip', state.clip);
  else params.delete('r_clip');
  return params;
}

export function writeStage(state: StageState) {
  replaceClientSearch(stageSearch(state, window.location.search));
}

/** Element id of the stage and its transport, which a reveal scrolls into view. */
export const STAGE_ID = 'comparison-stage';

/** A prompt's URL id: its case id, `~take` after the first take, `diag:` for the matched-noise rerun. */
export function promptKey(group: ResultsClipGroup): string {
  const caseId = [...group.clips.values()][0]?.record.caseId ?? '';
  if (group.scope === 'matched-noise-diagnostic') return `diag:${caseId}`;
  return group.take > 1 ? `${caseId}~${group.take}` : caseId;
}

export const stagePrompt = (groups: readonly ResultsClipGroup[], key: string | null) =>
  groups.find((group) => promptKey(group) === key) ?? groups[0] ?? null;

/**
 * The other side's group for the subject's prompt: the same generation, prompt, seed and take. A
 * matched-noise rerun's key carries its own attachment, so reruns pair by case, prompt and seed.
 */
export const pairedGroup = (groups: readonly ResultsClipGroup[], group: ResultsClipGroup | null) =>
  group
    ? groups.find((g) =>
        group.scope
          ? g.scope === group.scope &&
            promptKey(g) === promptKey(group) &&
            g.prompt === group.prompt &&
            g.seed === group.seed
          : g.key === group.key,
      )
    : undefined;

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

/** Hardware the stage prefers, in order: B200 first, then the roster. */
export const SUBJECT_ORDER = ['b200', ...RESULTS_HARDWARE.filter((key) => key !== 'b200')];

export const stagePointKey = (point: VideoPoint) => resultsPointKey({ point });

/**
 * Stored cells may have published clips; a live named run is read from GitHub without media.
 * The chart draws the rest hollow. A stored cell without clips still gets the stage's empty state.
 */
export const mayHaveClips = (point: VideoPoint) => Boolean(point.publishedAt);

/**
 * The clip the stage plays. The chart point named by `clipKey` (`r_clip`) comes first. Then a
 * visible point of `namedRun` (the `?unofficialrun=` overlay), with or without media, so the run
 * the user loaded stays on the stage. Otherwise the B200 lead, else the first visible roster
 * hardware with a playable clip. A preferred side still loading holds its place, so the stage
 * does not jump once it arrives. Without any playable clip, scored clips are next, then the first
 * visible hardware, so its empty state stays in view.
 */
export function stageSubject(
  candidates: readonly StageCandidate[],
  namedRun?: string,
  clipKey?: string | null,
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
  const picked = clipKey && ordered.find((subject) => stagePointKey(subject.point) === clipKey);
  if (picked) return picked;
  const named = ordered.filter((subject) => subject.point.runId === namedRun);
  const pool = named.length > 0 ? named : ordered;
  for (const subject of pool) {
    if (subject.pending) return subject;
    if (subject.groups.some((group) => [...group.clips.values()].some((clip) => clip.url)))
      return subject;
  }
  return pool.find((subject) => subject.groups.length > 0) ?? pool[0] ?? null;
}

/** What the stage's second side shows, and the point it plays; null for the reference. */
export interface StageOption {
  /** `reference`, `twin`, or the hardware key of the lead it plays. */
  value: string;
  kind: 'reference' | 'lead' | 'twin';
  /** Null for the reference, and for a twin the subject's run does not have. */
  point: VideoPoint | null;
}

/**
 * What the subject can be compared with: its Diffusers reference (the default), each other
 * visible hardware's lead, `own` in place of its own hardware's lead, and, for a lossy
 * subject, its lossless twin from `deployments`. Without `own` its hardware is not offered.
 */
export function stageOptions(
  subject: VideoPoint,
  leads: readonly VideoPoint[],
  deployments: readonly VideoPoint[],
  own: VideoPoint | null = null,
): StageOption[] {
  return [
    { value: 'reference', kind: 'reference', point: null },
    ...leads
      .map((lead) => (lead.hardwareKey === subject.hardwareKey ? own : lead))
      .filter((lead) => lead !== null)
      .map((lead) => ({ value: lead.hardwareKey ?? '', kind: 'lead' as const, point: lead })),
    ...(isLossy(subject)
      ? [{ value: 'twin', kind: 'twin' as const, point: losslessTwin(subject, deployments) }]
      : []),
  ];
}

/**
 * The official side a `namedRun` subject is read against: the official cell of the same
 * deployment and concurrency on its GPU, so a 4-GPU candidate meets production's 4 GPUs, else that
 * GPU's official lead. Null for an official subject.
 */
export function officialCounterpart(
  subject: VideoPoint,
  deployments: readonly VideoPoint[],
  leads: readonly VideoPoint[],
  namedRun?: string,
): VideoPoint | null {
  if (!namedRun || subject.runId !== namedRun) return null;
  const same = deployments.find(
    (p) =>
      p.runId !== namedRun &&
      p.hardwareKey === subject.hardwareKey &&
      p.concurrency === subject.concurrency &&
      deploymentKey(p) === deploymentKey(subject) &&
      mayHaveClips(p),
  );
  return same ?? leads.find((p) => p.hardwareKey === subject.hardwareKey) ?? null;
}

/**
 * The option a subject pairs with until the reader picks another: a lossy config's lossless twin,
 * an unofficial run's `officialCounterpart` (`own`), else the Diffusers reference.
 */
export const defaultPairing = (subject: VideoPoint, own: VideoPoint | null) =>
  isLossy(subject) ? 'twin' : (own?.hardwareKey ?? 'reference');

/** A config's Compare-row id: its hardware, its runtime when lossy, and whether it is `namedRun`'s. */
export const configId = (p: VideoPoint, namedRun?: string) =>
  `${p.hardwareKey ?? ''}${isLossy(p) ? `+${runtimeKey(p)}` : ''}${p.runId === namedRun ? '-overlay' : ''}`;

/**
 * The configs the Compare row plays: each hardware's opening deployment, then each drawn lossy
 * config that may have clips, at its lower-median latency deployment as a lead's opening is.
 */
export function compareConfigs(
  openings: readonly VideoPoint[],
  drawn: readonly VideoPoint[],
  namedRun?: string,
): VideoPoint[] {
  const offered = new Set(openings.map((p) => configId(p, namedRun)));
  const lossy = Map.groupBy(
    drawn.filter(
      (p) =>
        isLossy(p) &&
        mayHaveClips(p) &&
        p.p50 !== null &&
        !isQueueing(p) &&
        !offered.has(configId(p, namedRun)),
    ),
    (p) => configId(p, namedRun),
  );
  return [
    ...openings,
    ...[...lossy.values()].map((config) => {
      const byLatency = config.toSorted((a, b) => a.p50! - b.p50!);
      return byLatency[Math.floor((byLatency.length - 1) / 2)];
    }),
  ];
}

/** The subject's speed against its pair, rounded to the two decimals the readout shows. */
export interface Speed {
  direction: 'faster' | 'slower' | 'same';
  times: string;
}

/**
 * Compares seconds per clip: a subject taking 10 s against a pair taking 28 s is 2.80× faster.
 * Null unless both times are positive, so a missing time never reads as a ratio.
 */
export function speedVs(subject: number | null, pair: number | null): Speed | null {
  if (subject === null || pair === null || !(subject > 0) || !(pair > 0)) return null;
  const times = (Math.max(subject, pair) / Math.min(subject, pair)).toFixed(2);
  return { direction: times === '1.00' ? 'same' : subject < pair ? 'faster' : 'slower', times };
}

/** Chart point keys of the stage's two sides; `baseline` is null for the reference. */
export interface StagePair {
  playing: string | null;
  baseline: string | null;
  /** First frames of the shown prompt by chart point key for read points; null when one has none. */
  posters: Readonly<Record<string, string | null>>;
}
