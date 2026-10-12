// Client-safe helpers for article-card thumbnails. Kept apart from `blog.ts`,
// which reads the filesystem and cannot be imported from client components.

/** Widths requested from the Next image optimizer for article-card thumbnails.
 *  Both are in Next's default `deviceSizes`, so they resolve without config. */
export const THUMBNAIL_WIDTHS = { tile: 640, card: 1200 } as const;

/**
 * Route a validated thumbnail source through `/_next/image` so cards ship a
 * resized WebP instead of the multi-megabyte figure PNG. Works for both local
 * `/images/...` paths and the allow-listed remote host in `next.config.ts`.
 */
export function optimizedThumbnailSrc(src: string, width: number): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}
