import { getImageProps } from 'next/image';

export const HERO_IMAGE_WIDTH = 1200;
export const HERO_IMAGE_HEIGHT = 675;
// The hero figure is `max-w-sm` (24rem) and full width below that.
export const HERO_IMAGE_SIZES = '(min-width: 24rem) 24rem, 100vw';

/**
 * `/_next/image` webp candidates for a hero PNG, sized for the figure. The PNG URL inside them
 * carries `?v=<version>` (the PNG route ignores it) because browsers keep optimized images for
 * `images.minimumCacheTTL`: a new version is a new URL, so an ingest that redraws the PNG is not
 * hidden behind a day-old webp. `next.config.ts` allows that query in `images.localPatterns`.
 */
export function heroImageSrcSet(src: string, version: string): string | undefined {
  return getImageProps({
    src: `${src}?v=${encodeURIComponent(version)}`,
    alt: '',
    width: HERO_IMAGE_WIDTH,
    height: HERO_IMAGE_HEIGHT,
    sizes: HERO_IMAGE_SIZES,
  }).props.srcSet;
}
