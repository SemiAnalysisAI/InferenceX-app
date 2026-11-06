'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, SkipBack } from 'lucide-react';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { Button } from '@/components/ui/button';
import { rangeProgressStyle } from '@/components/ui/control-styles';

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

    let delay: number;
    if (idx < ts.length - 1 && ts[idx + 1] > 0 && ts[idx] > 0) {
      const gap = ts[idx + 1] - ts[idx];
      delay = Math.max(100, Math.min(2000, gap)) / spd;
    } else {
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
    <div className="bg-card border border-border/30 rounded-lg px-3 py-2 flex items-center gap-2 font-mono text-2xs">
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => {
          onToggle();
          track('agentic_workload_replay_toggled', { playing: !isPlaying });
        }}
        className="min-w-18 justify-start"
        title={isPlaying ? t.pause : t.play}
      >
        {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        {isPlaying ? t.pause : t.play}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        onClick={() => {
          onReset();
          track('agentic_workload_replay_reset');
        }}
        className="[&_svg:not([class*='size-'])]:size-3.5"
        title={t.resetTitle}
        aria-label={t.resetTitle}
      >
        <SkipBack aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={cycleSpeed}
        className="min-w-12 tabular-nums"
        title={t.cycleSpeed}
      >
        {speed}x
      </Button>

      <input
        type="range"
        min={0}
        max={total}
        value={currentIndex}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="range-slider ml-1 h-4 flex-1"
        style={rangeProgressStyle(currentIndex, 0, total)}
      />

      <span className="text-muted-foreground shrink-0 tabular-nums">
        {currentIndex} / {total}
      </span>
    </div>
  );
}
