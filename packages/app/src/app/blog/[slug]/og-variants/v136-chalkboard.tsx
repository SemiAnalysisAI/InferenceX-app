/**
 * V136: Chalkboard — Dark green board with chalk dust dots, white chalk text, eraser, and dashed underlines.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  /* Chalk dust dots — scattered across the board */
  const dustDots = Array.from({ length: 40 }, (_, i) => ({
    left: ((i * 97 + 31) % 1160) + 20,
    top: ((i * 53 + 17) % 590) + 20,
    size: (i % 3) + 1,
    opacity: 0.08 + (i % 5) * 0.03,
  }));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#1a2e1a',
        color: '#e8e4dc',
        fontFamily: 'serif',
        position: 'relative',
        flexDirection: 'column',
      }}
    >
      {/* Chalk dust particles */}
      {dustDots.map((dot, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            backgroundColor: `rgba(255,255,255,${dot.opacity})`,
            borderRadius: '50%',
          }}
        />
      ))}

      {/* Wooden frame — top */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '14px',
          backgroundColor: '#3d2b1f',
          borderBottom: '2px solid #5a3d2b',
        }}
      />

      {/* Board content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '40px 60px',
          position: 'relative',
        }}
      >
        {/* Top chalk line */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '1px',
            backgroundColor: 'rgba(255,255,255,0.25)',
            marginBottom: '30px',
          }}
        />

        {/* Date — written in chalk */}
        <div style={{ display: 'flex', marginBottom: '12px' }}>
          <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        </div>

        {/* Title — chalk text */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '20px' }}>
          <span
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#ffffff',
              letterSpacing: '0.02em',
            }}
          >
            {meta.title}
          </span>
          {/* Dashed underline under title */}
          <div
            style={{
              display: 'flex',
              width: '80%',
              height: '2px',
              borderBottom: '2px dashed rgba(255,255,255,0.35)',
              marginTop: '8px',
            }}
          />
        </div>

        {/* Excerpt */}
        <div style={{ display: 'flex', marginBottom: '16px' }}>
          <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
            {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '\u2026' : meta.excerpt}
          </span>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: '16px' }}>
            {meta.tags.map((tag, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  border: '1px dashed rgba(255,255,255,0.3)',
                  padding: '4px 12px',
                  marginRight: '8px',
                  marginBottom: '6px',
                  borderRadius: '2px',
                }}
              >
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{tag}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bottom chalk line */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '1px',
            backgroundColor: 'rgba(255,255,255,0.25)',
            position: 'absolute',
            bottom: '60px',
            left: '60px',
            right: '60px',
          }}
        />

        {/* Author and reading time */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '25px',
            left: '60px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)' }}>
            {meta.author} &middot; {meta.readingTime} min read
          </span>
        </div>

        {/* Eraser — bottom right */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            bottom: '18px',
            right: '60px',
          }}
        >
          {/* Eraser felt */}
          <div
            style={{
              display: 'flex',
              width: '70px',
              height: '12px',
              backgroundColor: '#8a8a8a',
              borderRadius: '1px',
            }}
          />
          {/* Eraser body */}
          <div
            style={{
              display: 'flex',
              width: '70px',
              height: '22px',
              backgroundColor: '#c8a84e',
              borderRadius: '2px',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 8, color: '#3d2b1f', letterSpacing: '0.1em' }}>ERASER</span>
          </div>
        </div>

        {/* Logo — top right */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '24px',
            right: '60px',
            alignItems: 'center',
          }}
        >
          <img src={logoSrc} width={20} height={20} />
          <span
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.35)',
              marginLeft: '6px',
              letterSpacing: '0.12em',
            }}
          >
            INFERENCEX
          </span>
        </div>
      </div>

      {/* Wooden frame — bottom */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '14px',
          backgroundColor: '#3d2b1f',
          borderTop: '2px solid #5a3d2b',
        }}
      />
    </div>,
    size,
  );
}
