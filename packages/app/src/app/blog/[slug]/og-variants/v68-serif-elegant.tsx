/**
 * V68: Serif Elegant — Simulate a serif/editorial feel with thin decorative horizontal
 * rules above and below the title. Lighter font weight (400), generous lineHeight (1.5).
 * Cream text (#faf5e4) on charcoal (#1a1a1a). Literary/refined.
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
        backgroundColor: '#1a1a1a',
        padding: '60px 80px',
        justifyContent: 'space-between',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex' }}>
        <img src={logoSrc} width={130} height={34} />
      </div>

      {/* Title section with decorative rules */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Top decorative rule */}
        <div
          style={{
            display: 'flex',
            width: '80px',
            height: '1px',
            backgroundColor: '#faf5e4',
            opacity: 0.4,
            marginBottom: '32px',
          }}
        />

        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 400,
            color: '#faf5e4',
            lineHeight: 1.5,
            textAlign: 'center',
            letterSpacing: '1px',
          }}
        >
          {meta.title}
        </div>

        {/* Bottom decorative rule */}
        <div
          style={{
            display: 'flex',
            width: '80px',
            height: '1px',
            backgroundColor: '#faf5e4',
            opacity: 0.4,
            marginTop: '32px',
          }}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: 20,
          color: '#faf5e4',
          opacity: 0.5,
          letterSpacing: '1px',
        }}
      >
        <div style={{ display: 'flex' }}>{meta.author}</div>
        <div
          style={{
            display: 'flex',
            marginLeft: '20px',
            marginRight: '20px',
            fontSize: 14,
          }}
        >
          |
        </div>
        <div style={{ display: 'flex' }}>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </div>
      </div>
    </div>,
    size,
  );
}
