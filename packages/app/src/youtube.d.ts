/** Minimal YouTube IFrame API types for the minecraft music player. */

interface Window {
  onYouTubeIframeAPIReady?: (() => void) | undefined;
}

declare namespace YT {
  interface PlayerEvent {
    target: Player;
  }

  interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (event: PlayerEvent) => void;
      onStateChange?: (event: PlayerEvent & { data: number }) => void;
    };
  }

  class Player {
    constructor(element: HTMLElement | string, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    setVolume(volume: number): void;
    getVolume(): number;
    getDuration(): number;
    getCurrentTime(): number;
    getPlaylistIndex(): number;
    seekTo(seconds: number, allowSeekAhead?: boolean): void;
    playVideoAt(index: number): void;
    destroy(): void;
  }
}
