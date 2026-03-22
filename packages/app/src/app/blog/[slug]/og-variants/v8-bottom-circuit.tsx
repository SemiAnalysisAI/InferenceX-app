/**
 * V8: Bottom Circuit — Circuit pattern as a footer strip, gold accent line separating.
 * Content heavy at top, decorative element grounds the bottom.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 56 : meta.title.length > 40 ? 64 : 72;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0c0e',
        color: '#fafafa',
        overflow: 'hidden',
      }}
    >
      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '50px 60px 30px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <img src={logoSrc} height={96} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
          <div
            style={{
              fontSize: 28,
              color: '#a1a1aa',
              lineHeight: 1.4,
              maxHeight: 80,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '...' : meta.excerpt}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, fontSize: 24, color: '#a1a1aa' }}>
          <span>{meta.author}</span>
          <span>·</span>
          <span>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span>·</span>
          <span>{meta.readingTime} min read</span>
          {meta.tags &&
            meta.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  backgroundColor: '#27272a',
                  padding: '4px 12px',
                  borderRadius: 9999,
                  fontSize: 20,
                }}
              >
                {tag}
              </span>
            ))}
        </div>
      </div>

      {/* Gold separator */}
      <div style={{ display: 'flex', width: '100%', height: 3, backgroundColor: '#eab308' }} />

      {/* Bottom circuit bar */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 120,
          backgroundColor: '#0a1a18',
          position: 'relative',
        }}
      >
        {Array.from({ length: 12 }).map((_, i) => {
          const isGold = i === 3 || i === 8;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 15 + i * 100,
                top: 15,
                width: 80,
                height: 90,
                border: `1.5px solid ${isGold ? '#eab30835' : '#2dd4bf20'}`,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 30 + (i % 3) * 8,
                  height: 30 + (i % 4) * 6,
                  border: `1px solid ${isGold ? '#eab30825' : '#2dd4bf12'}`,
                  borderRadius: 2,
                  display: 'flex',
                }}
              />
            </div>
          );
        })}
        {/* Horizontal trace lines */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 40,
            width: '100%',
            height: 1,
            backgroundColor: '#2dd4bf10',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 80,
            width: '100%',
            height: 1,
            backgroundColor: '#2dd4bf10',
            display: 'flex',
          }}
        />
      </div>
    </div>,
    size,
  );
}
