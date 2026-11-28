'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

const MinecraftScene = dynamic(() => import('./minecraft-scene'), {
  ssr: false,
  loading: () => null,
});

const INTERACTIVE =
  'button, a, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="link"], input[type="checkbox"], input[type="radio"], summary';

let userHasInteracted = false;

/** C418 "Sweden" from the game's own asset index, trimmed to a 140 s mono loop (see README). */
const MUSIC_SRC = '/decorative/minecraft/ip/audio/sweden-loop.mp3';
const MUSIC_TITLE = 'C418 - Sweden';
const MUSIC_VOLUME = 0.3;
const MUSIC_POS_KEY = 'minecraft-music-pos';

function getInitialMusicStart(): number {
  try {
    const raw = sessionStorage.getItem(MUSIC_POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts < 30_000 && typeof parsed.time === 'number' && parsed.time > 0) {
        return parsed.time;
      }
    }
  } catch {}
  return 0;
}

export function MinecraftBackground() {
  const [isMinecraft, setIsMinecraft] = useState(false);

  useEffect(() => {
    userHasInteracted ||= navigator.userActivation?.hasBeenActive ?? false;
    const markInteracted = () => {
      userHasInteracted = true;
    };
    document.addEventListener('pointerdown', markInteracted, { capture: true, once: true });
    document.addEventListener('keydown', markInteracted, { capture: true, once: true });
    return () => {
      document.removeEventListener('pointerdown', markInteracted, true);
      document.removeEventListener('keydown', markInteracted, true);
    };
  }, []);

  useEffect(() => {
    function check() {
      setIsMinecraft(document.documentElement.classList.contains('minecraft'));
    }
    check();

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    function check() {
      setSoundEnabled(localStorage.getItem('minecraft-sound') !== 'false');
    }
    check();
    window.addEventListener('minecraft-sound-toggle', check);
    return () => window.removeEventListener('minecraft-sound-toggle', check);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (typeof AudioContext === 'undefined') return;
    const controller = new AbortController();
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    fetch('/minecraft-click.mp3', { signal: controller.signal })
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (!cancelled) bufferRef.current = decoded;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
      void ctx.close().catch(() => {});
      audioCtxRef.current = null;
      bufferRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isMinecraft || !soundEnabled) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(INTERACTIVE)) return;
      if (target.closest('[data-mc-silent]')) return;
      const ctx = audioCtxRef.current;
      const buffer = bufferRef.current;
      if (!ctx || !buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      source.buffer = buffer;
      source.connect(gain).connect(ctx.destination);
      source.start();
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isMinecraft, soundEnabled]);

  const [musicEnabled, setMusicEnabled] = useState(false);

  useEffect(() => {
    function check() {
      setMusicEnabled(localStorage.getItem('minecraft-music') !== 'false');
    }
    check();
    window.addEventListener('minecraft-music-toggle', check);
    return () => window.removeEventListener('minecraft-music-toggle', check);
  }, []);

  const showMusic = isMinecraft && musicEnabled;

  // The music loop: a local file, created only once music is on, started only by a gesture.
  useEffect(() => {
    if (!showMusic) return;
    const audio = new Audio();
    audio.preload = 'none';
    audio.loop = true;
    audio.volume = MUSIC_VOLUME;
    let started = false;
    let disposed = false;
    const save = () => {
      if (audio.currentTime > 0) {
        try {
          sessionStorage.setItem(
            MUSIC_POS_KEY,
            JSON.stringify({ time: audio.currentTime, ts: Date.now() }),
          );
        } catch {}
      }
    };
    const start = () => {
      if (disposed || started) return;
      started = true;
      audio.src = MUSIC_SRC;
      const resume = getInitialMusicStart();
      if (resume > 0) {
        audio.addEventListener('loadedmetadata', () => (audio.currentTime = resume), {
          once: true,
        });
      }
      void audio
        .play()
        .then(() => {
          if (disposed) return;
          window.dispatchEvent(
            new CustomEvent('minecraft-line', { detail: { id: 'nowPlaying', arg: MUSIC_TITLE } }),
          );
        })
        .catch(() => {
          started = false;
        });
    };
    const onGesture = () => {
      start();
      if (started) {
        document.removeEventListener('pointerdown', onGesture, true);
        document.removeEventListener('keydown', onGesture, true);
      }
    };
    if (userHasInteracted) start();
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
    const interval = setInterval(save, 2000);
    window.addEventListener('beforeunload', save);
    return () => {
      disposed = true;
      save();
      clearInterval(interval);
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('pointerdown', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [showMusic]);

  if (!isMinecraft) return null;

  return (
    <>
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, opacity: 0.18 }}>
        <MinecraftScene />
      </div>
    </>
  );
}
