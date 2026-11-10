'use client';

import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  clipGroupActive,
  frameTime,
  stepClipGroup,
  type ClipEvent,
  type ClipGroup,
  type ClipGroupStep,
  type ClipPhase,
  type ClipSnapshot,
} from './clip-sync';

/** Display refresh cap for the transport time and buffering share. */
const DISPLAY_INTERVAL_MS = 100;

function clipSnapshot(key: string, video: HTMLVideoElement): ClipSnapshot {
  const time = video.currentTime;
  let bufferedEnd = 0;
  for (let index = 0; index < video.buffered.length; index += 1)
    if (video.buffered.start(index) <= time + 0.1 && video.buffered.end(index) >= time) {
      bufferedEnd = video.buffered.end(index);
      break;
    }
  return {
    key,
    currentTime: time,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    bufferedEnd,
    readyState: video.readyState,
    seeking: video.seeking,
    ended: video.ended,
    playbackRate: video.playbackRate,
  };
}

/**
 * Drives the playable video elements registered under `keys` through `stepClipGroup`. The group
 * pauses and rewinds whenever `selection` (the shown clips) changes, `audible` is the only unmuted clip,
 * `playback` sets the base speed and loop, and `onRejected` receives the clips whose play() failed
 * for a reason other than group control.
 */
export function useClipGroup(
  keys: readonly string[],
  audible: string | null,
  selection: string,
  onRejected: (keys: string[]) => void,
  playback: Pick<ClipGroup, 'speed' | 'loop'>,
) {
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const [shown, setShown] = useState<Pick<ClipGroupStep, 'time' | 'buffered' | 'ready'>>({
    time: 0,
    buffered: 0,
    ready: false,
  });
  const [phase, setPhase] = useState<ClipPhase>('paused');
  const phaseRef = useRef<ClipPhase>('paused');
  const [durations, setDurations] = useState<Record<string, number>>({});
  const keyList = keys.join(',');
  const known = keys.flatMap((key) => (durations[key] > 0 ? [durations[key]] : []));
  const duration = known.length > 0 ? Math.min(...known) : 0;

  // Media can load metadata before React attaches its listeners, for example under SSR.
  useLayoutEffect(() => {
    const loaded = [...videos.current].flatMap(([key, video]) =>
      video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0
        ? [[key, video.duration] as const]
        : [],
    );
    setDurations((previous) =>
      loaded.some(([key, value]) => previous[key] !== value)
        ? { ...previous, ...Object.fromEntries(loaded) }
        : previous,
    );
  }, [keyList, selection]);

  // Owns `muted`: <Activity> re-runs this body on reveal, whereas an unchanged muted prop would not be reapplied.
  useLayoutEffect(() => {
    for (const [key, video] of videos.current) video.muted = key !== audible;
  }, [audible, keyList]);

  // The frame loop reads group inputs through this ref so it never re-subscribes mid-playback.
  const live = useRef({ keyList, audible, duration, onRejected, playback });
  live.current = { keyList, audible, duration, onRejected, playback };

  const dispatch = (event: ClipEvent): ClipGroupStep => {
    const current = live.current;
    const clips = current.keyList.split(',').flatMap((key) => {
      const video = videos.current.get(key);
      return video ? [clipSnapshot(key, video)] : [];
    });
    const step = stepClipGroup(
      {
        phase: phaseRef.current,
        clips,
        audible: current.audible,
        duration: current.duration,
        ...current.playback,
      },
      event,
    );
    const setPhaseNow = (next: ClipPhase) => {
      phaseRef.current = next;
      setPhase(next);
    };
    const playAll = () =>
      Promise.allSettled(clips.map((clip) => videos.current.get(clip.key)?.play())).then(
        (outcomes) => {
          // pause() interrupting play() rejects with AbortError; that is group control, not a media failure.
          const rejected = clips.flatMap((clip, index) => {
            const outcome = outcomes[index];
            return outcome.status === 'rejected' &&
              (outcome.reason as { name?: string } | null)?.name !== 'AbortError'
              ? [clip.key]
              : [];
          });
          if (rejected.length > 0) live.current.onRejected(rejected);
          if (
            phaseRef.current === 'playing' &&
            !outcomes.some((outcome) => outcome.status === 'fulfilled')
          )
            setPhaseNow('paused');
        },
      );
    for (const action of step.actions) {
      switch (action.type) {
        case 'play-all': {
          void playAll();
          break;
        }
        case 'pause-all': {
          for (const clip of clips) videos.current.get(clip.key)?.pause();
          break;
        }
        case 'prime': {
          // A prime is not a start. Its own pause() rejects every play() with AbortError, so there is no outcome to read.
          for (const clip of clips) {
            const video = videos.current.get(clip.key);
            if (!video) continue;
            void video.play().catch(() => {});
            video.pause();
          }
          break;
        }
        case 'seek': {
          const video = videos.current.get(action.key);
          if (video) video.currentTime = action.time;
          break;
        }
        case 'rate': {
          const video = videos.current.get(action.key);
          if (video) video.playbackRate = action.rate;
          break;
        }
        default: {
          break;
        }
      }
    }
    if (step.phase !== phaseRef.current) setPhaseNow(step.phase);
    return step;
  };
  const show = ({ time, buffered, ready }: ClipGroupStep) => setShown({ time, buffered, ready });
  /** Keeps the loaded share current while idle; the frame loop covers the active phases. */
  const refresh = () => {
    if (!clipGroupActive(phaseRef.current)) show(dispatch('tick'));
  };

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) show(dispatch('hide'));
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      for (const video of videos.current.values()) video.pause();
    };
  }, []);

  useEffect(() => {
    for (const [key, video] of videos.current) if (!keyList.split(',').includes(key)) video.pause();
    dispatch('pause');
    // A kept clip would otherwise hold its old time against a new clip at 0.
    show(dispatch({ type: 'seek', time: 0 }));
  }, [selection]);

  useEffect(() => {
    if (!clipGroupActive(phase)) return undefined;
    let frame = 0;
    let displayed = -Infinity;
    const tick = (now: number) => {
      const step = dispatch('tick');
      const running = clipGroupActive(step.phase);
      if (!running || now - displayed >= DISPLAY_INTERVAL_MS) {
        displayed = now;
        show(step);
      }
      if (running) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  return {
    videos,
    /** Ref callback for the clip's video element. */
    register: (key: string) => (element: HTMLVideoElement | null) => {
      if (element) videos.current.set(key, element);
      else videos.current.delete(key);
    },
    /** For onLoadedMetadata and onDurationChange: a source swap resets the duration to NaN. */
    measure: (key: string) => (event: SyntheticEvent<HTMLVideoElement>) => {
      const value = event.currentTarget.duration;
      const next = Number.isFinite(value) && value > 0 ? value : 0;
      setDurations((previous) =>
        (previous[key] ?? 0) === next ? previous : { ...previous, [key]: next },
      );
    },
    refresh,
    phase,
    time: shown.time,
    buffered: shown.buffered,
    ready: shown.ready,
    duration,
    /** Plays or pauses the group; returns whether it is now starting. */
    toggle: () => {
      const pausing = clipGroupActive(phaseRef.current);
      show(dispatch(pausing ? 'pause' : 'play'));
      return !pausing;
    },
    seek: (time: number) => show(dispatch({ type: 'seek', time })),
    /** Pauses the group and moves every clip `frames` frames from the shown one. */
    stepFrames: (frames: number, { fps, total }: { fps: number; total: number }) => {
      const { time } = dispatch('pause');
      show(dispatch({ type: 'seek', time: frameTime(time, frames, fps, total) }));
    },
  };
}
