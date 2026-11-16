/**
 * Group playback rules for the synchronized comparison clips. `stepClipGroup` is pure: the
 * component gathers one snapshot per active clip, applies the returned actions to the video
 * elements and renders the phase, so no playback rule lives in the component.
 */

/**
 * `loading` waits for every clip to be able to play before the group starts; `buffering` is a wait
 * mid-play, for a clip that ran out of data or one that fell behind. Both end the same way: every
 * clip can play and they are at one time. A clip that waits for data is never paused, because some
 * browsers (iOS) load nothing for a paused clip.
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
  paused: boolean;
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
  /** Seconds since the group last started playing. */
  sinceStart: number;
}

export type ClipAction =
  | { type: 'play-all' }
  | { type: 'pause-all' }
  /** play() and no pause: the clip lacks data or is behind, and plays on its own until it has caught up. */
  | { type: 'play'; key: string }
  /** Holds a clip that is ready and ahead while another catches up. */
  | { type: 'pause'; key: string }
  /** play() then pause() inside the user gesture, so a browser that wants a gesture lets the held clip start later. */
  | { type: 'prime'; key: string }
  | { type: 'seek'; key: string; time: number }
  | { type: 'rate'; key: string; rate: number };

export interface ClipGroupStep {
  phase: ClipPhase;
  actions: ClipAction[];
  /** Group time to display. */
  time: number;
  /** Share of the shared duration buffered by the slowest clip, 0..1. */
  buffered: number;
  /** No clip is waiting for data. */
  ready: boolean;
}

const HAVE_FUTURE_DATA = 3;
/** Drift that starts a playbackRate nudge on a follower; clips this close count as at one time. */
export const NUDGE_SECONDS = 0.04;
/** Drift at which a nudged follower returns to the base speed. */
const SETTLE_SECONDS = 0.01;
/** Drift beyond which the clips ahead wait for the one behind instead of a nudge. */
export const HOLD_SECONDS = 0.25;
/** A gap the clip behind plays through to catch up; a wider one is closed by a seek. */
export const CATCH_UP_SECONDS = 1;
/** Seconds after a start in which drift only nudges, so a slow start cannot hold the clips again and again. */
export const REST_SECONDS = 2;
export const NUDGE_RATE = 0.1;
const END_EPSILON = 0.02;

export const clipGroupActive = (phase: ClipPhase) =>
  phase === 'loading' || phase === 'buffering' || phase === 'playing';

/** At the end of the media a clip has no data ahead and never will. */
function atEnd(clip: ClipSnapshot, duration: number) {
  const end = duration > 0 ? duration : clip.duration;
  return clip.ended || (end > 0 && clip.currentTime >= end - END_EPSILON);
}

/** Waiting for data: not seeking, and nothing to play from its time. */
const starved = (clip: ClipSnapshot, duration: number) =>
  !clip.seeking && clip.readyState < HAVE_FUTURE_DATA && !atEnd(clip, duration);

