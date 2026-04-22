'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

const MinecraftScene = dynamic(() => import('./minecraft-scene'), {
  ssr: false,
  loading: () => null,
});

const INTERACTIVE =
  'button, a, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="link"], input[type="checkbox"], input[type="radio"], summary';

/**
 * Track whether the user has interacted with the page.
 * Once true, stays true for the session — browsers remember the gesture.
 */
let userHasInteracted = false;
if (typeof document !== 'undefined') {
  const markInteracted = () => {
    userHasInteracted = true;
  };
  document.addEventListener('pointerdown', markInteracted, { capture: true, once: true });
  document.addEventListener('keydown', markInteracted, { capture: true, once: true });
}

/** Song start timestamps (in seconds) within the Minecraft OST compilation video. */
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
  } catch {
    /* ignore parse errors */
  }

  const song = SONGS[Math.floor(Math.random() * SONGS.length)];
  return song.start;
}

/**
 * Renders the floating 3D blocks background, plays the classic Minecraft
 * button click sound on interactive element presses, and streams the
 * Minecraft OST from YouTube — all only when the minecraft theme is enabled.
 */
export function MinecraftBackground() {
  const [isMinecraft, setIsMinecraft] = useState(false);

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

  // ── Click sound ──
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

  // Preload the click sound into an AudioBuffer for instant playback
  useEffect(() => {
    let cancelled = false;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    fetch('/minecraft-click.mp3')
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (!cancelled) bufferRef.current = decoded;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      ctx.close();
      audioCtxRef.current = null;
      bufferRef.current = null;
    };
  }, []);

  // Play Minecraft click sound on any interactive element press
  useEffect(() => {
    if (!isMinecraft || !soundEnabled) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(INTERACTIVE)) return;
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

  // ── Background music (YouTube IFrame API) ──
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

  // Load the YT IFrame API script once
  useEffect(() => {
    if (!showMusic) return;
    if (document.querySelector('#yt-iframe-api')) return;
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.append(tag);
  }, [showMusic]);

  // Periodically save playback position so music survives page navigations
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
      } catch {
        /* player may not be ready */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [showMusic]);

  // Save position on page unload for full-page navigations
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
      } catch {
        /* player may not be ready */
      }
    }
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, [showMusic]);

  // Create / destroy the player when showMusic toggles.
  // YT.Player replaces the target element with an iframe, so we create
  // a disposable inner div inside our stable wrapper to avoid React's
  // "removeChild" error when the component unmounts.
  useEffect(() => {
    if (!showMusic) {
      playerRef.current?.destroy();
      playerRef.current = null;
      if (wrapperRef.current) wrapperRef.current.innerHTML = '';
      return;
    }

    function createPlayer() {
      if (playerRef.current || !wrapperRef.current) return;
      const el = document.createElement('div');
      wrapperRef.current.append(el);

      let started = false;
      const startSeconds = getInitialMusicStart();

      function nudge() {
        if (started) return;
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
              e.target.setVolume(30);
              e.target.playVideo();
              // Browsers block autoplay without a prior user gesture.
              // Keep retrying on every interaction until the player
              // actually starts (onStateChange fires PLAYING).
              document.addEventListener('pointerdown', nudge, true);
              document.addEventListener('keydown', nudge, true);
              // If the user already interacted (e.g. clicked the theme
              // toggle), aggressively retry playVideo on short intervals
              // so music starts as soon as the browser allows it.
              if (userHasInteracted) {
                let retries = 0;
                const retry = setInterval(() => {
                  if (started || retries++ > 10) {
                    clearInterval(retry);
                    return;
                  }
                  playerRef.current?.playVideo();
                }, 300);
              }
            },
            onStateChange: (e: YT.PlayerEvent & { data: number }) => {
              // YT.PlayerState.PLAYING === 1
              if (e.data === 1 && !started) onStarted();
              // YT.PlayerState.ENDED === 0 — loop the single allowed video
              if (e.data === 0) e.target.playVideo();
            },
          },
        });
      } catch {
        // YouTube API failed (blocked by firewall/ad-blocker) — degrade silently
      }
    }

    // YT API might already be loaded
    let installedCallback = false;
    if (typeof YT !== 'undefined' && typeof YT.Player === 'function') {
      createPlayer();
    } else {
      // Wait for the API to load
      installedCallback = true;
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        createPlayer();
      };
    }

    return () => {
      // Restore global callback to prevent stale closure chain growth
      if (installedCallback) {
        window.onYouTubeIframeAPIReady = undefined;
      }
      // Clean up nudge listeners if playback never started
      if (nudgeRef.current) {
        document.removeEventListener('pointerdown', nudgeRef.current, true);
        document.removeEventListener('keydown', nudgeRef.current, true);
        nudgeRef.current = null;
      }
      // Save position before destroying
      const player = playerRef.current;
      if (player) {
        try {
          const time = player.getCurrentTime();
          if (time > 0) {
            sessionStorage.setItem('minecraft-music-pos', JSON.stringify({ time, ts: Date.now() }));
          }
        } catch {
          /* ignore */
        }
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
