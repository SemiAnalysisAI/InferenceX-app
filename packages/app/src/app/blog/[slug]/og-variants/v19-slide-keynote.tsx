/**
 * V19: Slide Keynote — Full dark slide with gold title treatment, matching how
 * SemiAnalysis styles chart titles in presentations. Gold chart-title style for
 * the post title, white subtitle, grid background, gold bottom bar with brand.
 */
import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BLUE = '#0B86D1';
const CHARCOAL = '#454646';

export function renderOgImage(meta: BlogPostMeta) {
  const titleSize = meta.title.length > 60 ? 40 : meta.title.length > 40 ? 50 : 60;

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
        {/* Gold title — like SemiAnalysis chart titles */}
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.15, color: GOLD }}>
          {meta.title}
        </div>

        {/* White italic subtitle — like chart subtitles */}
        <div
          style={{
            fontSize: 24,
            color: '#FFFFFF',
            lineHeight: 1.4,
            fontStyle: 'italic',
            maxHeight: 70,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 150 ? meta.excerpt.slice(0, 150) + '…' : meta.excerpt}
        </div>

        {/* Author + date */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            fontSize: 17,
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
                    width: 8,
                    height: 8,
                    borderRadius: 8,
                    backgroundColor: GOLD,
                    display: 'flex',
                  }}
                />
                <span style={{ fontSize: 14, color: '#BFBFBF' }}>{tag}</span>
              </span>
            ))}
        </div>
      </div>

      {/* Gold bottom bar with brand */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 48,
          backgroundColor: GOLD,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: BLUE }}>semi</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: CHARCOAL }}>analysis</span>
        </div>
        <span style={{ fontSize: 14, color: CHARCOAL, fontWeight: 500 }}>InferenceX Blog</span>
      </div>
    </div>,
    size,
  );
}