function leaderOf({ clips, audible, duration }: ClipGroup) {
  return (
    clips.find((clip) => clip.key === audible) ??
    clips.find((clip) => !starved(clip, duration)) ??
    clips[0]
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

/**
 * One step of a wait. Every clip that lacks data or is behind plays; a clip that is ready and
 * ahead is held. Once all are ready and at one time they start together. Clips further apart than
 * a clip can play through are seeked to the leader first. `gesture` marks the step taken inside
 * the user's tap.
 */
function resume(
  group: ClipGroup,
  leader: ClipSnapshot,
  actions: ClipAction[],
  waiting: 'loading' | 'buffering',
  gesture = false,
): ClipPhase {
  const { clips, duration } = group;
  // A seeking clip reports its target, not where its picture is; nothing moves until it lands.
  if (clips.some((clip) => clip.seeking)) return waiting;
  const times = clips.map((clip) => clip.currentTime);
  const front = Math.max(...times);
  if (front - Math.min(...times) > CATCH_UP_SECONDS) {
    for (const clip of clips) {
      if (!clip.paused && !starved(clip, duration)) actions.push({ type: 'pause', key: clip.key });
      if (clip !== leader && Math.abs(clip.currentTime - leader.currentTime) > NUDGE_SECONDS)
        actions.push({ type: 'seek', key: clip.key, time: leader.currentTime });
    }
    return waiting;
  }
  const moving = clips.filter(
    (clip) => starved(clip, duration) || front - clip.currentTime > NUDGE_SECONDS,
  );
  // Some held and some playing would start apart by however long a start takes.
  const together = clips.every((clip) => clip.paused) || clips.every((clip) => !clip.paused);
  if (moving.length === 0 && together) {
    resetRates(group, actions);
    actions.push({ type: 'play-all' });
    return 'playing';
  }
  for (const clip of clips) {
    if (moving.includes(clip)) {
      if (clip.paused) actions.push({ type: 'play', key: clip.key });
    } else if (!clip.paused) actions.push({ type: 'pause', key: clip.key });
    else if (gesture) actions.push({ type: 'prime', key: clip.key });
  }
  return waiting;
}

/**
 * The frames the shared duration holds, or null without a frame rate or playable media. The total
 * is the recorded count, unless the playable media is shorter; a playable clip shows at least one.
 */
export const frameClock = (duration: number, fps: number | null, recorded: number | null) =>
  fps !== null && fps > 0 && duration > 0
    ? { fps, total: Math.max(1, Math.min(recorded ?? Infinity, Math.round(duration * fps))) }
    : null;

/** Zero-based frame shown at `time`; the epsilon keeps an exact frame boundary on its own frame. */
export const frameAt = (time: number, fps: number, total: number) =>
  Math.max(0, Math.min(total - 1, Math.floor(time * fps + 1e-6)));

/**
 * Seek target `frames` frames from the one shown at `time`. It lands mid-frame, so a browser that
 * rounds the seek still shows the intended frame.
 */
export const frameTime = (time: number, frames: number, fps: number, total: number) =>
  (Math.max(0, Math.min(total - 1, frameAt(time, fps, total) + frames)) + 0.5) / fps;

export function stepClipGroup(group: ClipGroup, event: ClipEvent): ClipGroupStep {
  const { phase, clips, duration, speed } = group;
  const leader = leaderOf(group);
  const actions: ClipAction[] = [];
  const result = (next: ClipPhase, time = leader?.currentTime ?? 0): ClipGroupStep => ({
    phase: next,
    actions,
    time,
    buffered: bufferedShare(group),
    ready: !clips.some((clip) => starved(clip, duration)),
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
      if (!active) return result(phase);
      actions.push({ type: 'pause-all' });
      // A hidden page keeps a start the user is waiting for; the wait goes on when it is back.
      if (event === 'hide' && phase !== 'playing') return result(phase);
      resetRates(group, actions);
      return result('paused');
    }
    case 'play': {
      if (active) return result(phase);
      if (phase === 'ended') {
        for (const clip of clips) actions.push({ type: 'seek', key: clip.key, time: 0 });
        return result('loading', 0);
      }
      return result(resume(group, leader, actions, 'loading', true));
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
      // Nothing moves, so there is nothing to hold: the wait is only named.
      if (clips.every((clip) => starved(clip, duration))) {
        resetRates(group, actions);
        return result('buffering');
      }
      // No clip is seeked while it plays: a seek takes longer than the drift it would close, and the
      // clip is behind again when it lands. The clips ahead wait instead. A clip short of data is
      // waited for at once; two that both play are, only when the start has had time to settle.
      const times = clips.map((clip) => clip.currentTime);
      const front = Math.max(...times);
      const behind = clips.filter((clip) => front - clip.currentTime > HOLD_SECONDS);
      if (
        behind.length > 0 &&
        (group.sinceStart >= REST_SECONDS || behind.some((clip) => starved(clip, duration)))
      ) {
        for (const clip of clips)
          if (!behind.includes(clip) && !starved(clip, duration))
            actions.push({ type: 'pause', key: clip.key });
        resetRates(group, actions);
        return result('buffering');
      }
      if (leader.playbackRate !== speed)
        actions.push({ type: 'rate', key: leader.key, rate: speed });
      for (const clip of clips) {
        if (clip === leader) continue;
        const drift = clip.currentTime - leader.currentTime;
        const size = Math.abs(drift);
        const rate =
          size > NUDGE_SECONDS || (clip.playbackRate !== speed && size > SETTLE_SECONDS)
            ? speed * (drift > 0 ? 1 - NUDGE_RATE : 1 + NUDGE_RATE)
            : speed;
        if (clip.playbackRate !== rate) actions.push({ type: 'rate', key: clip.key, rate });
      }
      return result('playing');
    }
    default: {
      return result(phase);
    }
  }
}
