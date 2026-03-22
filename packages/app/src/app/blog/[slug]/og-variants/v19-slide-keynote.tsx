/**
 * V19: Slide Keynote — Full dark slide with gold title treatment. Gold chart-title style for
 * the post title, white subtitle, grid background, gold bottom bar with logo.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const CHARCOAL = '#454646';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 66;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: CHARCOAL,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Faint grid background */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={`h${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: i * 80 + 40,
            width: '100%',
            height: 1,
            backgroundColor: '#D9D9D908',
            display: 'flex',
          }}
        />
      ))}
      {Array.from({ length: 15 }).map((_, i) => (
        <div
          key={`v${i}`}
          style={{
            position: 'absolute',
            left: i * 80 + 40,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: '#D9D9D906',
            display: 'flex',
          }}
        />
      ))}

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          padding: '0 70px',
          gap: 20,
        }}
      >
        {/* Gold title */}
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.15, color: GOLD }}>
          {meta.title}
        </div>

        {/* White italic subtitle */}
        <div
          style={{
            fontSize: 28,
            color: '#FFFFFF',
            lineHeight: 1.4,
            fontStyle: 'italic',
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 130 ? meta.excerpt.slice(0, 130) + '…' : meta.excerpt}
        </div>

        {/* Author + date */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            fontSize: 24,
            color: '#BFBFBF',
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <span>{meta.author}</span>
          <span style={{ color: '#656B72' }}>|</span>
          <span>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#656B72' }}>|</span>
          <span>{meta.readingTime} min read</span>
          {meta.tags &&
            meta.tags.slice(0, 3).map((tag) => (
              <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 10,
                    backgroundColor: GOLD,
                    display: 'flex',
                  }}
                />
                <span style={{ fontSize: 20, color: '#BFBFBF' }}>{tag}</span>
              </span>
            ))}
        </div>
      </div>

      {/* Gold bottom bar with logo */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 52,
          backgroundColor: GOLD,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
        }}
      >
        <img src={logoSrc} height={28} />
        <span style={{ fontSize: 24, color: CHARCOAL, fontWeight: 500 }}>InferenceX Blog</span>
      </div>
    </div>,
    size,
  );
}
