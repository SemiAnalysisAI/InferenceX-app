'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';

const STRINGS = {
  en: {
    pause: 'Pause',
    play: 'Play',
    resetTitle: 'Reset',
    cycleSpeed: 'Cycle speed',
  },
  zh: {
    pause: '暂停',
    play: '播放',
    resetTitle: '重置',
    cycleSpeed: '切换速度',
  },
} as const;

// ── Replay Hook ────────────────────────────────────────────────────

type Speed = 1 | 2 | 5 | 10;

interface UseSessionReplayReturn {
  isPlaying: boolean;
  currentIndex: number;
  speed: Speed;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (s: Speed) => void;
  seekTo: (index: number) => void;
  reset: () => void;
}

export function useSessionReplay(nodeCount: number, timestamps: number[]): UseSessionReplayReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeedState] = useState<Speed>(1);

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const speedRef = useRef(speed);
  speedRef.current = speed;

  const timestampsRef = useRef(timestamps);
  timestampsRef.current = timestamps;

  const nodeCountRef = useRef(nodeCount);
  nodeCountRef.current = nodeCount;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback(() => {
    const idx = currentIndexRef.current;
    const total = nodeCountRef.current;
    const ts = timestampsRef.current;
    const spd = speedRef.current;

    if (idx >= total) {
      setIsPlaying(false);
      clearTimer();
      return;
    }

    // Compute delay based on timestamp gaps
    let delay: number;
    if (idx < ts.length - 1 && ts[idx + 1] > 0 && ts[idx] > 0) {
      const gap = ts[idx + 1] - ts[idx];
      delay = Math.max(100, Math.min(2000, gap)) / spd;
    } else {
      // Default gap when no timestamp data
      delay = 500 / spd;
    }

    timerRef.current = setTimeout(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        if (next >= nodeCountRef.current) {
          setIsPlaying(false);
          return nodeCountRef.current;
        }
        return next;
      });
    }, delay);
  }, [clearTimer]);

  // Schedule next tick whenever playing and currentIndex changes
  useEffect(() => {
    if (!isPlaying) {
      clearTimer();
      return;
    }
    if (currentIndex >= nodeCount) {
      setIsPlaying(false);
      clearTimer();
      return;
    }
    scheduleNext();
    return clearTimer;
  }, [isPlaying, currentIndex, nodeCount, scheduleNext, clearTimer]);

  const play = useCallback(() => {
    if (currentIndexRef.current >= nodeCountRef.current) {
      setCurrentIndex(0);
    }
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev && currentIndexRef.current >= nodeCountRef.current) {
        setCurrentIndex(0);
      }
      return !prev;
    });
  }, []);

  const setSpeed = useCallback((s: Speed) => {
    setSpeedState(s);
  }, []);

  const seekTo = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, nodeCountRef.current)));
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => clearTimer, [clearTimer]);

  return {
    isPlaying,
    currentIndex,
    speed,
    play,
    pause,
    toggle,
    setSpeed,
    seekTo,
    reset,
  };
}

// ── Replay Controls Component ──────────────────────────────────────

const SPEED_CYCLE: Speed[] = [1, 2, 5, 10];

interface ReplayControlsProps {
  isPlaying: boolean;
  currentIndex: number;
  total: number;
  speed: Speed;
  onToggle: () => void;
  onSpeedChange: (s: Speed) => void;
  onSeek: (index: number) => void;
  onReset: () => void;
}

export function ReplayControls({
  isPlaying,
  currentIndex,
  total,
  speed,
  onToggle,
  onSpeedChange,
  onSeek,
  onReset,
}: ReplayControlsProps) {
  const t = STRINGS[useLocale()];
  const cycleSpeed = () => {
    const idx = SPEED_CYCLE.indexOf(speed);
    const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
    onSpeedChange(next);
    track('agentic_workload_replay_speed_changed', { speed: next });
  };

  return (
    <div className="bg-surface border border-border rounded-md px-3 py-2 flex items-center gap-3 font-mono text-2xs">
      {/* Play/Pause */}
      <button
        onClick={() => {
          onToggle();
          track('agentic_workload_replay_toggled', { playing: !isPlaying });
        }}
        className="bg-surface hover:bg-surface-hover border border-border rounded px-2 py-1 font-mono text-2xs text-foreground transition-colors min-w-[52px]"
        title={isPlaying ? t.pause : t.play}
      >
        {isPlaying ? `\u23F8 ${t.pause}` : `\u25B6 ${t.play}`}
      </button>

      {/* Reset */}
      <button
        onClick={() => {
          onReset();
          track('agentic_workload_replay_reset');
        }}
        className="bg-surface hover:bg-surface-hover border border-border rounded px-2 py-1 font-mono text-2xs text-foreground transition-colors"
        title={t.resetTitle}
      >
        {'\u23EE'}
      </button>

      {/* Speed */}
      <button
        onClick={cycleSpeed}
        className="bg-surface hover:bg-surface-hover border border-border rounded px-2 py-1 font-mono text-2xs text-emerald-500 transition-colors min-w-[36px]"
        title={t.cycleSpeed}
      >
        {speed}x
      </button>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={total}
        value={currentIndex}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="flex-1 h-1 accent-emerald-500 cursor-pointer"
      />

      {/* Counter */}
      <span className="text-muted-foreground shrink-0">
        {currentIndex} / {total}
      </span>
    </div>
  );
}
