'use client';

import { useEffect, useRef, useState } from 'react';

/** Adult Swim's official upload of the Rick and Morty Seasons 1-3 opening credits.
 * Short enough that a plain loop covers the whole audio bed — no song-picker
 * needed (unlike the Minecraft OST compilation). */
const RM_INTRO_VIDEO_ID = 'DLaqu2QJYPY';

let userHasInteracted = false;
if (typeof document !== 'undefined') {
  const markInteracted = () => {
    userHasInteracted = true;
  };
  document.addEventListener('pointerdown', markInteracted, { capture: true, once: true });
  document.addEventListener('keydown', markInteracted, { capture: true, once: true });
}

function getInitialMusicStart(): number {
  try {
    const raw = sessionStorage.getItem('rick-morty-music-pos');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts < 30_000 && typeof parsed.time === 'number' && parsed.time > 0) {
        return Math.floor(parsed.time);
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return 0;
}

/**
 * Streams the Rick and Morty intro song from YouTube whenever the
 * rick-morty theme is active and the user hasn't muted music. Mirrors
 * the audio path of `minecraft-background.tsx` (invisible 1×1 iframe,
 * autoplay nudge on first user gesture, sessionStorage position save)
 * but without the 3D scene — rick-morty's visuals are static cutouts
 * plus the Jerry-fall GIF, both of which live in
 * `rick-morty-decorations.tsx`.
 */
export function RickMortyAudio() {
  const [isRickMorty, setIsRickMorty] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const playerRef = useRef<YT.Player | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const nudgeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    function check() {
      setIsRickMorty(document.documentElement.classList.contains('rick-morty'));
    }
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function check() {
      setMusicEnabled(localStorage.getItem('rick-morty-music') !== 'false');
    }
    check();
    window.addEventListener('rick-morty-music-toggle', check);
    return () => window.removeEventListener('rick-morty-music-toggle', check);
  }, []);

  const showMusic = isRickMorty && musicEnabled;

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
          sessionStorage.setItem('rick-morty-music-pos', JSON.stringify({ time, ts: Date.now() }));
        }
      } catch {
        /* player may not be ready */
      }
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
          sessionStorage.setItem('rick-morty-music-pos', JSON.stringify({ time, ts: Date.now() }));
        }
      } catch {
        /* ignore */
      }
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
          videoId: RM_INTRO_VIDEO_ID,
          playerVars: {
            autoplay: 1,
            loop: 1,
            playlist: RM_INTRO_VIDEO_ID,
            start: startSeconds,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
          },
          events: {
            onReady: (e: YT.PlayerEvent) => {
              e.target.setVolume(35);
              e.target.playVideo();
              document.addEventListener('pointerdown', nudge, true);
              document.addEventListener('keydown', nudge, true);
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
              if (e.data === 1 && !started) onStarted();
              if (e.data === 0) e.target.playVideo();
            },
          },
        });
      } catch {
        // YouTube API failed (blocked) — degrade silently
      }
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
            sessionStorage.setItem(
              'rick-morty-music-pos',
              JSON.stringify({ time, ts: Date.now() }),
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

  if (!isRickMorty) return null;

  return (
    <div
      ref={wrapperRef}
      className="fixed"
      style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none', zIndex: -1 }}
    />
  );
}
