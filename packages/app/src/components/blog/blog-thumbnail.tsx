'use client';

import type { CSSProperties } from 'react';

import { ThemedFigureImage } from '@/components/blog/themed-figure-image';
import { Badge } from '@/components/ui/badge';
import type { PostThumbnail } from '@/lib/blog';
import { optimizedThumbnailSrc, THUMBNAIL_WIDTHS } from '@/lib/blog-thumbnail-src';
import { cn } from '@/lib/utils';

export interface BlogThumbnailProps {
  /** Per-theme figure paths from `getPostThumbnail`; null renders the text-free tile. */
  thumbnail: PostThumbnail | null;
  /** First tag of the post, shown as a badge in the tile's corner. */
  tag?: string;
  /** Reading-time label, shown top-right in the tile. */
  readingLabel?: string;
  /** Eager-load the figure (featured card and first row of the index). */
  priority?: boolean;
  /** `tile` is a grid card (one third of the row); `card` is the featured post. */
  variant?: 'tile' | 'card';
  className?: string;
}

const TILE_SIZES = '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw';
const CARD_SIZES = '(min-width: 1024px) 50vw, 100vw';

const IMG_CLASS =
  'block h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]';

/** Dot grid and line grid from the whitepaper hero, drawn in the current text
 *  colour so they follow the theme. The mask fades toward the bottom-right in
 *  the tile and toward the right on the featured card. */
const TILE_MASK =
  'linear-gradient(115deg, rgba(0, 0, 0, 0.9), rgba(0, 0, 0, 0.4) 55%, rgba(0, 0, 0, 0.08) 90%)';
const CARD_MASK =
  'linear-gradient(90deg, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.2) 55%, transparent 85%)';

const DOTS_STYLE: CSSProperties = {
  backgroundImage: 'radial-gradient(circle at center, currentColor 1px, transparent 1.2px)',
  backgroundSize: '20px 20px',
};

const LINES_STYLE: CSSProperties = {
  backgroundImage:
    'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
  backgroundSize: '80px 80px, 80px 80px',
};

/** Soft primary glow in the top-right corner, kept inside the box so nothing
 *  leaks past the card edge. */
const GLOW_STYLE: CSSProperties = {
  background:
    'radial-gradient(circle at 88% 8%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 55%)',
};

interface GridTextureProps {
  /** `tile` fades toward the bottom-right; `card` fades toward the right edge. */
  variant: 'tile' | 'card';
  className?: string;
}

/** Decorative grid layer. Positioned absolutely; the parent must be `relative`. */
export function BlogGridTexture({ variant, className }: GridTextureProps) {
  const mask = variant === 'tile' ? TILE_MASK : CARD_MASK;
  const maskStyle: CSSProperties = { maskImage: mask, WebkitMaskImage: mask };
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0', className)}>
      <div
        className={cn(
          'absolute inset-0',
          variant === 'tile' ? 'text-foreground/25' : 'text-foreground/15',
        )}
        style={{ ...DOTS_STYLE, ...maskStyle }}
      />
      <div
        className={cn(
          'absolute inset-0',
          variant === 'tile' ? 'text-foreground/8' : 'text-foreground/5',
        )}
        style={{ ...LINES_STYLE, ...maskStyle }}
      />
      {variant === 'tile' && <div className="absolute inset-0" style={GLOW_STYLE} />}
    </div>
  );
}

/**
 * Thumbnail box for article cards. Uses the post's first figure at 1200/630
 * when one exists (per theme when light/dark variants are paired); otherwise
 * a shorter 3/1 textured tile carrying only the first tag and the reading
 * time, so the card title is never repeated inside the image.
 */
export function BlogThumbnail({
  thumbnail,
  tag,
  readingLabel,
  priority = false,
  variant = 'tile',
  className,
}: BlogThumbnailProps) {
  const loading = priority ? 'eager' : 'lazy';
  const width = variant === 'card' ? THUMBNAIL_WIDTHS.card : THUMBNAIL_WIDTHS.tile;
  if (!thumbnail) {
    return (
      <div
        className={cn('relative aspect-[3/1] w-full overflow-hidden bg-background', className)}
        data-testid="blog-thumbnail-tile"
      >
        <BlogGridTexture variant="tile" />
        {readingLabel && (
          <span
            aria-hidden="true"
            className="absolute top-3 right-3 font-mono text-xs text-muted-foreground tabular-nums"
          >
            {readingLabel}
          </span>
        )}
        {tag && (
          <Badge
            variant="outline"
            aria-hidden="true"
            className="absolute bottom-3 left-3 bg-card/80 text-muted-foreground backdrop-blur-[2px]"
          >
            {tag}
          </Badge>
        )}
      </div>
    );
  }
  const single = thumbnail.dark ?? thumbnail.light;
  return (
    <div
      className={cn('relative aspect-[1200/630] w-full overflow-hidden bg-background', className)}
      data-testid="blog-thumbnail-figure"
    >
      {thumbnail.light && thumbnail.dark && thumbnail.light !== thumbnail.dark ? (
        <ThemedFigureImage
          srcLight={optimizedThumbnailSrc(thumbnail.light, width)}
          srcDark={optimizedThumbnailSrc(thumbnail.dark, width)}
          alt=""
          loading={loading}
          className={IMG_CLASS}
        />
      ) : single ? (
        <img
          src={optimizedThumbnailSrc(single, width)}
          srcSet={`${optimizedThumbnailSrc(single, THUMBNAIL_WIDTHS.tile)} ${THUMBNAIL_WIDTHS.tile}w, ${optimizedThumbnailSrc(single, THUMBNAIL_WIDTHS.card)} ${THUMBNAIL_WIDTHS.card}w`}
          sizes={variant === 'card' ? CARD_SIZES : TILE_SIZES}
          alt=""
          width={1200}
          height={630}
          loading={loading}
          decoding="async"
          className={IMG_CLASS}
        />
      ) : null}
    </div>
  );
}
