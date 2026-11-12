import { describe, expect, it } from 'vitest';
import {
  stepClipGroup,
  type ClipAction,
  type ClipGroup,
  type ClipSnapshot,
  type ClipGroupStep,
} from './clip-sync';

const clip = (key: string, changes: Partial<ClipSnapshot> = {}): ClipSnapshot => ({
  key,
  currentTime: 1,
  duration: 5,
  bufferedEnd: 5,
  readyState: 4,
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
  ...changes,
});
const ofType = (step: ClipGroupStep, type: ClipAction['type']) =>
  step.actions.filter((action) => action.type === type);

describe('stepClipGroup', () => {
  it('pauses every clip together, without seeking, when the leader stalls', () => {
    const step = stepClipGroup(
      group([
        clip('b200', { readyState: 2, bufferedEnd: 1.1 }),
        clip('h100', { currentTime: 1.3 }),
      ]),
      'tick',
    );
    expect(step.phase).toBe('buffering');
    expect(ofType(step, 'pause-all')).toHaveLength(1);
    expect(ofType(step, 'seek')).toEqual([]);
    expect(ofType(step, 'play-all')).toEqual([]);
  });

  it('resumes every clip from the leader time once each has data ahead', () => {
    const waiting = group(
      [
        clip('b200', { currentTime: 1, readyState: 3, bufferedEnd: 1.5 }),
        clip('h100', { currentTime: 1.4 }),
      ],
      { phase: 'buffering' },
    );
    const aligning = stepClipGroup(waiting, 'tick');
    expect(aligning.phase).toBe('buffering');
    expect(aligning.actions).toEqual([{ type: 'seek', key: 'h100', time: 1 }]);
    expect(aligning.buffered).toBeCloseTo(0.3);

    const aligned = group([clip('b200', { readyState: 3, bufferedEnd: 1.5 }), clip('h100')], {
      phase: 'buffering',
    });
    expect(stepClipGroup(aligned, 'tick')).toMatchObject({ phase: 'buffering', actions: [] });

    const loaded = group([clip('b200', { readyState: 3, bufferedEnd: 2.2 }), clip('h100')], {
      phase: 'buffering',
    });
    expect(stepClipGroup(loaded, 'tick')).toMatchObject({
      phase: 'playing',
      actions: [{ type: 'play-all' }],
      time: 1,
    });
  });

  it('never seeks the audible clip and corrects the other clip toward it', () => {
    const step = stepClipGroup(
      group([clip('b200', { currentTime: 1 }), clip('h100', { currentTime: 1.5 })], {
        audible: 'h100',
      }),
      'tick',
    );
    expect(step.actions).toEqual([{ type: 'seek', key: 'b200', time: 1.5 }]);
    expect(step.time).toBe(1.5);
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

  it('seeks a follower exactly once for large drift and never while it is already seeking', () => {
    const drifted = stepClipGroup(
      group([clip('b200'), clip('h100', { currentTime: 1.5, playbackRate: 1.1 })]),
      'tick',
    );
    expect(drifted.actions).toEqual([
      { type: 'seek', key: 'h100', time: 1 },
      { type: 'rate', key: 'h100', rate: 1 },
    ]);
    const seeking = stepClipGroup(
      group([clip('b200'), clip('h100', { currentTime: 1.5, seeking: true, readyState: 1 })]),
      'tick',
    );
    expect(seeking.phase).toBe('playing');
    expect(seeking.actions).toEqual([]);
  });

  it('ends at the shared duration and restarts every clip from zero through buffering', () => {
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

  it('holds play until every clip is buffered to the shared end, reporting the slowest share', () => {
    const partial = [
      clip('b200', { currentTime: 0, readyState: 4, bufferedEnd: 2.5 }),
      clip('h100', { currentTime: 0, readyState: 4, bufferedEnd: 5, duration: 5.17 }),
    ];
    const pressed = stepClipGroup(group(partial, { phase: 'paused' }), 'play');
    expect(pressed.phase).toBe('loading');
    expect(ofType(pressed, 'play-all')).toEqual([]);
    expect(ofType(pressed, 'prime')).toHaveLength(1);
    expect(pressed.buffered).toBeCloseTo(0.5);
    expect(pressed.ready).toBe(false);
    expect(stepClipGroup(group(partial, { phase: 'loading' }), 'tick')).toMatchObject({
      phase: 'loading',
      actions: [],
    });
    const decoding = group(
      [clip('b200', { currentTime: 0, readyState: 2, bufferedEnd: 5 }), partial[1]],
      { phase: 'loading' },
    );
    expect(stepClipGroup(decoding, 'tick')).toMatchObject({ phase: 'loading', ready: false });
    const complete = group(
      [clip('b200', { currentTime: 0, readyState: 4, bufferedEnd: 4.96 }), partial[1]],
      { phase: 'loading' },
    );
    expect(stepClipGroup(complete, 'tick')).toMatchObject({
      phase: 'playing',
      actions: [{ type: 'play-all' }],
      ready: true,
    });
    expect(stepClipGroup(group(partial, { phase: 'paused' }), 'tick')).toMatchObject({
      phase: 'paused',
      actions: [],
      buffered: 0.5,
      ready: false,
    });
    const scrubbed = (end: number) =>
      group(
        [
          clip('b200', { currentTime: 4, readyState: 4, bufferedEnd: end }),
          clip('h100', { currentTime: 4, readyState: 4, bufferedEnd: 5 }),
        ],
        { phase: 'loading' },
      );
    expect(stepClipGroup(scrubbed(4.3), 'tick')).toMatchObject({ phase: 'loading', actions: [] });
    expect(stepClipGroup(scrubbed(4.96), 'tick')).toMatchObject({ phase: 'playing' });
  });

  it('hiding the page pauses playing clips but keeps a pending start', () => {
    const playing = stepClipGroup(
      group([clip('b200', { playbackRate: 1.1 }), clip('h100')]),
      'hide',
    );
    expect(playing).toMatchObject({
      phase: 'paused',
      actions: [{ type: 'pause-all' }, { type: 'rate', key: 'b200', rate: 1 }],
    });
    const partial = [clip('b200', { currentTime: 0, bufferedEnd: 2 }), clip('h100')];
    for (const phase of ['loading', 'buffering'] as const)
      expect(stepClipGroup(group(partial, { phase }), 'hide')).toMatchObject({
        phase,
        actions: [],
      });
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
      group([clip('b200', { bufferedEnd: 2.2 }), clip('h100')], { ...slow, phase: 'buffering' }),
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
});
