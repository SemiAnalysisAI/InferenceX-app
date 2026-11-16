import { describe, expect, it } from 'vitest';
import {
  CATCH_UP_SECONDS,
  HOLD_SECONDS,
  NUDGE_SECONDS,
  REST_SECONDS,
  stepClipGroup,
  type ClipAction,
  type ClipEvent,
  type ClipGroup,
  type ClipPhase,
  type ClipSnapshot,
  type ClipGroupStep,
} from './clip-sync';

const clip = (key: string, changes: Partial<ClipSnapshot> = {}): ClipSnapshot => ({
  key,
  currentTime: 1,
  duration: 5,
  bufferedEnd: 5,
  readyState: 4,
  paused: false,
  seeking: false,
  ended: false,
  playbackRate: 1,
  ...changes,
});
const group = (clips: ClipSnapshot[], changes: Partial<ClipGroup> = {}): ClipGroup => ({
  phase: 'playing',
  clips,
  audible: null,
  duration: 5,
  speed: 1,
  loop: false,
  sinceStart: 10,
  ...changes,
});
const ofType = (step: ClipGroupStep, type: ClipAction['type']) =>
  step.actions.filter((action) => action.type === type);

/**
 * Two video elements as a phone gives them, stepped at 60 Hz through `stepClipGroup`: a clip loads
 * only while play() is requested on it and has data after `loadSeconds` of that, and a seek lands
 * `seekSeconds` after it is asked for.
 */
function phone(
  start: Record<string, { time?: number; loadSeconds?: number; paused?: boolean }>,
  options: { phase?: ClipPhase; seekSeconds?: number; loop?: boolean } = {},
) {
  const clips = Object.entries(start).map(([key, begin]) => ({
    key,
    time: begin.time ?? 0,
    paused: begin.paused ?? true,
    need: begin.loadSeconds ?? 0,
    seekingFor: 0,
    rate: 1,
  }));
  const seen = {
    seeks: 0,
    starts: 0,
    pausedWithoutData: 0,
    phases: [options.phase ?? 'paused'] as ClipPhase[],
    playingAt: null as number | null,
  };
  let phase: ClipPhase = options.phase ?? 'paused';
  let clock = 0;
  let startedAt = phase === 'playing' ? -10 : -Infinity;
  const find = (key: string) => clips.find((each) => each.key === key)!;
  const pause = (each: (typeof clips)[number]) => {
    if (!each.paused && each.need > 0) seen.pausedWithoutData += 1;
    each.paused = true;
  };
  const dispatch = (event: ClipEvent) => {
    const step = stepClipGroup(
      {
        phase,
        audible: null,
        duration: 5,
        speed: 1,
        loop: options.loop ?? false,
        sinceStart: clock - startedAt,
        clips: clips.map((each) =>
          clip(each.key, {
            currentTime: each.time,
            bufferedEnd: each.need > 0 ? 0 : 5,
            readyState: each.need > 0 ? 1 : 4,
            paused: each.paused,
            seeking: each.seekingFor > 0,
            playbackRate: each.rate,
          }),
        ),
      },
      event,
    );
    for (const action of step.actions) {
      if (action.type === 'play-all') {
        startedAt = clock;
        seen.starts += 1;
        for (const each of clips) each.paused = false;
      } else if (action.type === 'pause-all') clips.forEach(pause);
      else if (action.type === 'play') find(action.key).paused = false;
      else if (action.type === 'pause') pause(find(action.key));
      else if (action.type === 'rate') find(action.key).rate = action.rate;
      else if (action.type === 'seek') {
        seen.seeks += 1;
        find(action.key).time = action.time;
        find(action.key).seekingFor = options.seekSeconds ?? 0.02;
      }
    }
    if (step.phase !== phase) {
      seen.phases.push(step.phase);
      if (step.phase === 'playing') seen.playingAt ??= clock;
    }
    phase = step.phase;
  };
  return {
    clips,
    seen,
    dispatch,
    /** Runs the frame loop for `seconds`. */
    run(seconds: number) {
      for (let frame = 0; frame < seconds * 60; frame += 1) {
        clock += 1 / 60;
        for (const each of clips) {
          if (each.seekingFor > 0) each.seekingFor = Math.max(0, each.seekingFor - 1 / 60);
          else if (each.paused) continue;
          else if (each.need > 0) each.need = Math.max(0, each.need - 1 / 60);
          else each.time += each.rate / 60;
        }
        dispatch('tick');
      }
    },
    gap: () => Math.abs(clips[0].time - clips[1].time),
  };
}

