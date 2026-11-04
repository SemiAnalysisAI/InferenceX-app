/**
 * Group playback rules for the synchronized comparison clips. `stepClipGroup` is pure: the
 * component gathers one snapshot per active clip, applies the returned actions to the video
 * elements and renders the phase, so no playback rule lives in the component.
 */

export type ClipPhase = 'paused' | 'buffering' | 'playing' | 'ended';

export type ClipEvent = 'play' | 'pause' | 'tick' | { type: 'seek'; time: number };

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
}

export type ClipAction =
  | { type: 'play-all' }
  | { type: 'pause-all' }
  /** play() then pause() inside the user gesture, so browsers that fetch media only after a gesture load while the group buffers. */
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
}

const HAVE_FUTURE_DATA = 3;
/** Seconds buffered past the group time before paused clips resume together. */
export const BUFFER_MARGIN_SECONDS = 1;
/** Drift that starts a playbackRate nudge on a follower. */
export const NUDGE_SECONDS = 0.04;
/** Drift at which a nudged follower returns to rate 1. */
const SETTLE_SECONDS = 0.01;
/** Drift beyond which a follower is seeked once instead of nudged. */
export const SEEK_SECONDS = 0.25;
export const NUDGE_RATE = 0.1;
const END_EPSILON = 0.02;

const stalled = (clip: ClipSnapshot) => !clip.seeking && clip.readyState < HAVE_FUTURE_DATA;

function ready(clip: ClipSnapshot, duration: number) {
  if (clip.readyState < HAVE_FUTURE_DATA) return false;
  const end = duration > 0 ? duration : clip.duration;
  return (
    clip.bufferedEnd - clip.currentTime >= BUFFER_MARGIN_SECONDS ||
    (end > 0 && clip.bufferedEnd >= end - END_EPSILON)
  );
}

function leaderOf({ clips, audible }: ClipGroup) {
  return (
    clips.find((clip) => clip.key === audible) ?? clips.find((clip) => !stalled(clip)) ?? clips[0]
  );
}

function bufferedShare({ clips, duration }: ClipGroup) {
  if (duration <= 0 || clips.length === 0) return 0;
  const slowest = Math.min(...clips.map((clip) => clip.bufferedEnd));
  return Math.max(0, Math.min(1, slowest / duration));
}

function resetRates(clips: readonly ClipSnapshot[], actions: ClipAction[]) {
  for (const clip of clips)
    if (clip.playbackRate !== 1) actions.push({ type: 'rate', key: clip.key, rate: 1 });
}

/** Seeks followers that drifted while paused, then starts all clips once each has data ahead. */
function resume(group: ClipGroup, leader: ClipSnapshot, actions: ClipAction[]): ClipPhase {
  let aligning = false;
  for (const clip of group.clips) {
    if (clip === leader || Math.abs(clip.currentTime - leader.currentTime) <= SEEK_SECONDS)
      continue;
    aligning = true;
    if (!clip.seeking) actions.push({ type: 'seek', key: clip.key, time: leader.currentTime });
  }
  if (aligning || !group.clips.every((clip) => ready(clip, group.duration))) return 'buffering';
  actions.push({ type: 'play-all' });
  return 'playing';
}

export function stepClipGroup(group: ClipGroup, event: ClipEvent): ClipGroupStep {
  const { phase, clips, duration } = group;
  const leader = leaderOf(group);
  const actions: ClipAction[] = [];
  const result = (next: ClipPhase, time = leader?.currentTime ?? 0): ClipGroupStep => ({
    phase: next,
    actions,
    time,
    buffered: bufferedShare(group),
  });
  if (!leader) return result('paused');
  const wantsPlay = phase === 'playing' || phase === 'buffering';

  if (typeof event === 'object') {
    if (wantsPlay) actions.push({ type: 'pause-all' });
    resetRates(clips, actions);
    for (const clip of clips)
      if (clip.readyState >= 1) actions.push({ type: 'seek', key: clip.key, time: event.time });
    return result(wantsPlay ? 'buffering' : 'paused', event.time);
  }
  switch (event) {
    case 'pause': {
      if (!wantsPlay) return result(phase);
      actions.push({ type: 'pause-all' });
      resetRates(clips, actions);
      return result('paused');
    }
    case 'play': {
      if (wantsPlay) return result(phase);
      if (phase === 'ended') {
        for (const clip of clips) actions.push({ type: 'seek', key: clip.key, time: 0 });
        return result('buffering', 0);
      }
      const next = resume(group, leader, actions);
      if (next === 'buffering') actions.push({ type: 'prime' });
      return result(next);
    }
    case 'tick': {
      if (phase === 'buffering') return result(resume(group, leader, actions));
      if (phase !== 'playing') return result(phase);
      if (
        clips.some((clip) => clip.ended) ||
        (duration > 0 && leader.currentTime >= duration - END_EPSILON)
      ) {
        actions.push({ type: 'pause-all' });
        resetRates(clips, actions);
        return result('ended', duration > 0 ? duration : leader.currentTime);
      }
      if (clips.some(stalled)) {
        actions.push({ type: 'pause-all' });
        resetRates(clips, actions);
        return result('buffering');
      }
      if (leader.playbackRate !== 1) actions.push({ type: 'rate', key: leader.key, rate: 1 });
      for (const clip of clips) {
        if (clip === leader) continue;
        const drift = clip.currentTime - leader.currentTime;
        const size = Math.abs(drift);
        let rate = 1;
        if (size > SEEK_SECONDS) {
          if (!clip.seeking)
            actions.push({ type: 'seek', key: clip.key, time: leader.currentTime });
        } else if (size > NUDGE_SECONDS || (clip.playbackRate !== 1 && size > SETTLE_SECONDS)) {
          rate = drift > 0 ? 1 - NUDGE_RATE : 1 + NUDGE_RATE;
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
