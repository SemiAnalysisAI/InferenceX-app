/**
 * V92: Ribbon Banner — diagonal ribbon across the top-right corner with reading time. Overlapping divs create a ribbon fold effect. Gold ribbon on dark background.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#111827',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ribbon — main diagonal band */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: -60,
          top: 50,
          width: 340,
          height: 44,
          backgroundColor: '#b45309',
          transform: 'rotate(40deg)',
          transformOrigin: 'center center',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}
      >
        <span style={{ color: '#fef3c7', fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
          {meta.readingTime} MIN READ
        </span>
      </div>

      {/* Ribbon fold shadow — left side */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 172,
          top: 112,
          width: 0,
          height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderTop: '14px solid #78350f',
          transform: 'rotate(40deg)',
          zIndex: 19,
        }}
      />

      {/* Ribbon fold shadow — right side */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: -8,
          top: -10,
          width: 0,
          height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderBottom: '14px solid #78350f',
          transform: 'rotate(40deg)',
          zIndex: 19,
        }}
      />

      {/* Secondary ribbon — thinner accent band */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: -50,
          top: 28,
          width: 320,
          height: 6,
          backgroundColor: '#d97706',
          transform: 'rotate(40deg)',
          opacity: 0.5,
          zIndex: 18,
        }}
      />

      {/* Tertiary ribbon — thinner accent band below */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: -70,
          top: 108,
          width: 360,
          height: 4,
          backgroundColor: '#d97706',
          transform: 'rotate(40deg)',
          opacity: 0.3,
          zIndex: 18,
        }}
      />

      {/* Subtle warm accent circle */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 20,
          top: 20,
          width: 200,
          height: 200,
          borderRadius: 9999,
          backgroundColor: '#92400e',
          opacity: 0.06,
        }}
      />

      {/* Decorative thin line along left edge */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          top: 0,
          width: 3,
          height: '100%',
          backgroundColor: '#d97706',
          opacity: 0.2,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span style={{ color: '#fbbf24', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#f9fafb',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#d1d5db',
              lineHeight: 1.5,
              opacity: 0.8,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#fbbf24', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#374151', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#9ca3af', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#374151', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#9ca3af', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
