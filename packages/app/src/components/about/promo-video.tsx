'use client';

import { Play } from 'lucide-react';
import { useRef, useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

const PROMO_VIDEO_SRC =
  'https://yig6saydz8oscerh.public.blob.vercel-storage.com/media/inferencex-promo-v1-1440p-B9VFFfZ9V0Hl7tciu0F0aLrRW4WbKD.mp4';
const PROMO_POSTER_SRC = '/promo-poster.webp';

const STRINGS = {
  en: {
    play: 'Play the InferenceX overview video',
    fallback: 'Your browser cannot play this video.',
    download: 'Download the video instead',
  },
  zh: {
    play: '播放 InferenceX 概览视频',
    fallback: '您的浏览器无法播放此视频。',
    download: '直接下载视频',
  },
} as const;

export function PromoVideo() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function handlePlay() {
    setStarted(true);
    track('about_promo_video_play');
    void videoRef.current?.play();
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/40 bg-black">
      <video
        ref={videoRef}
        className="size-full"
        poster={PROMO_POSTER_SRC}
        preload="none"
        playsInline
        controls={started}
        aria-label={t.play}
        onPlay={() => setStarted(true)}
      >
        <source src={PROMO_VIDEO_SRC} type="video/mp4" />
        <p className="p-4 text-sm text-muted-foreground">
          {t.fallback}{' '}
          <a href={PROMO_VIDEO_SRC} className="text-brand hover:underline">
            {t.download}
          </a>
        </p>
      </video>

      {!started && (
        <button
          type="button"
          onClick={handlePlay}
          aria-label={t.play}
          className="group absolute inset-0 flex cursor-pointer items-center justify-center bg-black/20 transition-colors hover:bg-black/10"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-background/80 shadow-lg backdrop-blur-sm transition-transform group-hover:scale-110 md:size-20">
            <Play className="ml-1 size-7 fill-foreground text-foreground md:size-9" />
          </span>
        </button>
      )}
    </div>
  );
}