/** One frame of a wait mid-play. */
const wait = (clips: ClipSnapshot[]) => stepClipGroup(group(clips, { phase: 'buffering' }), 'tick');

describe('stepClipGroup', () => {
  it('starts inside the tap: a clip without data plays and is not paused, a ready one is primed', () => {
    const cold = { currentTime: 0, readyState: 0, bufferedEnd: 0, paused: true };
    const pressed = stepClipGroup(
      group([clip('b200', cold), clip('h100', cold)], { phase: 'paused' }),
      'play',
    );
    expect(pressed).toMatchObject({
      phase: 'loading',
      actions: [
        { type: 'play', key: 'b200' },
        { type: 'play', key: 'h100' },
      ],
      ready: false,
    });
    const one = stepClipGroup(
      group([clip('b200', cold), clip('h100', { currentTime: 0, paused: true })], {
        phase: 'paused',
      }),
      'play',
    );
    expect(one.actions).toEqual([
      { type: 'play', key: 'b200' },
      { type: 'prime', key: 'h100' },
    ]);
    const warm = stepClipGroup(
      group([clip('b200', { paused: true }), clip('h100', { paused: true })], { phase: 'paused' }),
      'play',
    );
    expect(warm).toMatchObject({ phase: 'playing', actions: [{ type: 'play-all' }] });
    // A tap while one clip still seeks, as after a prompt switch that kept one side.
    const landing = stepClipGroup(
      group([clip('b200', cold), clip('h100', { paused: true, seeking: true, readyState: 1 })], {
        phase: 'paused',
      }),
      'play',
    );
    expect(landing).toMatchObject({
      phase: 'loading',
      actions: [
        { type: 'play', key: 'b200' },
        { type: 'prime', key: 'h100' },
      ],
    });
  });

  it('starts as soon as both clips can play, not when both are downloaded, with no paused clip left to load', () => {
    const start = phone({ b200: { loadSeconds: 0.5 }, h100: { loadSeconds: 0.8 } });
    start.dispatch('play');
    start.run(2);
    expect(start.seen.phases).toEqual(['paused', 'loading', 'playing']);
    expect(start.seen.playingAt).toBeGreaterThan(0.8);
    expect(start.seen.playingAt).toBeLessThan(0.9);
    expect(start.seen.pausedWithoutData).toBe(0);
    expect(start.seen.seeks).toBe(0);
    expect(start.gap()).toBeLessThanOrEqual(NUDGE_SECONDS);
  });

  it('in a wait, plays the clip that lacks data or is behind and holds the one ahead until they meet', () => {
    const starved = wait([
      clip('b200', { readyState: 2, bufferedEnd: 1, paused: true }),
      clip('h100', { currentTime: 1.3 }),
    ]);
    expect(starved).toMatchObject({
      phase: 'buffering',
      actions: [
        { type: 'play', key: 'b200' },
        { type: 'pause', key: 'h100' },
      ],
      ready: false,
    });
    // It has data again and plays on its own toward the held clip.
    const behind = wait([clip('b200'), clip('h100', { currentTime: 1.3, paused: true })]);
    expect(behind).toMatchObject({ phase: 'buffering', actions: [], ready: true });
    // Level: it stops as well, so both start from rest.
    const level = wait([
      clip('b200', { currentTime: 1.28 }),
      clip('h100', { currentTime: 1.3, paused: true }),
    ]);
    expect(level).toMatchObject({ phase: 'buffering', actions: [{ type: 'pause', key: 'b200' }] });
    const rested = wait([
      clip('b200', { currentTime: 1.28, paused: true }),
      clip('h100', { currentTime: 1.3, paused: true }),
    ]);
    expect(rested).toMatchObject({ phase: 'playing', actions: [{ type: 'play-all' }] });
    // Both got data in the same frame and already run together.
    expect(wait([clip('b200'), clip('h100')])).toMatchObject({
      phase: 'playing',
      actions: [{ type: 'play-all' }],
    });
    const landing = wait([clip('b200', { seeking: true, readyState: 1 }), clip('h100')]);
    expect(landing).toMatchObject({ phase: 'buffering', actions: [] });
  });

  it('waits for a clip that falls a quarter second behind, at once when it lacks data', () => {
    const short = { readyState: 2, bufferedEnd: 1.1 };
    // A stall shorter than that pauses nothing.
    const brief = stepClipGroup(
      group([clip('b200', short), clip('h100', { currentTime: 1.1 })]),
      'tick',
    );
    expect(brief.phase).toBe('playing');
    expect(ofType(brief, 'pause')).toEqual([]);
    expect(ofType(brief, 'pause-all')).toEqual([]);
    const stalled = stepClipGroup(
      group([clip('b200', short), clip('h100', { currentTime: 1.3 })], { sinceStart: 0.1 }),
      'tick',
    );
    expect(stalled).toMatchObject({
      phase: 'buffering',
      actions: [{ type: 'pause', key: 'h100' }],
    });
    // Two clips that both play are left to the nudge while the start settles.
    const apart = [clip('b200'), clip('h100', { currentTime: 1.3 })];
    expect(stepClipGroup(group(apart, { sinceStart: REST_SECONDS - 0.1 }), 'tick')).toMatchObject({
      phase: 'playing',
      actions: [{ type: 'rate', key: 'h100', rate: 0.9 }],
    });
    expect(stepClipGroup(group(apart, { sinceStart: REST_SECONDS }), 'tick')).toMatchObject({
      phase: 'buffering',
      actions: [{ type: 'pause', key: 'h100' }],
    });
    const dry = stepClipGroup(group([clip('b200', short), clip('h100', short)]), 'tick');
    expect(dry).toMatchObject({ phase: 'buffering', actions: [], ready: false });
  });

  it('closes drift without a seek where a seek takes longer than the drift', () => {
    const drifted = phone(
      { b200: { time: 1, paused: false }, h100: { time: 1 + HOLD_SECONDS + 0.15, paused: false } },
      { phase: 'playing', seekSeconds: 0.4 },
    );
    drifted.run(3);
    expect(drifted.seen.seeks).toBe(0);
    expect(drifted.seen.phases).toEqual(['playing', 'buffering', 'playing']);
    expect(drifted.seen.starts).toBe(1);
    expect(drifted.gap()).toBeLessThanOrEqual(NUDGE_SECONDS);
  });

  it('seeks followers to the leader, never the audible clip, when they are too far apart to catch up', () => {
    const apart = [
      clip('b200', { paused: true }),
      clip('h100', { currentTime: 1 + CATCH_UP_SECONDS + 0.5 }),
    ];
    const step = stepClipGroup(group(apart, { phase: 'loading', audible: 'h100' }), 'tick');
    expect(step.actions).toEqual([
      { type: 'seek', key: 'b200', time: 1 + CATCH_UP_SECONDS + 0.5 },
      { type: 'pause', key: 'h100' },
    ]);
    expect(step.time).toBe(1 + CATCH_UP_SECONDS + 0.5);
    const mute = stepClipGroup(group(apart, { phase: 'loading' }), 'tick');
    expect(ofType(mute, 'seek')).toEqual([{ type: 'seek', key: 'h100', time: 1 }]);
  });

  it('nudges a follower with playbackRate for small drift and resets it once settled', () => {
    const ahead = stepClipGroup(group([clip('b200'), clip('h100', { currentTime: 1.15 })]), 'tick');
    expect(ahead.actions).toEqual([{ type: 'rate', key: 'h100', rate: 0.9 }]);
    const behind = stepClipGroup(group([clip('b200'), clip('h100', { currentTime: 0.9 })]), 'tick');
    expect(behind.actions).toEqual([{ type: 'rate', key: 'h100', rate: 1.1 }]);
    const settled = stepClipGroup(
      group([clip('b200'), clip('h100', { currentTime: 1.005, playbackRate: 0.9 })]),
      'tick',
    );
    expect(settled.actions).toEqual([{ type: 'rate', key: 'h100', rate: 1 }]);
    const steady = stepClipGroup(
      group([clip('b200'), clip('h100', { currentTime: 1.02 })]),
      'tick',
    );
    expect(steady.actions).toEqual([]);
  });

  it('ends at the shared duration and restarts every clip from zero through loading', () => {
    const ended = stepClipGroup(
      group([clip('b200', { currentTime: 4.99 }), clip('h100', { currentTime: 4.98 })]),
      'tick',
    );
    expect(ended).toMatchObject({ phase: 'ended', actions: [{ type: 'pause-all' }], time: 5 });
    const restarted = stepClipGroup(
      group([clip('b200', { currentTime: 5 }), clip('h100', { currentTime: 5 })], {
        phase: 'ended',
      }),
      'play',
    );
    expect(restarted).toMatchObject({
      phase: 'loading',
      actions: [
        { type: 'seek', key: 'b200', time: 0 },
        { type: 'seek', key: 'h100', time: 0 },
      ],
      time: 0,
    });
  });

  it('counts a clip at its end as ready, since it never has data ahead', () => {
    const end = { currentTime: 5, readyState: 2, paused: true };
    const scrubbed = stepClipGroup(
      group([clip('b200', end), clip('h100', end)], { phase: 'loading' }),
      'tick',
    );
    expect(scrubbed).toMatchObject({
      phase: 'playing',
      actions: [{ type: 'play-all' }],
      ready: true,
    });
  });

  it('reports the slowest clip’s buffered share, and waiting for data only while a clip lacks it', () => {
    const partial = [
      clip('b200', { currentTime: 0, readyState: 4, bufferedEnd: 2.5, paused: true }),
      clip('h100', { currentTime: 0, readyState: 4, bufferedEnd: 5, duration: 5.17, paused: true }),
    ];
    const idle = stepClipGroup(group(partial, { phase: 'paused' }), 'tick');
    expect(idle).toMatchObject({ phase: 'paused', actions: [], ready: true });
    expect(idle.buffered).toBeCloseTo(0.5);
    const decoding = group(
      [clip('b200', { currentTime: 0, readyState: 2, bufferedEnd: 0.4, paused: true }), partial[1]],
      { phase: 'loading' },
    );
    const waiting = stepClipGroup(decoding, 'tick');
    expect(waiting).toMatchObject({ phase: 'loading', ready: false });
    expect(waiting.buffered).toBeCloseTo(0.08);
  });

  it('hiding the page pauses the clips, and keeps a pending start for when it is back', () => {
    const playing = stepClipGroup(
      group([clip('b200', { playbackRate: 1.1 }), clip('h100')]),
      'hide',
    );
    expect(playing).toMatchObject({
      phase: 'paused',
      actions: [{ type: 'pause-all' }, { type: 'rate', key: 'b200', rate: 1 }],
    });
    const cold = { currentTime: 0, readyState: 1, bufferedEnd: 0 };
    for (const phase of ['loading', 'buffering'] as const) {
      expect(stepClipGroup(group([clip('b200', cold), clip('h100')], { phase }), 'hide')).toEqual(
        expect.objectContaining({ phase, actions: [{ type: 'pause-all' }] }),
      );
      // Back on the page, the clip without data plays again so that it loads.
      const back = [
        clip('b200', { ...cold, paused: true }),
        clip('h100', { currentTime: 0, paused: true }),
      ];
      expect(stepClipGroup(group(back, { phase }), 'tick')).toMatchObject({
        phase,
        actions: [{ type: 'play', key: 'b200' }],
      });
    }
  });

  it('scrubbing pauses the group, seeks every clip including the audible one, and reloads', () => {
    const step = stepClipGroup(
      group([clip('b200', { playbackRate: 1.1 }), clip('h100')], { audible: 'h100' }),
      { type: 'seek', time: 3 },
    );
    expect(step).toMatchObject({
      phase: 'loading',
      actions: [
        { type: 'pause-all' },
        { type: 'rate', key: 'b200', rate: 1 },
        { type: 'seek', key: 'b200', time: 3 },
        { type: 'seek', key: 'h100', time: 3 },
      ],
      time: 3,
    });
    const paused = stepClipGroup(group([clip('b200')], { phase: 'paused' }), {
      type: 'seek',
      time: 2,
    });
    expect(paused).toMatchObject({
      phase: 'paused',
      actions: [{ type: 'seek', key: 'b200', time: 2 }],
    });
  });

  it('keeps the chosen speed through drift nudges, scrubs and resumes instead of snapping to 1×', () => {
    const slow = { speed: 0.5 };
    // A reloaded source comes back at the element default rate of 1.
    const nudged = stepClipGroup(
      group([clip('b200'), clip('h100', { currentTime: 1.15, playbackRate: 0.5 })], slow),
      'tick',
    );
    expect(nudged.actions).toEqual([
      { type: 'rate', key: 'b200', rate: 0.5 },
      { type: 'rate', key: 'h100', rate: 0.45 },
    ]);
    const settled = stepClipGroup(
      group(
        [
          clip('b200', { playbackRate: 0.5 }),
          clip('h100', { currentTime: 1.005, playbackRate: 0.45 }),
        ],
        slow,
      ),
      'tick',
    );
    expect(settled.actions).toEqual([{ type: 'rate', key: 'h100', rate: 0.5 }]);
    const scrubbed = stepClipGroup(
      group([clip('b200', { playbackRate: 0.45 }), clip('h100', { playbackRate: 0.5 })], slow),
      { type: 'seek', time: 2 },
    );
    expect(ofType(scrubbed, 'rate')).toEqual([{ type: 'rate', key: 'b200', rate: 0.5 }]);
    const resumed = stepClipGroup(
      group([clip('b200', { paused: true }), clip('h100', { paused: true })], {
        ...slow,
        phase: 'buffering',
      }),
      'tick',
    );
    expect(resumed).toMatchObject({
      phase: 'playing',
      actions: [
        { type: 'rate', key: 'b200', rate: 0.5 },
        { type: 'rate', key: 'h100', rate: 0.5 },
        { type: 'play-all' },
      ],
    });
  });

  it('loops by rewinding every clip together, also when one side reaches the end first', () => {
    const looped = stepClipGroup(
      group([clip('b200', { currentTime: 4.9 }), clip('h100', { currentTime: 5, ended: true })], {
        loop: true,
      }),
      'tick',
    );
    expect(looped).toMatchObject({
      phase: 'loading',
      actions: [
        { type: 'pause-all' },
        { type: 'seek', key: 'b200', time: 0 },
        { type: 'seek', key: 'h100', time: 0 },
      ],
      time: 0,
    });
  });

  it('loops without a seek that chases: both rewind, land and start together', () => {
    const looping = phone(
      { b200: { time: 4.9, paused: false }, h100: { time: 4.9, paused: false } },
      { phase: 'playing', loop: true, seekSeconds: 0.3 },
    );
    looping.run(1);
    expect(looping.seen.phases).toEqual(['playing', 'loading', 'playing']);
    expect(looping.seen.seeks).toBe(2);
    expect(looping.seen.starts).toBe(1);
    expect(looping.gap()).toBeLessThanOrEqual(NUDGE_SECONDS);
  });
});
