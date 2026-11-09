/**
 * Group playback rules for the synchronized comparison clips. `stepClipGroup` is pure: the
 * component gathers one snapshot per active clip, applies the returned actions to the video
 * elements and renders the phase, so no playback rule lives in the component.
 */

/**
 * `loading` waits for every clip to hold data through the shared end before the group starts;
 * `buffering` is a stall mid-play, released once each clip has a little data ahead again.
 */
export type ClipPhase = 'paused' | 'loading' | 'buffering' | 'playing' | 'ended';

/** `hide` is the page becoming hidden: it stops audible playback but keeps a start the user is waiting for. */
export type ClipEvent = 'play' | 'pause' | 'hide' | 'tick' | { type: 'seek'; time: number };

export interface ClipSnapshot {
  key: string;
  currentTime: number;
  /** Own media duration; 0 before metadata. */
  duration: number;
  /** End of the buffered range that contains currentTime; 0 when none does. */
  bufferedEnd: number;
  readyState: number;
  seeking: boolean;
  ended: boolean;
  playbackRate: number;
}

export interface ClipGroup {
  phase: ClipPhase;
  /** Active clips in display order. */
  clips: readonly ClipSnapshot[];
  /** The clip whose audio plays. It leads and is never seeked to chase another clip. */
  audible: string | null;
  /** Shared playable duration, 0 while unknown. */
  duration: number;
  /** Base playbackRate: every clip runs at it and drift nudges centre on it. */
  speed: number;
  /** At the shared end, rewind every clip together and play on instead of ending. */
  loop: boolean;
}

export type ClipAction =
  | { type: 'play-all' }
  | { type: 'pause-all' }
  /** play() then pause() inside the user gesture, so browsers that fetch media only after a gesture load while the group waits. */
  | { type: 'prime' }
  | { type: 'seek'; key: string; time: number }
  | { type: 'rate'; key: string; rate: number };

export interface ClipGroupStep {
  phase: ClipPhase;
  actions: ClipAction[];
  /** Group time to display. */
  time: number;
  /** Share of the shared duration buffered by the slowest clip, 0..1. */
  buffered: number;
  /** Every clip holds data from its time through the shared end, so the group can start without a stall. */
  ready: boolean;
}

const HAVE_FUTURE_DATA = 3;
/** Seconds buffered past the group time before clips stalled mid-play resume together. */
export const BUFFER_MARGIN_SECONDS = 1;
/** Slack before the shared end within which a buffered range counts as reaching it. */
export const LOADED_SLACK_SECONDS = 0.05;
/** Drift that starts a playbackRate nudge on a follower. */
export const NUDGE_SECONDS = 0.04;
/** Drift at which a nudged follower returns to the base speed. */
const SETTLE_SECONDS = 0.01;
/** Drift beyond which a follower is seeked once instead of nudged. */
export const SEEK_SECONDS = 0.25;
export const NUDGE_RATE = 0.1;
const END_EPSILON = 0.02;

export const clipGroupActive = (phase: ClipPhase) =>
  phase === 'loading' || phase === 'buffering' || phase === 'playing';

const stalled = (clip: ClipSnapshot) => !clip.seeking && clip.readyState < HAVE_FUTURE_DATA;

const endOf = (clip: ClipSnapshot, duration: number) => (duration > 0 ? duration : clip.duration);

/** Decodable and buffered from its time through the shared end. */
function loaded(clip: ClipSnapshot, duration: number) {
  const end = endOf(clip, duration);
  return (
    clip.readyState >= HAVE_FUTURE_DATA && end > 0 && clip.bufferedEnd >= end - LOADED_SLACK_SECONDS
  );
}

/** Mid-play fallback for a buffer the browser evicted. */
function hasDataAhead(clip: ClipSnapshot, duration: number) {
  return (
    clip.readyState >= HAVE_FUTURE_DATA &&
    (clip.bufferedEnd - clip.currentTime >= BUFFER_MARGIN_SECONDS || loaded(clip, duration))
  );
}

function leaderOf({ clips, audible }: ClipGroup) {
  return (
    clips.find((clip) => clip.key === audible) ?? clips.find((clip) => !stalled(clip)) ?? clips[0]
  );
}

