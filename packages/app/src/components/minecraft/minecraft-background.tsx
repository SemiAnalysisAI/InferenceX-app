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
 * Renders the floating 3D Minecraft blocks background, plays
 * the classic button click sound on interactive element presses,
 * and streams background music from the Minecraft OST playlist.
 * Only active when the minecraft theme is enabled.
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
    if (!isMinecraft) return;
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
  }, [isMinecraft]);

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
        const index = player.getPlaylistIndex();
        if (time > 0) {
          sessionStorage.setItem(
            'minecraft-music-pos',
            JSON.stringify({ time, index, ts: Date.now() }),
          );
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
        const index = player.getPlaylistIndex();
        if (time > 0) {
          sessionStorage.setItem(
            'minecraft-music-pos',
            JSON.stringify({ time, index, ts: Date.now() }),
          );
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
      function nudge() {
        if (started) return;
        playerRef.current?.playVideo();
      }
      nudgeRef.current = nudge;
      function onStarted(player: YT.Player) {
        started = true;
        document.removeEventListener('pointerdown', nudge, true);
        document.removeEventListener('keydown', nudge, true);
        nudgeRef.current = null;

        // Resume from saved position if recent (< 30s ago), otherwise random
        let savedPos: { time: number; index: number; ts: number } | null = null;
        try {
          const raw = sessionStorage.getItem('minecraft-music-pos');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Date.now() - parsed.ts < 30_000) {
              savedPos = parsed;
            }
          }
        } catch {
          /* ignore parse errors */
        }

        if (savedPos) {
          // Resume: jump to saved playlist track, then seek within it
          if (typeof savedPos.index === 'number' && savedPos.index >= 0) {
            player.playVideoAt(savedPos.index);
          }
          // Delay seekTo so playVideoAt has time to load the track
          setTimeout(() => {
            if (typeof savedPos.time === 'number' && savedPos.time > 0) {
              player.seekTo(savedPos.time, true);
            }
          }, 500);
        } else {
          // Fresh session — pick a random track and random position
          // The playlist has ~20 tracks; pick a random index
          const randomIndex = Math.floor(Math.random() * 20);
          player.playVideoAt(randomIndex);
          setTimeout(() => {
            const duration = player.getDuration();
            if (duration > 0) {
              player.seekTo(Math.random() * duration, true);
            }
          }, 500);
        }
      }

      try {
        playerRef.current = new YT.Player(el, {
          height: '1',
          width: '1',
          playerVars: {
            list: 'RDbIOiV4d1SVI',
            listType: 'playlist',
            autoplay: 1,
            loop: 1,
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
            },
            onStateChange: (e: YT.PlayerEvent & { data: number }) => {
              // YT.PlayerState.PLAYING === 1
              if (e.data === 1 && !started) onStarted(e.target);
              // YT.PlayerState.ENDED === 0 — loop the playlist
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
          const index = player.getPlaylistIndex();
          if (time > 0) {
            sessionStorage.setItem(
              'minecraft-music-pos',
              JSON.stringify({ time, index, ts: Date.now() }),
            );
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
