import { getImageProps } from 'next/image';

export const HERO_IMAGE_WIDTH = 1200;
export const HERO_IMAGE_HEIGHT = 675;
// The hero figure is `max-w-sm` (24rem) and full width below that.
export const HERO_IMAGE_SIZES = '(min-width: 24rem) 24rem, 100vw';

/**
 * The versioned copy of a hero PNG URL: `…/performance-per-dollar.png` becomes
 * `…/performance-per-dollar/<version>.png`, a separate ISR entry per version.
 */
export function versionedHeroImageSrc(src: string, version: string): string {
  return `${src.replace(/\.png$/u, '')}/${version}.png`;
}

/**
 * `/_next/image` webp candidates for a hero PNG, sized for the figure. They point at the
 * versioned PNG URL because browsers keep optimized images for `images.minimumCacheTTL`: a new
 * version is a new URL whose PNG is rendered fresh, so an ingest that redraws the chart is not
 * hidden behind a day-old webp. The path carries no query, so Next's default
 * `images.localPatterns` accepts it.
 */
export function heroImageSrcSet(src: string, version: string): string | undefined {
  return getImageProps({
    src: versionedHeroImageSrc(src, version),
    alt: '',
    width: HERO_IMAGE_WIDTH,
    height: HERO_IMAGE_HEIGHT,
    sizes: HERO_IMAGE_SIZES,
  }).props.srcSet;
}
