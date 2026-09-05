'use client';

import type { CSSProperties } from 'react';

import { ThemedFigureImage } from '@/components/blog/themed-figure-image';
import { Badge } from '@/components/ui/badge';
import type { PostThumbnail } from '@/lib/blog';
import { cn } from '@/lib/utils';

export interface BlogThumbnailProps {
  /** Per-theme figure paths from `getPostThumbnail`; null renders the text-free tile. */
  thumbnail: PostThumbnail | null;
  /** First tag of the post, shown as a badge in the tile's corner. */
  tag?: string;
  /** Eager-load the figure (featured card and first row of the index). */
  priority?: boolean;
  className?: string;
}

const IMG_CLASS =
  'block h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]';

/** Dot grid from the whitepaper hero, drawn in the current text colour so it
 *  follows the theme. Faded toward the bottom-right like the original. */
const TILE_MASK =
  'linear-gradient(115deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.35) 55%, transparent 90%)';

const TILE_DOTS_STYLE: CSSProperties = {
  backgroundImage: 'radial-gradient(circle at center, currentColor 1px, transparent 1.2px)',
  backgroundSize: '20px 20px',
  maskImage: TILE_MASK,
  WebkitMaskImage: TILE_MASK,
};

/** Soft primary glow in the top-right corner, kept inside the box so nothing
 *  leaks past the card edge. */
const TILE_GLOW_STYLE: CSSProperties = {
  background:
    'radial-gradient(circle at 88% 8%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 55%)',
};

const TILE_LINES_STYLE: CSSProperties = {
  backgroundImage:
    'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
  backgroundSize: '80px 80px, 80px 80px',
  maskImage: TILE_MASK,
  WebkitMaskImage: TILE_MASK,
};

/**
 * 1200/630 thumbnail box for article cards. Uses the post's first figure when
 * one exists (per theme when light/dark variants are paired); otherwise a
 * textured tile with only the first tag, so the card title is never repeated
 * inside the image.
 */
export function BlogThumbnail({ thumbnail, tag, priority = false, className }: BlogThumbnailProps) {
  const loading = priority ? 'eager' : 'lazy';
  return (
    <div
      className={cn('relative aspect-[1200/630] w-full overflow-hidden bg-background', className)}
      data-testid={thumbnail ? 'blog-thumbnail-figure' : 'blog-thumbnail-tile'}
    >
      {thumbnail ? (
        thumbnail.light && thumbnail.dark && thumbnail.light !== thumbnail.dark ? (
          <ThemedFigureImage
            srcLight={thumbnail.light}
            srcDark={thumbnail.dark}
            alt=""
            loading={loading}
            className={IMG_CLASS}
          />
        ) : (
          <img
            src={thumbnail.dark ?? thumbnail.light}
            alt=""
            width={1200}
            height={630}
            loading={loading}
            decoding="async"
            className={IMG_CLASS}
          />
        )
      ) : (
        <div aria-hidden="true" className="absolute inset-0">
          <div className="absolute inset-0 text-foreground/15" style={TILE_DOTS_STYLE} />
          <div className="absolute inset-0 text-foreground/5" style={TILE_LINES_STYLE} />
          <div className="absolute inset-0" style={TILE_GLOW_STYLE} />
          {tag && (
            <Badge
              variant="outline"
              className="absolute bottom-3 left-3 bg-card/80 text-muted-foreground backdrop-blur-[2px]"
            >
              {tag}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