function bufferedShare({ clips, duration }: ClipGroup) {
  if (clips.length === 0) return 0;
  const end = duration > 0 ? duration : Math.min(...clips.map((clip) => clip.duration));
  if (!(end > 0)) return 0;
  const slowest = Math.min(...clips.map((clip) => clip.bufferedEnd));
  return Math.max(0, Math.min(1, slowest / end));
}

function resetRates({ clips, speed }: ClipGroup, actions: ClipAction[]) {
  for (const clip of clips)
    if (clip.playbackRate !== speed) actions.push({ type: 'rate', key: clip.key, rate: speed });
}

/** Seeks followers that drifted while paused, then starts all clips once each passes the waiting phase's rule. */
function resume(
  group: ClipGroup,
  leader: ClipSnapshot,
  actions: ClipAction[],
  waiting: 'loading' | 'buffering',
): ClipPhase {
  let aligning = false;
  for (const clip of group.clips) {
    if (clip === leader || Math.abs(clip.currentTime - leader.currentTime) <= SEEK_SECONDS)
      continue;
    aligning = true;
    if (!clip.seeking) actions.push({ type: 'seek', key: clip.key, time: leader.currentTime });
  }
  const ready = waiting === 'loading' ? loaded : hasDataAhead;
  if (aligning || !group.clips.every((clip) => ready(clip, group.duration))) return waiting;
  resetRates(group, actions);
  actions.push({ type: 'play-all' });
  return 'playing';
}

export function stepClipGroup(group: ClipGroup, event: ClipEvent): ClipGroupStep {
  const { phase, clips, duration, speed } = group;
  const leader = leaderOf(group);
  const actions: ClipAction[] = [];
  const result = (next: ClipPhase, time = leader?.currentTime ?? 0): ClipGroupStep => ({
    phase: next,
    actions,
    time,
    buffered: bufferedShare(group),
    ready: clips.every((clip) => loaded(clip, duration)),
  });
  if (!leader) return result('paused');
  const active = clipGroupActive(phase);

  if (typeof event === 'object') {
    if (active) actions.push({ type: 'pause-all' });
    resetRates(group, actions);
    for (const clip of clips)
      if (clip.readyState >= 1) actions.push({ type: 'seek', key: clip.key, time: event.time });
    return result(active ? 'loading' : 'paused', event.time);
  }
  switch (event) {
    case 'hide':
    case 'pause': {
      if (event === 'hide' ? phase !== 'playing' : !active) return result(phase);
      actions.push({ type: 'pause-all' });
      resetRates(group, actions);
      return result('paused');
    }
    case 'play': {
      if (active) return result(phase);
      if (phase === 'ended') {
        for (const clip of clips) actions.push({ type: 'seek', key: clip.key, time: 0 });
        return result('loading', 0);
      }
      const next = resume(group, leader, actions, 'loading');
      if (next === 'loading') actions.push({ type: 'prime' });
      return result(next);
    }
    case 'tick': {
      if (phase === 'loading' || phase === 'buffering')
        return result(resume(group, leader, actions, phase));
      if (phase !== 'playing') return result(phase);
      if (
        clips.some((clip) => clip.ended) ||
        (duration > 0 && leader.currentTime >= duration - END_EPSILON)
      ) {
        actions.push({ type: 'pause-all' });
        resetRates(group, actions);
        if (group.loop) {
          for (const clip of clips) actions.push({ type: 'seek', key: clip.key, time: 0 });
          return result('loading', 0);
        }
        return result('ended', duration > 0 ? duration : leader.currentTime);
      }
      if (clips.some(stalled)) {
        actions.push({ type: 'pause-all' });
        resetRates(group, actions);
        return result('buffering');
      }
      if (leader.playbackRate !== speed)
        actions.push({ type: 'rate', key: leader.key, rate: speed });
      for (const clip of clips) {
        if (clip === leader) continue;
        const drift = clip.currentTime - leader.currentTime;
        const size = Math.abs(drift);
        let rate = speed;
        if (size > SEEK_SECONDS) {
          if (!clip.seeking)
            actions.push({ type: 'seek', key: clip.key, time: leader.currentTime });
        } else if (size > NUDGE_SECONDS || (clip.playbackRate !== speed && size > SETTLE_SECONDS)) {
          rate = speed * (drift > 0 ? 1 - NUDGE_RATE : 1 + NUDGE_RATE);
        }
        if (clip.playbackRate !== rate) actions.push({ type: 'rate', key: clip.key, rate });
      }
      return result('playing');
    }
    default: {
      return result(phase);
    }
  }
}
