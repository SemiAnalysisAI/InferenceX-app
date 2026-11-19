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

const MINECRAFT_OST_VIDEO_ID = 'bIOiV4d1SVI';

const SONGS = [
  { name: 'Subwoofer Lullaby', start: 0 },
  { name: 'Living Mice', start: 207 },
  { name: 'Haggstorm', start: 370 },
  { name: 'Minecraft', start: 572 },
  { name: 'Mice on Venus', start: 817 },
  { name: 'Dry Hands', start: 1099 },
  { name: 'Wet Hands', start: 1146 },
  { name: 'Clark', start: 1233 },
  { name: 'Sweden', start: 1418 },
  { name: 'Danny', start: 1631 },
];

function getInitialMusicStart(): number {
  try {
    const raw = sessionStorage.getItem('minecraft-music-pos');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts < 30_000 && typeof parsed.time === 'number' && parsed.time > 0) {
        return Math.floor(parsed.time);
      }
    }
  } catch {}

  const song = SONGS[Math.floor(Math.random() * SONGS.length)];
  return song.start;
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
  const playerRef = useRef<YT.Player | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const nudgeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    function check() {
      setMusicEnabled(localStorage.getItem('minecraft-music') !== 'false');
    }
    check();
    window.addEventListener('minecraft-music-toggle', check);
    return () => window.removeEventListener('minecraft-music-toggle', check);
  }, []);

  const showMusic = isMinecraft && musicEnabled;

  useEffect(() => {
    if (!showMusic) return;
    if (document.querySelector('#yt-iframe-api')) return;
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.append(tag);
  }, [showMusic]);

  useEffect(() => {
    if (!showMusic) return;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const time = player.getCurrentTime();
        if (time > 0) {
          sessionStorage.setItem('minecraft-music-pos', JSON.stringify({ time, ts: Date.now() }));
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [showMusic]);

  useEffect(() => {
    if (!showMusic) return;
    function save() {
      const player = playerRef.current;
      if (!player) return;
      try {
        const time = player.getCurrentTime();
        if (time > 0) {
          sessionStorage.setItem('minecraft-music-pos', JSON.stringify({ time, ts: Date.now() }));
        }
      } catch {}
    }
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, [showMusic]);

  useEffect(() => {
    if (!showMusic) {
      playerRef.current?.destroy();
      playerRef.current = null;
      if (wrapperRef.current) wrapperRef.current.innerHTML = '';
      return;
    }

    let disposed = false;
    let retry: ReturnType<typeof setInterval> | undefined;
    function createPlayer() {
      if (disposed || playerRef.current || !wrapperRef.current) return;
      const el = document.createElement('div');
      wrapperRef.current.append(el);

      let started = false;
      const startSeconds = getInitialMusicStart();

      function nudge() {
        if (disposed || started) return;
        playerRef.current?.playVideo();
      }
      nudgeRef.current = nudge;
      function onStarted() {
        started = true;
        document.removeEventListener('pointerdown', nudge, true);
        document.removeEventListener('keydown', nudge, true);
        nudgeRef.current = null;
      }

      try {
        playerRef.current = new YT.Player(el, {
          height: '1',
          width: '1',
          videoId: MINECRAFT_OST_VIDEO_ID,
          playerVars: {
            autoplay: 1,
            loop: 1,
            playlist: MINECRAFT_OST_VIDEO_ID,
            start: startSeconds,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
          },
          events: {
            onReady: (e: YT.PlayerEvent) => {
              if (disposed) return;
              e.target.setVolume(30);
              e.target.playVideo();
              document.addEventListener('pointerdown', nudge, true);
              document.addEventListener('keydown', nudge, true);
              if (userHasInteracted) {
                let retries = 0;
                retry = setInterval(() => {
                  if (disposed || started || retries++ > 10) {
                    clearInterval(retry);
                    return;
                  }
                  playerRef.current?.playVideo();
                }, 300);
              }
            },
            onStateChange: (e: YT.PlayerEvent & { data: number }) => {
              if (disposed) return;
              if (e.data === 1 && !started) onStarted();
              if (e.data === 0) e.target.playVideo();
            },
          },
        });
      } catch {}
    }

    let installedCallback = false;
    if (typeof YT !== 'undefined' && typeof YT.Player === 'function') {
      createPlayer();
    } else {
      installedCallback = true;
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        createPlayer();
      };
    }

    return () => {
      disposed = true;
      clearInterval(retry);
      if (installedCallback) {
        window.onYouTubeIframeAPIReady = undefined;
      }
      if (nudgeRef.current) {
        document.removeEventListener('pointerdown', nudgeRef.current, true);
        document.removeEventListener('keydown', nudgeRef.current, true);
        nudgeRef.current = null;
      }
      const player = playerRef.current;
      if (player) {
        try {
          const time = player.getCurrentTime();
          if (time > 0) {
            sessionStorage.setItem('minecraft-music-pos', JSON.stringify({ time, ts: Date.now() }));
          }
        } catch {}
      }
      playerRef.current?.destroy();
      playerRef.current = null;
      if (wrapperRef.current) wrapperRef.current.innerHTML = '';
    };
  }, [showMusic]);

  if (!isMinecraft) return null;

  return (
    <>
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, opacity: 0.18 }}>
        <MinecraftScene />
      </div>
      <div
        ref={wrapperRef}
        className="fixed"
        style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none', zIndex: -1 }}
      />
    </>
  );
}
